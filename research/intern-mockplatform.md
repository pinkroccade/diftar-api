# Navraag intern: welk mockplatform is gangbaar?

Beantwoordt [issue #7](https://github.com/pinkroccade/diftar-api/issues/7).

## Antwoord

De organisatie gebruikt **WireMock** als mockplatform. MockServer valt daarmee af als standaard.

Bron: mededeling van Jarich Ypma bij het oppakken van dit ticket, 2026-11-09.

## Uitgangspunten voor de uitwerking

- **Standaardfuncties eerst.** Mocks worden gebouwd met wat WireMock zelf biedt: stubbing via mappings (JSON), response templating, scenario's, fault injection en de ingebouwde admin-API.
- **Geen maatwerk zonder expliciete instemming.** Eigen extensies, eigen proxy- of wrapperservices en zelfgeschreven generatoren zijn pas toegestaan na uitdrukkelijke toestemming van Jarich Ypma. Loopt een eis alleen met maatwerk, dan wordt dat als open punt voorgelegd in plaats van gebouwd.

## Nog niet vastgesteld

De vraag noemt beheer-, licentie-, registry- en beveiligingseisen aan images. Daarover is **niets bevestigd**; hieronder staat wat nog nagevraagd moet worden. Deze punten zijn niet afgeleid of aangenomen.

| Onderwerp | Status |
| --- | --- |
| Toegestane WireMock-distributie (open source of commerciële variant) en licentie | niet vastgesteld |
| Toegestane image-registry (bijv. intern of Docker Hub) | niet vastgesteld |
| Toegestane versie / baseline-image en beheer daarvan | niet vastgesteld |
| Beveiligingseisen aan images (scans, non-root, signing) | niet vastgesteld |
| Wie beheert de WireMock-standaard binnen de organisatie | niet vastgesteld |

## Gevolg voor de platformkeuze

De keuze in kaart #6 kan van WireMock uitgaan. De onderzoeksvraag naar een mogelijke eigen service (zie issue #8) valt onder het maatwerkverbod en vraagt expliciete instemming voordat die route verder wordt uitgewerkt.
