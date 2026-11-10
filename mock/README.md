# Diftar Ledigingen mock

Mock van de Diftar Ledigingen API, gebouwd op [MockServer](https://www.mock-server.com/) (gepind, `-graaljs`-image). De spec `diftar-openapi.yaml` is de enige bron: bij het bouwen van het image worden de expectations uit de spec en de templates in `mock/templates/` gegenereerd.

## Snel starten

```bash
docker compose -f mock/compose.yaml up --build
```

De mock luistert op `http://localhost:1080/v1`. In modus `none` (standaard) is geen token nodig.

## Voorbeelden

```bash
# Veel ledigingen (paginering): totaal 52 in 2026
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31&pageSize=20&page=2"

# Zelfde adres via BAG-nummeraanduiding
curl "localhost:1080/v1/ledigingen?nummeraanduidingIdentificatie=0518200000123456&vanaf=2026-01-01&totEnMet=2026-12-31"

# Stortingen
curl "localhost:1080/v1/stortingen?postcode=1234AB&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31"

# Bekend adres zonder data: 200 met lege lijst
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=14&vanaf=2026-01-01&totEnMet=2026-12-31"

# Onbekend adres: 404 problem+json
curl -i "localhost:1080/v1/ledigingen?postcode=9999ZZ&huisnummer=1&vanaf=2026-01-01&totEnMet=2026-12-31"

# Ongeldige aanvraag: 400 problem+json
curl -i "localhost:1080/v1/ledigingen?postcode=abc&huisnummer=12&vanaf=2026-01-01&totEnMet=2026-12-31"

# De spec zelf
curl localhost:1080/v1/openapi.json
```

## Authenticatiemodi

| Modus | Instelling | Gedrag |
|---|---|---|
| `none` (standaard) | `MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-none.json` | Geen token nodig. |
| `keycloak` | `MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-keycloak.json` | Zonder `Authorization`-header: `401` problem+json met `WWW-Authenticate: Bearer`. Het token zelf wordt niet gecontroleerd. De Keycloak-voorbeeldinrichting volgt in een eigen stap. |

## Bekende afwijkingen van het contract

- Geen tokencontrole: geen `401` bij een ongeldig token en geen `403` bij een ontbrekende scope.
- Geen aparte combinatievalidatie: "adres óf BAG-nummeraanduiding, niet beide en niet geen" wordt niet afgedwongen.
- Elke ongeldige aanvraag geeft een `400` met een generieke `detail`.
- De dataset staat in `mock/templates/lib.js` en wordt bij het bouwen van het image ingebakken.

## Testdata (nu)

| Adres | BAG-nummeraanduiding | Inhoud |
|---|---|---|
| 1234AB 12 | 0518200000123456 | wekelijkse ledigingen vanaf 5 januari 2026 (60 stuks), 3 stortingen |
| 1234AB 14 | 0518200000123457 | bekend, geen ledigingen of stortingen |
