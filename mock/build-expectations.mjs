// Genereert de MockServer-expectations uit de spec (enige bron) en de templates in mock/templates.
// Gebruik: node build-expectations.mjs <spec.yaml> <templatesdir> <uitvoerdir> <spec-pad-in-container>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import yaml from 'js-yaml';

const [spec, tpl, out, specInContainer] = process.argv.slice(2);
const doc = yaml.load(readFileSync(spec, 'utf8'));
const apiVersion = doc.info.version;
const lib = readFileSync(`${tpl}/lib.js`, 'utf8').replace("var API_VERSION = '1.1.0';", `var API_VERSION = '${apiVersion}';`);
mkdirSync(out, { recursive: true });

const probleem = (status, slug, title, detail) => ({
  statusCode: status,
  headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [apiVersion] },
  body: { type: `https://diftar-api.example/problemen/${slug}`, title, status, detail },
});

const operatie = (specPad, operationId, bestand) => ({
  httpRequest: { specUrlOrPayload: specPad, operationId },
  httpResponseTemplate: { templateType: 'JAVASCRIPT', template: `${lib}\n${readFileSync(`${tpl}/${bestand}`, 'utf8')}` },
});

// Vangnet: een aanvraag die de spec niet matcht krijgt 400 problem+json (priority -1).
const vangnet = (path) => ({
  priority: -2,
  httpRequest: { method: 'GET', path },
  httpResponse: probleem(400, 'ongeldige-aanvraag', 'Ongeldige aanvraag', 'Ongeldige of ontbrekende parameters of headers; zie de OpenAPI-specificatie.'),
});

const specJson = JSON.stringify(doc);
const openapi = {
  httpRequest: { method: 'GET', path: '/v1/openapi.json' },
  httpResponse: { statusCode: 200, headers: { 'Content-Type': ['application/json'], 'API-Version': [apiVersion], 'Access-Control-Allow-Origin': ['*'] }, body: specJson },
};
// Zonder Authorization-header (alleen in modus met authenticatie): 401 problem+json.
const nietGeauthenticeerd = (path) => ({
  priority: -1,
  httpRequest: { method: 'GET', path, headers: { '!Authorization': ['.*'] } },
  httpResponse: { ...probleem(401, 'niet-geautoriseerd', 'Niet geautoriseerd', 'Ontbrekend access token: stuur een Authorization: Bearer-header mee.'), headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [apiVersion], 'WWW-Authenticate': ['Bearer'] } },
});

// Modus keycloak: de spec geldt zoals die is (Authorization-header verplicht). Het token zelf wordt niet gecontroleerd.
// Modus none: dezelfde spec zonder security-eisen, zodat een aanvraag zonder Authorization-header ook slaagt.
const zonderSecurity = structuredClone(doc);
delete zonderSecurity.security;
for (const pad of Object.values(zonderSecurity.paths)) for (const op of Object.values(pad)) delete op.security;
writeFileSync(`${out}/spec-none.json`, JSON.stringify(zonderSecurity));

const gemeenschappelijk = [openapi, vangnet('/v1/ledigingen'), vangnet('/v1/stortingen')];
writeFileSync(`${out}/expectations-keycloak.json`, JSON.stringify([
  operatie(specInContainer, 'getLedigingen', 'ledigingen.js'), operatie(specInContainer, 'getStortingen', 'stortingen.js'),
  nietGeauthenticeerd('/v1/ledigingen'), nietGeauthenticeerd('/v1/stortingen'), ...gemeenschappelijk], null, 2));
writeFileSync(`${out}/expectations-none.json`, JSON.stringify([
  operatie('/config/spec-none.json', 'getLedigingen', 'ledigingen.js'), operatie('/config/spec-none.json', 'getStortingen', 'stortingen.js'),
  ...gemeenschappelijk], null, 2));
console.log(`expectations geschreven (API ${apiVersion}): none en keycloak`);
