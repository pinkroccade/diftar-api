# Spike: MockServer-meetpunten

Beantwoordt [issue #23](https://github.com/pinkroccade/diftar-api/issues/23). Datum: 2026-11-10. MockServer 9.2.0 en 9.2.0-graaljs, Docker 29.7.2, spec uit branch `spec/adr-0002-doorvoeren` (v1.0.1, `vanaf`/`totEnMet` als `date`).

## Uitkomst

Geen blokkade: MockServer blijft de keuze. Twee dingen vragen een bewuste inrichting (zie 1 en 2).

## 1. Query-validatie en foutformaat

- OpenAPI-import via `PUT /mockserver/openapi` (specUrlOrPayload) maakt per operatie een expectation. Het basispad uit `servers` (`/v1`) wordt meegenomen: `/v1/ledigingen`.
- Het request-matchen volgt de spec: ongeldige `postcode`, ontbrekende `vanaf`, `pageSize=999`, en zonder `Authorization`-header (security is een verplichte header in de matcher) matchen **niet**. Resultaat zonder extra regel: `404` zonder body (met `MOCKSERVER_VALIDATE_REQUESTS_AGAINST_OPEN_API_SPEC=true`), of een poging tot doorsturen (`502`) zonder die vlag. Dus **geen `400` en geen problem+json uit de box**.
- Oplossing zonder code: één vangnet-expectation per pad met `priority: -1` die `400` met `application/problem+json` geeft. Gemeten: ongeldige postcode, ontbrekende `vanaf` en ontbrekende auth geven dan `400 application/problem+json`. De `detail` is generiek (niet per fout). Een apart `401` voor ontbrekende auth via een tweede vangnet-regel werkte niet (gelijke prioriteit, `400` wint); niet verder uitgezocht.
- De combinatieregel (adres óf BAG-id) wordt **niet** afgedwongen: zowel "beide" als "geen" gaven `200`. Bekende afwijking, conform besluit.
- De gegenereerde antwoorden zijn dummywaarden (`some_string_value`): de gegenereerde expectations zijn niet bruikbaar als realistische mock; antwoorden komen uit eigen expectations (zie 2).

## 2. Dataset per adres, filteren en pagineren

- Velocity (standaard image) kan queryparameters niet omzetten naar getallen (waarden zijn strings, reflectie geblokkeerd): paginering lukt niet.
- **JavaScript-template (image `-graaljs`) werkt**: filteren op postcode+huisnummer en periode, `page`/`pageSize` met `slice`, `200` met lege lijst voor bekend-maar-leeg, `404` problem+json met `detail` voor onbekend adres. Voorbeeld: `mockserver-spike-template.json` in deze map.
- Beperking: de dataset staat in het template zelf (in de expectation-JSON, die met file-watch herlaadbaar is). Een apart dataset-bestand dat het template inleest is niet getest. Hot-reload van de dataset = hot-reload van dat expectation-bestand.
- Het template is in feite kleine JavaScript: dit is het hoogste "maatwerk" binnen wat het platform ondersteunt.

## 3. Image en opstarttijd (lokaal, Docker 29.7.2)

| Image | Grootte lokaal | Opstarttijd tot status-OK, 3 runs |
|---|---|---|
| 9.2.0 | 514 MB | 1,4 / 1,4 / 1,8 s |
| 9.2.0-graaljs | 679 MB | 2,4 / 2,3 / 1,6 s |

Gecomprimeerd (Docker Hub, eerder onderzoek): 131 MB resp. 159 MB.

## Gevolgen voor de bouw

- Gebruik het `-graaljs`-image (pinnen).
- Voeg per pad een vangnet-expectation toe voor `400` problem+json.
- Antwoorden met paginering uit een JavaScript-template; dataset ingebed.
- Documenteer: geen combinatievalidatie, geen tokencontrole, generieke `400`-detail.
