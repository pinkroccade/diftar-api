# 0002 — Security conform NL GOV OAuth-profiel (private_key_jwt, JWT-tokens, tokenendpoint bij de autorisatieserver)

## Status
Geaccepteerd. Vult [ADR 0001](0001-client-credentials-security.md) aan; de keuze voor Client Credentials en tegen user-delegation blijft staan.

## Context
De spec beschreef een eigen `/oauth/token` in de resource-API, met `client_id` + `client_secret` en een opaque token. Het [NL GOV Assurance profile for OAuth 2.0 v1.1.0](https://gitdocumentatie.logius.nl/publicatie/api/oauth/v1.1.0/) (Direct Access Client) schrijft iets anders voor: clientauthenticatie uitsluitend met `private_key_jwt`, een ondertekende JWT als access token en een tokenendpoint bij de autorisatieserver, vindbaar via discovery. De afwijkingen staan in het onderzoek op branch `research/nlgov-oauth`. Er is nog geen client aangesloten in productie of acceptatie, dus aanpassen kost nu niets.

## Beslissing
- De spec volgt het profiel zonder afwijking. `client_secret` is geen onderdeel van het contract.
- Clients authenticeren met `private_key_jwt`; de publieke sleutel wordt vooraf geregistreerd bij de autorisatieserver (bij voorkeur via `jwks_uri`).
- Het access token is een ondertekende JWT (`bearerFormat: JWT`) met minimaal `iss`, `azp`, `exp`, `aud`, `scope` en een `kid`-header. De `aud` is een vaste identifier voor de Diftar-API; de waarde wordt in het ontwerp van de authenticatie vastgelegd.
- Het tokenendpoint is geen onderdeel van de Diftar-API: `/oauth/token` en de tag `OAuth` verdwijnen uit de spec. Het securityscheme blijft `oauth2` met `clientCredentials`; de `tokenUrl` verwijst naar de autorisatieserver. De beschrijving noemt de vertrouwde issuer en de discovery-URL.
- 401- en 403-responses krijgen de header `WWW-Authenticate: Bearer` (RFC 6750), naast de bestaande problem+json-body.
- De spec en `STANDARDS.md` noemen de profielversie (1.1.0).

## Consequenties
- De mock-service kan zelf tokens uitgeven voor testgemak, maar dat is een eigenschap van de mock en geen deel van het contract. Of de mock daarnaast een `client_secret` toestaat, besluit het ontwerp van de authenticatiemodi.
- De scope-controle (`403` bij een ontbrekende scope) ligt bij de resource server; een autorisatieserver als Keycloak levert alleen de scope in het token.
- Een brekende wijziging voor clients, maar er zijn nog geen clients aangesloten; daarom geen majorverhoging van `info.version`.
