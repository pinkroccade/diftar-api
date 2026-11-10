// Genereert de MockServer-expectations uit de spec (enige bron), de templates en de dataset.
// Gebruik: node build-expectations.mjs <spec.yaml> <templatesdir> <dataset.json> <schema.json> <uitvoerdir> <mapnaam-in-container> [--watch]
// <mapnaam-in-container> is waar de uitvoer in de mock-container staat (voor de verwijzing naar spec-none.json).
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const [spec, tpl, datasetPad, schemaPad, out, ref] = process.argv.slice(2);
const watchModus = process.argv.includes('--watch');
const specInContainer = '/config/diftar-openapi.yaml';

const doc = yaml.load(readFileSync(spec, 'utf8'));
const apiVersion = doc.info.version;
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const valideer = ajv.compile(JSON.parse(readFileSync(schemaPad, 'utf8')));

function leesDataset() {
  let data;
  try { data = JSON.parse(readFileSync(datasetPad, 'utf8')); }
  catch (e) { throw new Error(`${datasetPad} is geen geldige JSON: ${e.message}`); }
  if (!valideer(data)) {
    const regels = valideer.errors.map((e) => `  - ${e.instancePath || '/'} ${e.message}`);
    throw new Error(`${datasetPad} voldoet niet aan het schema:\n${regels.join('\n')}`);
  }
  const gezien = new Set();
  data.adressen.forEach((a, i) => {
    const sleutels = [`adres ${a.postcode} ${a.huisnummer}${a.huisletter ?? ''}-${a.huisnummertoevoeging ?? ''}`, `BAG-id ${a.nummeraanduidingIdentificatie}`];
    for (const sleutel of sleutels) {
      if (gezien.has(sleutel)) throw new Error(`${datasetPad}: dubbel adres op /adressen/${i} (${sleutel})`);
      gezien.add(sleutel);
    }
  });
  return data;
}

const probleem = (status, slug, title, detail) => ({
  statusCode: status,
  headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [apiVersion] },
  body: { type: `https://diftar-api.example/problemen/${slug}`, title, status, detail },
});

function genereer() {
  const dataset = leesDataset();
  const lib = readFileSync(`${tpl}/lib.js`, 'utf8')
    .replace("var API_VERSION = '1.1.0';", `var API_VERSION = '${apiVersion}';`)
    .replace('__DATASET__', () => JSON.stringify(dataset.adressen));
  const operatie = (id, specPad, operationId, bestand) => ({
    id,
    httpRequest: { specUrlOrPayload: specPad, operationId },
    httpResponseTemplate: { templateType: 'JAVASCRIPT', template: `${lib}\n${readFileSync(`${tpl}/${bestand}`, 'utf8')}` },
  });
  // Vangnet: een aanvraag die de spec niet matcht krijgt 400 problem+json.
  const vangnet = (path) => ({
    id: `vangnet-400${path}`,
    priority: -2,
    httpRequest: { method: 'GET', path },
    httpResponse: probleem(400, 'ongeldige-aanvraag', 'Ongeldige aanvraag', 'Ongeldige of ontbrekende parameters of headers; zie de OpenAPI-specificatie.'),
  });
  // Zonder Authorization-header (alleen in modus keycloak): 401 problem+json.
  const nietGeauthenticeerd = (path) => ({
    id: `vangnet-401${path}`,
    priority: -1,
    httpRequest: { method: 'GET', path, headers: { '!Authorization': ['.*'] } },
    httpResponse: { ...probleem(401, 'niet-geautoriseerd', 'Niet geautoriseerd', 'Ontbrekend access token: stuur een Authorization: Bearer-header mee.'), headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [apiVersion], 'WWW-Authenticate': ['Bearer'] } },
  });
  const openapi = {
    id: 'openapi-json',
    httpRequest: { method: 'GET', path: '/v1/openapi.json' },
    httpResponse: { statusCode: 200, headers: { 'Content-Type': ['application/json'], 'API-Version': [apiVersion], 'Access-Control-Allow-Origin': ['*'] }, body: JSON.stringify(doc) },
  };
  // Modus none: dezelfde spec zonder security-eisen, zodat een aanvraag zonder Authorization-header ook slaagt.
  const zonderSecurity = structuredClone(doc);
  delete zonderSecurity.security;
  for (const pad of Object.values(zonderSecurity.paths)) for (const op of Object.values(pad)) delete op.security;

  const gemeenschappelijk = [openapi, vangnet('/v1/ledigingen'), vangnet('/v1/stortingen')];
  const none = [
    operatie('ledigingen', `${ref}/spec-none.json`, 'getLedigingen', 'ledigingen.js'),
    operatie('stortingen', `${ref}/spec-none.json`, 'getStortingen', 'stortingen.js'),
    ...gemeenschappelijk,
  ];
  const keycloak = [
    operatie('ledigingen', specInContainer, 'getLedigingen', 'ledigingen.js'),
    operatie('stortingen', specInContainer, 'getStortingen', 'stortingen.js'),
    nietGeauthenticeerd('/v1/ledigingen'), nietGeauthenticeerd('/v1/stortingen'),
    ...gemeenschappelijk,
  ];
  // Atomair schrijven: MockServer mag nooit een half bestand lezen.
  const schrijf = (naam, inhoud) => { writeFileSync(`${out}/${naam}.tmp`, inhoud); renameSync(`${out}/${naam}.tmp`, `${out}/${naam}`); };
  schrijf('spec-none.json', JSON.stringify(zonderSecurity));
  schrijf('expectations-none.json', JSON.stringify(none, null, 2));
  schrijf('expectations-keycloak.json', JSON.stringify(keycloak, null, 2));
  return `${dataset.adressen.length} adressen, API ${apiVersion}`;
}

mkdirSync(out, { recursive: true });
const probeer = () => {
  try { console.log(`[${new Date().toISOString()}] expectations geschreven: ${genereer()}`); return true; }
  catch (e) { console.error(`[${new Date().toISOString()}] FOUT, vorige expectations blijven actief:\n${e.message}`); return false; }
};
const ok = probeer();
if (!watchModus) process.exit(ok ? 0 : 1);

console.log(`Wacht op wijzigingen in ${datasetPad}`);
// Pollen op inhoud in plaats van fs.watch: bestandsevents komen niet door op bindmounts
// van Docker Desktop (Windows/macOS), en editors vervangen bestanden vaak door een nieuw bestand.
const vingerafdruk = () => { try { return createHash('sha1').update(readFileSync(datasetPad)).digest('hex'); } catch { return 'ontbreekt'; } };
let laatste = vingerafdruk();
setInterval(() => {
  const nu = vingerafdruk();
  if (nu !== laatste) { laatste = nu; probeer(); }
}, 1000);
