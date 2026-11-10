# Diftar Ledigingen mock

Mock van de Diftar Ledigingen API, gebouwd op [MockServer](https://www.mock-server.com/) (gepind, `-graaljs`-image). De spec `diftar-openapi.yaml` is de enige bron: de expectations worden gegenereerd uit de spec, de templates in `mock/templates/` en de dataset in `mock/dataset/dataset.json`.

## Snel starten

```bash
docker compose -f mock/compose.yaml up --build
```

De mock luistert op `http://localhost:1080/v1`. In modus `none` (standaard) is geen token nodig. Zonder compose kan het ook: `docker build -f mock/Dockerfile -t diftar-mock .` en `docker run -p 1080:1080 diftar-mock` (dan is de dataset ingebakken en werkt hot-reload niet).

## Voorbeelden

```bash
# Veel ledigingen (paginering): totaal 52 in 2026
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31&pageSize=20&page=2"

# Zelfde adres via BAG-nummeraanduiding
curl "localhost:1080/v1/ledigingen?nummeraanduidingIdentificatie=0518200000123456&vanaf=2026-01-01&totEnMet=2026-12-31"

# Stortingen
curl "localhost:1080/v1/stortingen?postcode=1234AB&huisnummer=16&vanaf=2026-01-01&totEnMet=2026-12-31"

# Bekend adres zonder data: 200 met lege lijst
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=14&vanaf=2026-01-01&totEnMet=2026-12-31"

# Onbekend adres: 404 problem+json
curl -i "localhost:1080/v1/ledigingen?postcode=9999ZZ&huisnummer=1&vanaf=2026-01-01&totEnMet=2026-12-31"

# Ongeldige aanvraag: 400 problem+json
curl -i "localhost:1080/v1/ledigingen?postcode=abc&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31"

# De spec zelf
curl localhost:1080/v1/openapi.json
```

## Scenario-adressen

| Label | Adres | BAG-nummeraanduiding | Gedrag |
|---|---|---|---|
| `veel-ledigingen` | 1234AB 12 | 0518200000123456 | 60 wekelijkse ledigingen vanaf 5 jan 2026 (52 in 2026), 3 stortingen. Gebruik `pageSize` en `page` om te pagineren. |
| `bekend-maar-leeg` | 1234AB 14 | 0518200000123457 | Bekend, geen data: `200` met lege lijst. |
| `alleen-stortingen` | 1234AB 16 | 0518200000123458 | Geen ledigingen, 8 stortingen. |
| `huisletter-en-toevoeging` | 1234AB 18 A bis | 0518200000123459 | 4 ledigingen. Alleen vindbaar met `huisletter=A` en `huisnummertoevoeging=bis`; zonder die velden is het adres onbekend (`404`). |
| `periodegrenzen` | 5678CD 1 | 0518200000123460 | Ledigingen op 31 mrt, 1 apr, 30 apr en 1 mei 2026, voor het testen van `vanaf` en `totEnMet` (beide inclusief, op datum). |
| (onbekend) | elk ander adres | | `404` problem+json met het adres in `detail`. |

Het `label` is een naam voor het scenario in de dataset, geen API-veld.

## Dataset aanpassen (hot-reload)

Pas `mock/dataset/dataset.json` aan terwijl de compose draait. Binnen ongeveer 2 seconden is de mock bijgewerkt, zonder herstart.

- Het bestand heeft een JSON-schema, `mock/dataset/dataset.schema.json`; editors als VS Code geven daarmee aanvulling en foutmeldingen (via `$schema` bovenin).
- Een adres bestaat uit `postcode`, `huisnummer`, optioneel `huisletter` en `huisnummertoevoeging`, `nummeraanduidingIdentificatie` (16 cijfers) en de lijsten `ledigingen` en `stortingen`.
- "Bekend" betekent: het adres of de BAG-nummeraanduiding staat in de dataset.
- Is de dataset ongeldig (schema, ongeldige datum, dubbel adres), dan staat de fout in de logs van de generator (`docker compose -f mock/compose.yaml logs generator`) en blijft de vorige dataset actief.

## Authenticatiemodi

| Modus | Starten | Gedrag |
|---|---|---|
| `none` (standaard) | `docker compose -f mock/compose.yaml up --build` | Geen token nodig. |
| `keycloak` | `docker compose -f mock/compose.yaml -f mock/compose.keycloak.yaml up --build` | Zonder `Authorization`-header: `401` problem+json met `WWW-Authenticate: Bearer`. Het token zelf wordt niet gecontroleerd (zie afwijkingen). |

Zonder compose kies je de modus met `MOCKSERVER_INITIALIZATION_JSON_PATH` (`/config/expectations-none.json` of `/config/expectations-keycloak.json`).

### Met Keycloak: token aanvragen en de mock aanroepen

Keycloak 26.8.2 draait op http://localhost:8080 (beheer: `admin` / `admin`, alleen lokaal). De realm `gemeente-a` wordt bij het starten geïmporteerd; het starten duurt ongeveer 25 seconden. Het sleutelpaar voor `private_key_jwt` wordt bij de eerste start aangemaakt in `mock/keycloak/keys/` (staat in `.gitignore`; de privésleutel komt nooit in een realm-bestand).

| Client | Scopes (alleen op verzoek, via `scope=`) |
|---|---|
| `nlportal` | `diftar.ledigingen.lezen`, `diftar.stortingen.lezen` |
| `nlportal-alleen-ledigingen` | `diftar.ledigingen.lezen` |

Clientauthenticatie is `private_key_jwt`, conform het NL GOV OAuth-profiel en [ADR 0002](../docs/adr/0002-security-conform-nl-gov-oauth-profiel.md). Er is geen client secret.

```bash
ISSUER=http://localhost:8080/realms/gemeente-a
ASSERTION=$(node mock/keycloak/assertion.mjs nlportal $ISSUER)

curl -s -X POST $ISSUER/protocol/openid-connect/token \
  -d grant_type=client_credentials \
  -d client_id=nlportal \
  -d client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer \
  --data-urlencode "client_assertion=$ASSERTION" \
  -d "scope=diftar.ledigingen.lezen"
# antwoord: {"access_token":"eyJ...","expires_in":300,"scope":"diftar.ledigingen.lezen",...}

curl -H "Authorization: Bearer <access_token>" \
  "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31"
```

Let op:
- Een assertion is eenmalig bruikbaar (`jti`) en 60 seconden geldig: maak per aanvraag een nieuwe. `Token reuse detected` betekent hergebruik.
- Een scope die niet bij de client hoort geeft `invalid_scope`. Zonder `scope`-parameter krijg je een token zonder scope en zonder `aud`.
- Het token heeft `aud` = `diftar-api` en `iss` = de realm-URL. Het tokenendpoint van Keycloak wijkt af van het `tokenUrl`-placeholder in de spec; in een echte omgeving geeft de beheerder het juiste endpoint.
- Het realm-bestand wordt alleen geïmporteerd als de realm nog niet bestaat; `docker compose ... down -v` begint schoon.

## Bekende afwijkingen van het contract

- Geen tokencontrole: de mock controleert alleen of er een `Authorization`-header is. Geen `401` bij een ongeldig of verlopen token en geen `403` bij een ontbrekende scope; een token van Keycloak en het woord `onzin` geven hetzelfde antwoord.
- Geen aparte combinatievalidatie: "adres óf BAG-nummeraanduiding, niet beide en niet geen" wordt niet afgedwongen.
- Elke ongeldige aanvraag geeft een `400` met een generieke `detail`.
- Hot-reload geldt alleen voor de dataset, niet voor de templates; die zijn in het image ingebakken.
