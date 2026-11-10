// Maakt een ondertekende client_assertion (private_key_jwt, RFC 7523) voor een token-aanvraag bij Keycloak.
// Gebruik: node assertion.mjs <client_id> [issuer-url] [key.pem]
import { createPrivateKey, sign, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [clientId, issuer = 'http://localhost:8080/realms/gemeente-a', keyFile = new URL('./keys/client.key.pem', import.meta.url)] = process.argv.slice(2);
if (!clientId) { console.error('gebruik: node assertion.mjs <client_id> [issuer-url] [key.pem]'); process.exit(1); }
const b64u = (b) => Buffer.from(b).toString('base64url');
const key = createPrivateKey(readFileSync(keyFile));
const jwk = key.export({ format: 'jwk' });
const kid = createHash('sha256').update(jwk.n + jwk.e).digest('base64url').slice(0, 16);
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'RS256', typ: 'JWT', kid };
// aud = issuer-URL; nieuwe jti per aanvraag; exp binnen 60 s
const payload = { iss: clientId, sub: clientId, aud: issuer, jti: randomUUID(), iat: now, exp: now + 60 };
const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
console.log(`${input}.${b64u(sign('RSA-SHA256', Buffer.from(input), key))}`);
