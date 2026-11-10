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

| Modus | Instelling | Gedrag |
|---|---|---|
| `none` (standaard) | `MOCKSERVER_INITIALIZATION_JSON_PATH=/generated/expectations-none.json` (compose) of `/config/expectations-none.json` (image) | Geen token nodig. |
| `keycloak` | `.../expectations-keycloak.json` | Zonder `Authorization`-header: `401` problem+json met `WWW-Authenticate: Bearer`. Het token zelf wordt niet gecontroleerd. De Keycloak-voorbeeldinrichting volgt in een eigen stap. |

## Bekende afwijkingen van het contract

- Geen tokencontrole: geen `401` bij een ongeldig token en geen `403` bij een ontbrekende scope.
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
