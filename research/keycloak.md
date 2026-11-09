# Onderzoek: Keycloak-voorbeeldinrichting voor client credentials

Beantwoordt [issue #9](https://github.com/pinkroccade/diftar-api/issues/9) (onderdeel van kaart #6). Datum onderzoek: 2026-11-10.

## Vraag

Hoe richt je een minimale Keycloak in (realm-export, clients, client scopes `diftar.ledigingen.lezen` en `diftar.stortingen.lezen`) voor OAuth2 Client Credentials, zodat een mock-service JWT's kan valideren? Inclusief realm-import bij opstarten, aanbevolen image en versie, opstarttijd, token- en JWKS-endpoints, hoe scopes in het token komen, voorbeeldaanroepen en valkuilen, en (uitgangspunt uit #7) `private_key_jwt` naast `client_secret`.

## Werkwijze en betrouwbaarheid

- Primaire bronnen: de documentatie en broncode van Keycloak zelf (GitHub `keycloak/keycloak`, tag `26.8.2`, de bron van keycloak.org/docs), keycloak.org, en de tag-lijst van quay.io. Bronnen staan per claim in de tekst.
- **Niets uitgevoerd of gemeten.** De onderzoeksomgeving had geen draaiende Docker-daemon. Opstarttijd is dus **niet gemeten** en de voorbeelden zijn **niet tegen een draaiende Keycloak getest**; ze zijn afgeleid uit documentatie en broncode. Alleen het hulpscript voor de `client_assertion` is lokaal gedraaid (het levert een JWT en een geldige JWKS-JSON op; acceptatie door Keycloak is niet getoetst). Een korte spike met `docker compose up` hoort bij de bouwticket (#16).
- Beveiligingscontract: `docs/adr/0001-client-credentials-security.md` en `diftar-openapi.yaml` (zie "Aansluiting op de spec en ADR").

## Antwoord in het kort

| Onderwerp | Bevinding |
| --- | --- |
| Image en versie | `quay.io/keycloak/keycloak:26.8.2` (nieuwste stabiele patch op 2026-11-09; de tag `26.8` volgt de patches). Pin op de volledige tag (liefst ook digest) en laat Renovate bijwerken. |
| Realm-import | `start --import-realm` (of `start-dev --import-realm`) met bestanden `<realm>-realm.json` in `/opt/keycloak/data/import`. Bestaat de realm al, dan wordt de import **overgeslagen**. |
| Token-endpoint | `POST {host}/realms/{realm}/protocol/openid-connect/token` |
| JWKS-endpoint | `GET {host}/realms/{realm}/protocol/openid-connect/certs` (`jwks_uri`) |
| Issuer / discovery | `{host}/realms/{realm}`; discovery op `{issuer}/.well-known/openid-configuration` |
| Scopes in het token | Client scope aan de client koppelen als *Default* (altijd) of *Optional* (alleen op verzoek via `scope=`), met *Include in token scope* aan. Dan staat de scope in de claim `scope`. |
| `private_key_jwt` | Client-authenticator `client-jwt` ("Signed JWT"); publieke sleutel via JWKS-URL, geimporteerd certificaat/public key of (alleen in de broncode, niet in de admin-gids) inline `jwks.string`. |
| Opstarttijd | Niet gemeten. Keycloak zegt wel dat een vooraf gebouwd (`build`) image het snelst start; de server start pas volledig na afloop van de import. |

## 1. Image, versie, opstarten

- De officiele quickstart gebruikt `quay.io/keycloak/keycloak:26.8.2` met `start-dev` en de admin-variabelen `KC_BOOTSTRAP_ADMIN_USERNAME` en `KC_BOOTSTRAP_ADMIN_PASSWORD` ([Getting started: Docker](https://www.keycloak.org/getting-started/getting-started-docker)).
- Tags op quay.io, nieuwste eerst: `26.8.2` (2026-11-09), `26.8.1` (2026-10-31), `26.8.0` (2026-10-10), `26.7.5` (2026-09-30) ([quay.io tag-API](https://quay.io/api/v1/repository/keycloak/keycloak/tag/)). `26.8.2` is ook de laatste GitHub-release ([keycloak/keycloak releases](https://github.com/keycloak/keycloak/releases)). Er zijn daarnaast tags met een extra `-N` (bijv. `26.8.2-0`): herbouwde images van dezelfde release; wie reproduceerbaar wil, pint ook de image-digest.
- `start-dev` is bedoeld voor ontwikkeling en testen; de containergids waarschuwt dat het onveilige standaardwaarden heeft en in productie vermeden moet worden. Voor een mock (nooit productie) is dat acceptabel. Voor het snelst opstarten: een `Containerfile` met een `build`-stap en `start --optimized` ("For the best start up of your Keycloak container, build an image by running the build step", [Running Keycloak in a container](https://www.keycloak.org/server/containers)).
- De container gebruikt relatieve heapgroottes (`-XX:MaxRAMPercentage=70`); de gids zegt **altijd een geheugenlimiet te zetten**, noemt minimaal 750 MB om de vroegere 512 MB heap te benaderen en 2 GB als aanbeveling voor kleine productie-installaties (zelfde gids).
- Health-endpoints bestaan op de managementpoort 9000 (`/health`, `/health/ready`, `/health/live`) en vereisen `health-enabled` (zelfde gids). Handig voor `depends_on: condition: service_healthy` in Compose. Of de image een geschikt healthcheck-commando heeft (geen `curl` aanwezig?) is niet vastgesteld.
- **Opstarttijd: niet gemeten.** Er is geen officiele opstarttijd gevonden. Meten in de spike.

## 2. Realm-import bij opstarten

Bron: [Importing and exporting realms](https://www.keycloak.org/server/importExport).

- Opdracht: `bin/kc.sh start --import-realm`. In de container leest Keycloak `/opt/keycloak/data/import`; alleen gewone bestanden met `.json` worden gelezen, submappen worden genegeerd. De containergids toont `start-dev --import-realm` met een volume op die map en merkt op dat dit "may only make sense to do in Dev mode".
- Bestandsnaam: `<realmnaam>-realm.json` (gebruikers `<realm>-users-<n>.json`). Anders kunnen fouten of niet-geimporteerde gebruikers optreden.
- "If a realm already exists in the server, the import operation is skipped." Wijzigingen in het bestand worden dus **niet** toegepast op een bestaande realm. In een mock zonder volume (geen persistentie) is dat geen probleem: elke `up` begint schoon. Met een databasevolume moet je volume of realm verwijderen.
- De server start pas volledig als de imports klaar zijn.
- Omgevingsvariabelen zijn als placeholder te gebruiken (`${MY_VAR}`), bijvoorbeeld voor een client-secret. De gids waarschuwt dat er geen beperking is op welke variabelen je kunt refereren.
- Een realm per tenant (uitgangspunt #7) is dus: een `<tenant>-realm.json` per tenant in dezelfde importmap.

## 3. Endpoints

Bron: [OIDC URI endpoints](https://www.keycloak.org/docs/latest/server_admin/) (`con-server-oidc-uri-endpoints.adoc`). Alle paden zijn relatief aan `{host}` (en eventueel het relatieve pad).

| Doel | Pad |
| --- | --- |
| Token | `/realms/{realm}/protocol/openid-connect/token` |
| JWKS (`jwks_uri`) | `/realms/{realm}/protocol/openid-connect/certs` |
| Intrekken (RFC 7009) | `/realms/{realm}/protocol/openid-connect/revoke` |
| Discovery | `/realms/{realm}/.well-known/openid-configuration` (OIDC Discovery; de Keycloak-docs noemen dit pad bij het ophalen van JWKS-URL's) |

- De mock kan JWT's offline valideren: sleutels ophalen uit `certs` (cachen), `iss` toetsen tegen `{host}/realms/{realm}`, `exp`, handtekening en `scope` (eventueel `aud`). Introspectie is niet nodig.
- Voor client credentials geldt: standaard alleen een access token, **geen refresh token en geen gebruikerssessie** ([Using a service account](https://www.keycloak.org/docs/latest/server_admin/), `proc-using-a-service-account.adoc`).

## 4. Client credentials-client in de realm

Bron: [Using a service account](https://www.keycloak.org/docs/latest/server_admin/).

Een confidential client met *Client authentication* aan en *Service accounts roles* aan (in de realm-JSON: `publicClient: false`, `serviceAccountsEnabled: true`). Zet de andere flows uit (`standardFlowEnabled`, `directAccessGrantsEnabled`, `implicitFlowEnabled`: `false`). De documentatie noemt *Full Scope Allowed* verouderd (deprecated); in de realm-JSON `fullScopeAllowed: false`.

Het token wordt aangevraagd met `grant_type=client_credentials`. Clientauthenticatie is standaard `Authorization: Basic` of `client_id` en `client_secret` in de body; daarnaast een ondertekende JWT-assertion "or any other custom mechanism".

## 5. Hoe scopes in het token komen

Bron: [Client scopes](https://www.keycloak.org/docs/latest/server_admin/) (`con-client-scopes.adoc`).

- Een client scope kan aan een client gekoppeld worden als **Default** (altijd toegepast) of **Optional** (alleen als de client hem vraagt met de `scope`-parameter).
- *Include in token scope* aan: de naam van de scope komt in de claim `scope` van het access token, in het token-antwoord en in de introspectie. Staat hij uit, dan ontbreekt hij daar, ook als hij is toegepast.
- Gevolg voor het ontwerp: definieer `diftar.ledigingen.lezen` en `diftar.stortingen.lezen` als client scopes (`protocol: openid-connect`, `include.in.token.scope: "true"`, `display.on.consent.screen: "false"`) en koppel ze per client:
  - **Default**: elke client krijgt altijd beide scopes (eenvoudig, maar je kunt dan niet testen op "ontbrekende scope").
  - **Optional**: de client moet `scope=diftar.ledigingen.lezen` meesturen. Realistischer: een client die alleen `ledigingen` mag, krijgt alleen die scope. Of Keycloak een scope die niet aan de client gekoppeld is met een fout weigert of stilzwijgend weglaat, is hier **niet vastgesteld**; testen in de spike.
- De `aud`-claim is een aparte zaak. Wil de mock `aud` toetsen, voeg dan een mapper `oidc-audience-mapper` toe (config `included.custom.audience`, `access.token.claim`) ([Audience support](https://www.keycloak.org/docs/latest/server_admin/); mapper-id en sleutelnamen uit `AudienceProtocolMapper.java`). Zonder mapper is er voor een service-account-token geen door ons gewenste audience gegarandeerd.
- Rollen zijn niet nodig: spec en ADR 0001 werken met scopes.

## 6. `private_key_jwt` (Signed JWT) in plaats van client secret

Bron: [Confidential client credentials](https://www.keycloak.org/docs/latest/server_admin/) (`con-confidential-client-credentials.adoc`) en broncode van `JWTClientAuthenticator`, `JWTClientValidator`, `AbstractJWTClientValidator`, `ClientPublicKeyLoader`, `OIDCConfigAttributes` (tag 26.8.2).

- Authenticator-id in de realm-JSON: `"clientAuthenticatorType": "client-jwt"` (voor `client_secret`: `client-secret`). Daarnaast bestaat "Signed JWT with Client Secret"; voor `private_key_jwt` is "Signed JWT" bedoeld.
- Keycloak bewaart en kent de privesleutel van de client niet, alleen een publiek certificaat of publieke sleutel. De docs raden aan het sleutelpaar buiten Keycloak te genereren.
- Drie manieren om de publieke sleutel te registreren:
  1. **JWKS-URL** (door de docs aanbevolen): `attributes."use.jwks.url": "true"` en `attributes."jwks.url": "<url>"`. Keycloak herimporteert de sleutel automatisch bij wijziging. Voor Compose betekent dit dat de client-JWKS ergens bereikbaar gehost moet worden (bijv. een statisch bestand).
  2. **Certificaat of public key importeren**: `attributes."jwt.credential.certificate": "<PEM zonder kop/staart>"` (constante `CERTIFICATE_ATTR`). Certificaat en public key tegelijk configureren is een fout (`ClientPublicKeyLoader`).
  3. **Inline JWKS-tekenreeks**: `attributes."use.jwks.string": "true"` en `attributes."jwks.string": "{\"keys\":[...]}"` (constanten `USE_JWKS_STRING` en `JWKS_STRING`; `ClientPublicKeyLoader` leest deze). Eenvoudigst voor een statische realm-import, maar komt **niet** voor in de admin-gids; minder expliciet ondersteund. Toetsen in de spike.
- Optionele aanscherping in de client-attributes: `token.endpoint.auth.signing.alg` (bijv. `RS256`; standaard is elk algoritme geldig) en `token.endpoint.auth.signing.max.exp` (maximale levensduur van de assertion; standaard 60 seconden volgens de docs).
- Eisen aan de assertion (uit `AbstractJWTClientValidator` en `JWTClientValidator`):
  - `iss` en `sub` zijn de `client_id` van de client (is `iss` ongelijk aan `sub`, dan negeert deze authenticator de assertion als "van derden");
  - `aud` moet een van de verwachte waarden zijn: de **issuer-URL** (`{host}/realms/{realm}`) of de token-endpoint-URL (ook introspectie-, PAR- en CIBA-URL's staan in de lijst). Meerdere audiences alleen als de realm dat toestaat. Gebruik de issuer-URL; de verwachte waarden worden afgeleid uit de **binnenkomende request-URL** (zie valkuil 1);
  - `exp` verplicht en niet verder weg dan `max.exp`; klokafwijking hardcoded 15 seconden;
  - `jti`: hergebruik van dezelfde assertion wordt geweigerd (`isReusePermitted` is `false`), dus een nieuwe `jti` per aanvraag;
  - een `kid` in de header helpt bij het kiezen van de sleutel;
  - alleen asymmetrische algoritmen (RS256, PS256, ES256, ...); symmetrische worden geweigerd.
- Een `client_id`-parameter in de body mag meegestuurd worden maar moet gelijk zijn aan de client uit de assertion.

## 7. Voorbeeld: minimale realm-export (een tenant)

Niet getest; structuur volgt de documentatie en de attribuutnamen uit de broncode. Bestandsnaam `gemeente-a-realm.json`. Placeholders tussen `<...>`.

```json
{
  "realm": "gemeente-a",
  "enabled": true,
  "sslRequired": "external",
  "accessTokenLifespan": 300,
  "clientScopes": [
    {
      "name": "diftar.ledigingen.lezen",
      "protocol": "openid-connect",
      "attributes": {
        "include.in.token.scope": "true",
        "display.on.consent.screen": "false"
      },
      "protocolMappers": [
        {
          "name": "audience-diftar",
          "protocol": "openid-connect",
          "protocolMapper": "oidc-audience-mapper",
          "config": {
            "included.custom.audience": "diftar-api",
            "access.token.claim": "true",
            "id.token.claim": "false"
          }
        }
      ]
    },
    {
      "name": "diftar.stortingen.lezen",
      "protocol": "openid-connect",
      "attributes": {
        "include.in.token.scope": "true",
        "display.on.consent.screen": "false"
      }
    }
  ],
  "clients": [
    {
      "clientId": "nlportal-jwt",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "serviceAccountsEnabled": true,
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "implicitFlowEnabled": false,
      "fullScopeAllowed": false,
      "clientAuthenticatorType": "client-jwt",
      "attributes": {
        "use.jwks.string": "true",
        "jwks.string": "{\"keys\":[{\"kty\":\"RSA\",\"use\":\"sig\",\"alg\":\"RS256\",\"kid\":\"<kid>\",\"n\":\"<n>\",\"e\":\"AQAB\"}]}",
        "token.endpoint.auth.signing.alg": "RS256"
      },
      "defaultClientScopes": [],
      "optionalClientScopes": ["diftar.ledigingen.lezen", "diftar.stortingen.lezen"]
    },
    {
      "clientId": "nlportal-secret",
      "enabled": true,
      "protocol": "openid-connect",
      "publicClient": false,
      "serviceAccountsEnabled": true,
      "standardFlowEnabled": false,
      "directAccessGrantsEnabled": false,
      "implicitFlowEnabled": false,
      "fullScopeAllowed": false,
      "clientAuthenticatorType": "client-secret",
      "secret": "<alleen-voor-dev-geheim>",
      "defaultClientScopes": [],
      "optionalClientScopes": ["diftar.ledigingen.lezen", "diftar.stortingen.lezen"]
    }
  ]
}
```

Opmerkingen bij het voorbeeld:

- `"defaultClientScopes": []` bedoelt: geen realm-brede standaardscopes (`profile`, `email`, `roles`, ...) voor deze client. Of de import dat zo toepast, is niet vastgesteld. Zonder dit kunnen extra scopes in de `scope`-claim verschijnen. Controleer het gegenereerde token in de spike (admin-console: client, *Client scopes*, *Evaluate*).
- Het `secret`-veld is voor de dev-secret in een mock; gebruik een duidelijk "alleen lokaal"-waarde, of haal hem uit de omgeving via `${ENV_VAR}`.
- De tweede client met `client_secret` laat beide methoden zien; voor Diftar (#7) is `private_key_jwt` het uitgangspunt.

## 8. Voorbeeld: Docker Compose

```yaml
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.8.2   # pin ook op digest; Renovate houdt hem bij
    command: ["start-dev", "--import-realm", "--hostname=http://localhost:8080", "--health-enabled=true"]
    environment:
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: change_me   # alleen voor lokale dev
    ports:
      - "127.0.0.1:8080:8080"
      - "127.0.0.1:9000:9000"
    volumes:
      - ./keycloak/realms:/opt/keycloak/data/import:ro
    mem_limit: 1g
```

De opties `--hostname`, `--health-enabled` en `--import-realm` zijn bestaande Keycloak-opties ([hostname-gids](https://www.keycloak.org/server/hostname), [containergids](https://www.keycloak.org/server/containers)). Dat de combinatie in `start-dev` zo werkt is niet getest.

## 9. Voorbeeldaanroepen

Token met client secret (Basic, zoals in de Keycloak-docs):

```bash
curl -s -X POST "http://localhost:8080/realms/gemeente-a/protocol/openid-connect/token" \
  -u "nlportal-secret:<secret>" \
  -d "grant_type=client_credentials" \
  -d "scope=diftar.ledigingen.lezen diftar.stortingen.lezen"
```

Token met `private_key_jwt` (`client_assertion_type` volgens RFC 7523 en OIDC Core, clientauthenticatie):

```bash
ASSERTION=$(node assertion.mjs nlportal-jwt "http://localhost:8080/realms/gemeente-a" client.key.pem)
curl -s -X POST "http://localhost:8080/realms/gemeente-a/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=nlportal-jwt" \
  -d "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" \
  --data-urlencode "client_assertion=$ASSERTION" \
  -d "scope=diftar.ledigingen.lezen"
```

Antwoord (vorm volgens de docs): `{"access_token":"eyJ...","token_type":"Bearer","expires_in":300,"scope":"diftar.ledigingen.lezen"}` (waarden zijn voorbeelden; `expires_in` volgt `accessTokenLifespan`).

Hulpscript `assertion.mjs` (Node, geen afhankelijkheden; genereert zo nodig een sleutelpaar; met `PRINT_JWKS=1` print het de JWKS voor `jwks.string` of een JWKS-URL). Lokaal gedraaid: levert een JWT en een geldige JWKS-JSON op; acceptatie door Keycloak niet getoetst.

```js
import { generateKeyPairSync, createPrivateKey, sign, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [clientId, issuer, keyFile = 'client.key.pem'] = process.argv.slice(2);
if (!clientId || !issuer) { console.error('gebruik: node assertion.mjs <client_id> <issuer-url> [key.pem]'); process.exit(1); }
const b64u = (b) => Buffer.from(b).toString('base64url');

if (!existsSync(keyFile)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
}
const key = createPrivateKey(readFileSync(keyFile));
const jwk = key.export({ format: 'jwk' });
const kid = createHash('sha256').update(jwk.n + jwk.e).digest('base64url').slice(0, 16);
if (process.env.PRINT_JWKS) {
  console.log(JSON.stringify({ keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, n: jwk.n, e: jwk.e }] }));
  process.exit(0);
}
const now = Math.floor(Date.now() / 1000);
const header = { alg: 'RS256', typ: 'JWT', kid };
const payload = { iss: clientId, sub: clientId, aud: issuer, jti: randomUUID(), iat: now, exp: now + 60 };
const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
console.log(`${input}.${b64u(sign('RSA-SHA256', Buffer.from(input), key))}`);
```

Resource-aanroep en validatie in de mock:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:9090/ledigingen?..."
curl -s http://localhost:8080/realms/gemeente-a/protocol/openid-connect/certs   # JWKS voor de validator
```

Validatieregels voor de mock (JWT-bibliotheek naar keuze): handtekening via JWKS op `kid`; `iss` gelijk aan `http://localhost:8080/realms/<realm>` (de **tenant komt uit `iss`**: een realm per tenant); `exp`; claim `scope` (spatiegescheiden) bevat de vereiste scope, anders `403` volgens de spec; `aud` optioneel. Of de mock deze scope-controle zelf doet is een open punt: #7 stelt dat "perfecte autorisatie (bijvoorbeeld scope-controle) in Keycloak wordt ingericht, niet in de mock" en dat JWT/scope-validatie in de mock geen uitgangspunt is.

## 10. Aansluiting op de spec en ADR

- ADR 0001 kiest OAuth2 Client Credentials (Logius Direct Access Client) met een scope zoals `diftar.ledigingen.lezen`, TLS verplicht, mTLS/PKIoverheid niet verplicht. Keycloak ondersteunt dit direct: scopes via client scopes (sectie 5).
- `diftar-openapi.yaml`: security scheme `OAuth2ClientCredentials` met `tokenUrl: oauth/token` en scopes `diftar.ledigingen.lezen` en `diftar.stortingen.lezen`. `/oauth/token` is in de spec een eigen endpoint op de API dat een **opaque** Bearer token uitgeeft voor `client_id` en `client_secret` (form body of Basic). Verschillen met Keycloak:
  - Keycloak's tokenendpoint is `/realms/{realm}/protocol/openid-connect/token`, niet `/oauth/token` op de API-host, en de tokens zijn **JWT's**, geen opaque tokens (standaard; opaque is hier niet onderzocht).
  - De spec beschrijft alleen `client_secret`; `private_key_jwt` (`client_assertion`) staat niet in het `/oauth/token`-schema. In `keycloak`-modus is de `tokenUrl` dus omgevingsafhankelijk; een punt voor de specbeheerder (en voor het besluit over `builtin`, dat volgens #7 vervalt).
  - De spec verwacht `403` bij ontbrekende scope; Keycloak levert de scope, de mock (of de resource server) moet hem toetsen.

## Valkuilen

1. **Hostname en issuer.** Keycloak vereist een vaste `hostname` en bepaalt URL's niet dynamisch ("security measure", [hostname-gids](https://www.keycloak.org/server/hostname)). `iss` in het token is de URL waarmee Keycloak zichzelf kent, en de verwachte `aud` van de client_assertion volgt uit de binnenkomende request-URL. In Compose bereikt de mock Keycloak intern (`http://keycloak:8080`) en de ontwikkelaar extern (`http://localhost:8080`); zijn die niet gelijk, dan klopt `iss` of `aud` voor een van beiden niet. Oplossing: een gedeelde hostnaam, eventueel `--hostname-backchannel-dynamic true` voor interne backchannel-verkeer, en de mock `iss` laten toetsen tegen die waarde. Volledig dynamisch (`--hostname-strict false`) schakelt hostnamecontrole uit en de gids waarschuwt voor Host-header-injectie.
2. **Import wordt overgeslagen bij een bestaande realm.** Wijzig je het JSON-bestand en bewaar je het volume, dan ziet Keycloak niets. Zonder persistent volume is dat opgelost.
3. **Bestandsnaam en map.** `<realm>-realm.json`, direct in de importmap (submappen worden genegeerd).
4. **Scope of audience ontbreekt.** *Include in token scope* uit, scope niet aan de client gekoppeld, of Optional zonder `scope`-parameter in de aanvraag: dan staat de scope niet in het token.
5. **Extra standaardscopes en audiences.** Realm-brede default scopes (profile, email, roles, ...) kunnen in de `scope`-claim terechtkomen; de scope `roles` voegt audiences op basis van client-rollen toe. Zet expliciete scopelijsten per client (zie opmerking bij het voorbeeld).
6. **Assertion-eisen (`private_key_jwt`).** `aud` op de issuer-URL, nieuwe `jti` per aanvraag, `exp` binnen `max.exp` (standaard 60 s, plus 15 s klokafwijking), `iss` en `sub` gelijk aan `client_id`, asymmetrisch algoritme. Fouten komen terug als `invalid_client` met een omschrijving.
7. **Sleutelrotatie.** Met een JWKS-URL herimporteert Keycloak bij wijziging; met `jwks.string` of een geimporteerd certificaat moet de realm opnieuw geimporteerd worden. De privesleutel hoort nooit in de realm-export.
8. **Secrets in de export.** Een client secret is in Keycloak alleen leesbaar voor beheerders met `manage-clients` (docs); in een mock-realm-bestand staat hij leesbaar. Leg `change_me`-wachtwoorden en dev-secrets vast als "alleen lokaal".
9. **Uitgeschakelde clients en audience.** Sinds 26.8.0 komen uitgeschakelde clients niet meer in de `aud` (upgrade-notities 26.8.0, `changes-26_8_0.adoc`); relevant als de mock `aud` toetst op een resource-server-client.
10. **Geheugen en opstart.** Zet een geheugenlimiet (minimaal 750 MB, liefst ongeveer 1 GB). `start-dev` is bedoeld voor ontwikkeling; voor de snelste start een eigen image met een `build`-stap.
11. **Geen productiereferentie.** `--import-realm` met `start-dev` is een mock-/ontwikkelinrichting. Productie vereist TLS, een echte hostname en een database.

## Open punten voor de spike (#16)

- Opstarttijd meten (`docker compose up` tot `/health/ready`), met `start-dev` en een geoptimaliseerd image.
- Controleren dat `jwks.string` in een realm-import werkt en dat de assertion uit `assertion.mjs` wordt geaccepteerd.
- Controleren wat er in `scope` en `aud` staat bij `defaultClientScopes: []` en bij een niet-gekoppelde scope in het verzoek.
- Beslissen hoe tokens met de spec rijmen: andere `tokenUrl` in `keycloak`-modus, JWT i.p.v. opaque, `private_key_jwt` in de spec benoemen.
- Beslissen waar de scope-controle plaatsvindt (Keycloak levert de scope; voor een `403` moet de mock of een andere laag hem toetsen, tenzij de kaart dat anders vastlegt).

## Bronnen

- [Keycloak: Getting started with Docker](https://www.keycloak.org/getting-started/getting-started-docker)
- [Keycloak: Running Keycloak in a container](https://www.keycloak.org/server/containers)
- [Keycloak: Importing and exporting realms](https://www.keycloak.org/server/importExport)
- [Keycloak: Configuring the hostname](https://www.keycloak.org/server/hostname)
- [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/): "Using a service account", "Confidential client credentials", "Client scopes", "Audience support", OIDC URI endpoints (bron: `docs/documentation/server_admin/topics/...` in tag 26.8.2)
- Upgrade-notities: `docs/documentation/upgrading/topics/changes/changes-26_8_0.adoc` (tag 26.8.2)
- Broncode, tag `26.8.2`: [`JWTClientAuthenticator`](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/authentication/authenticators/client/JWTClientAuthenticator.java), [`JWTClientValidator`](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/authentication/authenticators/client/JWTClientValidator.java), [`AbstractJWTClientValidator`](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/authentication/authenticators/client/AbstractJWTClientValidator.java), [`ClientPublicKeyLoader`](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/keys/loader/ClientPublicKeyLoader.java), [`OIDCConfigAttributes`](https://github.com/keycloak/keycloak/blob/26.8.2/server-spi-private/src/main/java/org/keycloak/protocol/oidc/OIDCConfigAttributes.java), [`AudienceProtocolMapper`](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/protocol/oidc/mappers/AudienceProtocolMapper.java)
- [quay.io: keycloak/keycloak tags](https://quay.io/repository/keycloak/keycloak?tab=tags)
- [RFC 6749 sectie 4.4](https://datatracker.ietf.org/doc/html/rfc6749#section-4.4), [RFC 7523](https://datatracker.ietf.org/doc/html/rfc7523), [OIDC Core: client authentication](https://openid.net/specs/openid-connect-core-1_0.html#ClientAuthentication)
- Intern: `docs/adr/0001-client-credentials-security.md`, `diftar-openapi.yaml`, kaart #6, `research/intern-mockplatform.md` (branch `research/intern-mockplatform`)
