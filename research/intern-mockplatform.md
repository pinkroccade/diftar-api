# Navraag intern: welk mockplatform is gangbaar?

Beantwoordt [issue #7](https://github.com/pinkroccade/diftar-api/issues/7).

## Antwoord

De organisatie gebruikt **WireMock** als mockplatform. MockServer valt daarmee af als standaard.

Bron: mededelingen van Jarich Ypma, 2026-11-09. Alles hieronder komt van die mededelingen, tenzij anders vermeld.

## Eisen en uitgangspunten

| Onderwerp | Vastgesteld |
| --- | --- |
| Licentie / distributie | Open source WireMock. |
| Versie | Stabiele release. Alleen de 4.0-beta bekijken bij een inhoudelijk zwaarwegende reden. |
| Registry | GHCR is toegestaan. |
| Image-hardening | Best practices toepassen, o.a. [Docker Hardened Images: hardening](https://docs.docker.com/dhi/explore/security-concepts/hardening/). Aanvullende bronnen mogen. |
| Patchmanagement | Zoveel mogelijk geautomatiseerd. |
| SBOM | Nu niet nodig: mocks gaan nooit naar productie. |
| Configuratie | Flexibel via docker-compose: file mounts, poortconfiguratie, opties via omgevingsvariabelen. |
| Draaiwijze | Docker Compose met een stabiel image. Klein en compact houden. Testcontainers is voor nu niet nodig; alleen meenemen als het eenvoudig vanuit de terminal of compose te gebruiken is. |
| Maatwerk | Alleen na expliciet akkoord van Jarich Ypma in de prompt. Geen ADR of formeel proces. |
| Werkwijze bij een gat | Eerst zoeken naar een standaardwerkwijze en die adviseren. Java-code is het laatste redmiddel en kost documentatie en onderhoud. |
| Identity provider | Keycloak (gangbaar), liefst lokaal in een container, omdat dat het meest op de eigen setup lijkt. |
| Realms | Een realm per tenant. |
| OAuth-profiel | NL GOV OAuth-profiel, client credentials flow. |
| OAS3-validatie | Zit in de pipeline van de spec, niet in de mock. |
| Aanvullende tools | Voorstel voor een lightweight open-sourcetool, alleen als nodig. |
| Beheer van de standaard | Jarich Ypma. |

## Doel van authenticatie

Het belangrijkste is dat ontwikkelaars de **client credentials flow kunnen testen**. Die flow blijft vaak onderbelicht en wordt dan een bottleneck in de implementatie. Perfecte autorisatie (bijvoorbeeld scope-controle) is mooi om te hebben en wordt in Keycloak ingericht, niet in de mock.

## Gevolgen voor de ontwerpkeuzes

- **Geen eigen tokenuitgifte in de mock.** De modus `builtin` uit kaart #6 is maatwerk en vervalt tenzij Jarich Ypma er expliciet mee akkoord gaat. Blijft over: `none` en `keycloak`.
- **Geen JWT/scope-validatie in de mock als uitgangspunt.** Dat verkleint het gat dat [issue #8](https://github.com/pinkroccade/diftar-api/issues/8) vond. Of de resterende eisen (problem+json, adres-óf-BAG-regel, CSV/faker-datasets, hot-reload) met standaard WireMock-functies kunnen, moet nog blijken in [issue #23](https://github.com/pinkroccade/diftar-api/issues/23).
- **Keycloak-voorbeeldinrichting** met een realm per tenant en een client-credentials-client volgens het NL GOV-profiel. Welke clientauthenticatie het profiel voorschrijft (bijvoorbeeld `private_key_jwt` of mTLS) en wat Keycloak daarvan standaard ondersteunt, is nog te toetsen.

## Nog niet vastgesteld

- Welke basisimage en welke concrete hardening-maatregelen (non-root, read-only bestandssysteem, gedropte capabilities, gepinde digests, image-scan in CI) voor de WireMock-image gelden. Dat volgt uit de bovengenoemde best practices en wordt uitgewerkt in [issue #19](https://github.com/pinkroccade/diftar-api/issues/19).
- Hoe het patchen wordt geautomatiseerd. Het repo gebruikt al Renovate (`renovate.json`); of dat ook de image-versies bijhoudt, is nog niet bepaald.
