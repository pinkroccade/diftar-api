# Configuratie en referentie

Alles wat je kunt instellen, waar de bestanden staan en wat je doet als iets niet werkt. Eerste keer? Begin met de [quickstart](../README.md#snel-starten) en de [scenario's](scenarios.md).

## Starten

| Doel | Commando |
|---|---|
| Mock zonder token, met hot-reload van de dataset | `docker compose -f mock/compose.yaml up --build` |
| Mock met Keycloak (modus `keycloak`) | `docker compose -f mock/compose.yaml -f mock/compose.keycloak.yaml up --build` |
| Alleen het image, zonder compose | `docker run -p 1080:1080 ghcr.io/pinkroccade/diftar-api/mock:latest` |
| Schoon beginnen (realm en dataset-volume opnieuw) | `docker compose -f mock/compose.yaml down -v` |
| Controleren dat alles werkt | `sh mock/smoke-test.sh http://localhost:1080 none` |

Zonder compose is de dataset ingebakken in het image en werkt hot-reload niet.

## Poorten

| Poort | Service | Gebruik |
|---|---|---|
| 1080 | mock | de API onder `/v1` |
| 8080 | Keycloak | tokens en beheer, alleen met `compose.keycloak.yaml` |
| 9000 | Keycloak | health-endpoints (`/health/ready`) |

## Omgevingsvariabelen van de mock

| Variabele | Standaard | Betekenis |
|---|---|---|
| `MOCKSERVER_INITIALIZATION_JSON_PATH` | `/config/expectations-none.json` | Welk bestand met verwachte requests en antwoorden de mock laadt. Kiest de [modus](#modi): `.../expectations-none.json` of `.../expectations-keycloak.json`. In compose staan die bestanden in `/generated`. |
| `MOCKSERVER_WATCH_INITIALIZATION_JSON` | `false` (in compose `true`) | Herlaad het bestand als het wijzigt. |
| `MOCKSERVER_WATCH_INITIALIZATION_JSON_POLL_PERIOD_MILLIS` | MockServer-standaard (5000) (in compose `1000`) | Hoe vaak het bestand wordt gecontroleerd. |
| `SERVER_PORT` | `1080` | Poort in de container. |
| `MOCKSERVER_LOG_LEVEL` | `INFO` | Logniveau van MockServer. |

Alle andere `MOCKSERVER_*`-instellingen uit de [MockServer-documentatie](https://www.mock-server.com/mock_server/configuration_properties.html) werken ook. Een onbekende instelling wordt in de logs gemeld als "unrecognised MockServer configuration environment variable".

## Modi

| Modus | Bestand | Gedrag |
|---|---|---|
| `none` (standaard) | `expectations-none.json` | Geen token nodig. |
| `keycloak` | `expectations-keycloak.json` | Zonder `Authorization`-header geeft de mock `401` (problem+json, `WWW-Authenticate: Bearer`). Met een header geeft hij het gewone antwoord; het token zelf wordt niet gecontroleerd. |

Een token halen bij Keycloak staat in het [README](../README.md#met-keycloak-token-aanvragen-en-de-mock-aanroepen).

## Dataset

De dataset is `mock/dataset/dataset.json`; het schema is `mock/dataset/dataset.schema.json`. Editors als VS Code geven daarmee aanvulling en foutmeldingen via de regel `"$schema"` bovenin.

```json
{
  "$schema": "./dataset.schema.json",
  "adressen": [
    {
      "label": "mijn-scenario",
      "postcode": "1234AB",
      "huisnummer": 20,
      "huisletter": "B",
      "huisnummertoevoeging": "2",
      "nummeraanduidingIdentificatie": "0518200000000020",
      "ledigingen": [
        { "datumTijd": "2026-02-02T08:00:00+01:00", "fractieCode": "GFT", "fractieOmschrijving": "GFT-afval", "gewichtInKg": 12.5 }
      ],
      "stortingen": [
        { "datumTijd": "2026-02-03T14:30:00+01:00", "fractieCode": "RST", "volumeInLiters": 30, "VerzamelcontainerId": "CC-00123", "VerzamelcontainerTitel": "Ondergrondse container Marktstraat" }
      ]
    }
  ]
}
```

| Veld | Verplicht | Opmerking |
|---|---|---|
| `postcode` | ja | `1234AB`, zonder spatie, hoofdletters |
| `huisnummer` | ja | geheel getal, minimaal 1 |
| `huisletter`, `huisnummertoevoeging` | nee | een zoekopdracht moet ze exact meesturen, of juist niet |
| `nummeraanduidingIdentificatie` | ja | 16 cijfers, uniek in de dataset |
| `label` | nee | naam van het scenario; geen API-veld |
| `ledigingen`, `stortingen` | nee | lege of ontbrekende lijst geeft `200` met een lege lijst |
| `datumTijd` | ja | RFC 3339, bijvoorbeeld `2026-02-02T08:00:00+01:00` |
| `fractieCode` | ja | vrije tekst |

Spelregels:
- "Bekend" betekent: het adres of de BAG-nummeraanduiding staat in de dataset. Alles anders geeft `404`.
- De periode `vanaf`/`totEnMet` is inclusief en telt op datum (het datumdeel van `datumTijd`).
- Een adres kan niet twee keer voorkomen, ook niet via dezelfde BAG-id.

### Dataset aanpassen terwijl de mock draait

Pas `dataset.json` aan en sla op. Binnen ongeveer 2 seconden gebruikt de mock de nieuwe gegevens. Is de dataset ongeldig, dan blijft de vorige dataset actief en staat de fout in de logs:

```bash
docker compose -f mock/compose.yaml logs generator
```

Voorbeeld van een foutmelding:

```text
FOUT, vorige expectations blijven actief:
/dataset/dataset.json voldoet niet aan het schema:
  - /adressen/0/postcode must match pattern "^[1-9][0-9]{3}[A-Z]{2}$"
```

Wat wel en niet automatisch wordt overgenomen:

| Wijziging | Effect |
|---|---|
| `mock/dataset/dataset.json` | automatisch, zonder herstart |
| `mock/templates/*.js`, de spec, `mock/build-expectations.mjs` | opnieuw bouwen: `docker compose -f mock/compose.yaml up --build` |

## Bestanden

```text
diftar-openapi.yaml           de spec; enige bron voor de mock
mock/
├── Dockerfile                bouwt de generator en het alpine-image van de mock
├── compose.yaml              mock + generator (hot-reload)
├── compose.keycloak.yaml     voegt Keycloak toe en zet de mock in modus keycloak
├── build-expectations.mjs    spec + templates + dataset -> expectations (valideert de dataset)
├── dataset/                  dataset.json en dataset.schema.json
├── templates/                JavaScript-templates met de antwoordlogica
├── keycloak/                 realm-template, sleutelgenerator en assertion.mjs
├── smoke-test.sh             rooktest
└── docs/                     deze documentatie
```

## Problemen oplossen

| Symptoom | Oorzaak en oplossing |
|---|---|
| Altijd `400` | De aanvraag wijkt af van de spec: kijk naar de parameters (postcode `1234AB`, `vanaf` en `totEnMet` als datum `2026-01-01`, `huisnummer` een getal). In modus `keycloak` is ook de `Authorization`-header vereist. |
| `404` terwijl het adres in de dataset staat | Controleer `huisletter` en `huisnummertoevoeging`: ze moeten exact overeenkomen. Of de dataset is ongeldig en de oude is actief: bekijk de logs van `generator`. |
| `401` | Alleen in modus `keycloak`: stuur `Authorization: Bearer <token>` mee. |
| Dataset-wijziging verschijnt niet | Alleen in compose. Kijk in `docker compose -f mock/compose.yaml logs generator` of de dataset geldig is. Zonder compose is de dataset ingebakken. |
| `invalid_client` / `Token reuse detected` bij Keycloak | Een assertion is eenmalig en 60 seconden geldig: maak per aanvraag een nieuwe met `mock/keycloak/assertion.mjs`. |
| `invalid_scope` bij Keycloak | Je vraagt een scope aan die niet bij de client hoort. Zie de tabel met clients in het README. |
| Pad wordt omgezet op Windows (`C:/Program Files/Git/...`) | Git Bash zet `/config/...` om bij `docker run -e`. Zet `MSYS_NO_PATHCONV=1` voor het commando. |
| Keycloak start niet of realm lijkt oud | De import gebeurt alleen als de realm nog niet bestaat: `docker compose -f mock/compose.yaml -f mock/compose.keycloak.yaml down -v` en opnieuw starten. |
