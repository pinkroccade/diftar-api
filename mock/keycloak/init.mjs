// Genereert (eenmalig) een sleutelpaar voor de voorbeeldclients en schrijft de realm-import.
// De privesleutel blijft lokaal in mock/keycloak/keys/ (staat in .gitignore) en komt nooit in een realm-bestand.
// Gebruik: node init.mjs <keysdir> <realm.template.json> <uitvoerdir>
import { generateKeyPairSync, createPrivateKey, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const [keysDir, template, out] = process.argv.slice(2);
mkdirSync(keysDir, { recursive: true });
mkdirSync(out, { recursive: true });
const keyFile = `${keysDir}/client.key.pem`;
if (!existsSync(keyFile)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  console.log(`sleutelpaar aangemaakt: ${keyFile}`);
}
const jwk = createPrivateKey(readFileSync(keyFile)).export({ format: 'jwk' });
const kid = createHash('sha256').update(jwk.n + jwk.e).digest('base64url').slice(0, 16);
const jwks = JSON.stringify({ keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, n: jwk.n, e: jwk.e }] });
const realm = readFileSync(template, 'utf8').replace(/__JWKS__/g, () => jwks.replace(/"/g, '\\"'));
JSON.parse(realm); // controleert dat het resultaat geldige JSON is
writeFileSync(`${out}/gemeente-a-realm.json`, realm);
console.log(`realm geschreven: ${out}/gemeente-a-realm.json (kid ${kid})`);
