# Diftar Ledigingen mock

Mock van de Diftar Ledigingen API, gebouwd op [MockServer](https://www.mock-server.com/) (gepind, `-graaljs`-image). De spec `diftar-openapi.yaml` is de enige bron: de expectations worden gegenereerd uit de spec, de templates in `mock/templates/` en de dataset in `mock/dataset/dataset.json`.

## Waar vind je wat

| Ik wil... | Lees |
|---|---|
| de mock starten en een eerste aanroep doen | [Snel starten](#snel-starten) hieronder |
| mijn client testen op paginering, lege lijsten, fouten en periodegrenzen | [Scenario's](docs/scenarios.md) |
| de dataset aanpassen, een instelling wijzigen of een probleem oplossen | [Configuratie en referentie](docs/configuratie.md) |
| authenticatie met Keycloak proberen | [Authenticatiemodi](#authenticatiemodi) |
| weten wat de mock niet doet | [Bekende afwijkingen](#bekende-afwijkingen-van-het-contract) |
| weten hoe het image wordt gepubliceerd | [Image en publicatie](#image-en-publicatie) |

## Snel starten

Vereist: Docker met Compose. Vanaf de root van deze repository:

```bash
docker compose -f mock/compose.yaml up --build
```

De eerste keer bouwen duurt enkele minuten; daarna start de mock in enkele seconden. Test hem:

```bash
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31&pageSize=2"
```

Je krijgt `200` met `"totaalAantalLedigingen":52` en twee ledigingen. De mock luistert op `http://localhost:1080/v1`; in modus `none` (standaard) is geen token nodig. De spec staat op `http://localhost:1080/v1/openapi.json`. Controleer in één keer of alles werkt met `sh mock/smoke-test.sh`.

Zonder compose: `docker run -p 1080:1080 ghcr.io/pinkroccade/diftar-api/mock:latest` (zie [Image en publicatie](#image-en-publicatie)). Dan is de dataset ingebakken en werkt hot-reload niet.

## Scenario-adressen

Een kleine vaste set adressen om de belangrijkste situaties van je client te testen. Per scenario staan het doel, een curl-voorbeeld en het verwachte clientgedrag in [Scenario's](docs/scenarios.md).

| Label | Adres | BAG-nummeraanduiding | Gedrag |
|---|---|---|---|
| `veel-ledigingen` | 1234AB 12 | 0518200000123456 | 60 wekelijkse ledigingen vanaf 5 jan 2026 (52 in 2026), 3 stortingen: paginering. |
| `bekend-maar-leeg` | 1234AB 14 | 0518200000123457 | Bekend, geen data: `200` met lege lijst. |
| `alleen-stortingen` | 1234AB 16 | 0518200000123458 | Geen ledigingen, 8 stortingen. |
| `huisletter-en-toevoeging` | 1234AB 18 A bis | 0518200000123459 | 4 ledigingen; zonder huisletter en toevoeging is het adres onbekend. |
| `periodegrenzen` | 5678CD 1 | 0518200000123460 | Ledigingen op 31 mrt, 1 apr, 30 apr en 1 mei 2026: `vanaf` en `totEnMet` zijn inclusief. |
| (onbekend) | elk ander adres | | `404` problem+json met het adres in `detail`. |

Het `label` is een naam voor het scenario in de dataset, geen API-veld.

## Dataset aanpassen (hot-reload)

Pas `mock/dataset/dataset.json` aan terwijl de compose draait. Binnen ongeveer 2 seconden gebruikt de mock de nieuwe gegevens, zonder herstart. Een ongeldige dataset wordt gemeld in de logs van de generator (`docker compose -f mock/compose.yaml logs generator`) en laat de vorige dataset actief. Het veldoverzicht, een voorbeeld en de spelregels staan in [Configuratie en referentie](docs/configuratie.md#dataset).

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

## Image en publicatie

De workflow `.github/workflows/mock-image.yml` bouwt het image bij elke PR die de mock of de spec raakt en laat de rooktest (`mock/smoke-test.sh`) draaien in beide modi. Bij een push naar `main` wordt het image gepubliceerd naar GHCR:

```bash
docker run -p 1080:1080 ghcr.io/pinkroccade/diftar-api/mock:latest
```

| Tag | Betekenis |
|---|---|
| `1.1.0` | volledige API-versie uit de spec (schuift mee bij een nieuwe mockbouw voor dezelfde API-versie) |
| `1.1` | major.minor van de API-versie |
| `latest` | laatste bouw van `main` |
| `sha-<commit>` | onveranderlijk; gebruik deze om een exacte bouw vast te zetten |

Het image is gebouwd op alpine met een verkleinde Java-runtime (ongeveer 490 MB, tegenover ongeveer 680 MB voor het officiële `-graaljs`-image) en draait als gebruiker zonder rechten. De modus kies je met `MOCKSERVER_INITIALIZATION_JSON_PATH`, zie [Authenticatiemodi](#authenticatiemodi).
