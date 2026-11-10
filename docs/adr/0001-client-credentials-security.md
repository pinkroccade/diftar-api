# 0001 — OAuth2 Client Credentials i.p.v. API-key, geen user-delegation naar NewWaste

## Status
Geaccepteerd. Aangevuld door [ADR 0002](0002-security-conform-nl-gov-oauth-profiel.md): clientauthenticatie, tokenformaat en tokenendpoint volgen het NL GOV OAuth-profiel v1.1.0.

## Context
De huidige spec beveiligt de API met een statische `X-API-Key`. De Nederlandse API-strategie (Logius OAuth-richtlijn) schrijft voor user-facing scenario's normaliter de Authorization Code flow met user-delegation voor, zodat autorisatie herleidbaar is tot de ingelogde burger.

In dit specifieke geval kent NewWaste (de Diftar-backend) echter geen burgers: het systeem kent alleen adressen, gekoppelde passen en ledigingen. NL-Portal voert zelf de koppeling burger → adres uit via BRP Haal Centraal (op basis van de BSN uit de DigiD-sessie) en geeft **nooit** een BSN door aan NewWaste. De verbinding tussen NL-Portal en NewWaste loopt via een besloten lijn (Pink Private Cloud → NewWaste), functioneel binnen dezelfde gemeente maar technisch in gescheiden cloudomgevingen.

## Beslissing
- De Diftar Ledigingen API gebruikt **OAuth2 Client Credentials** (NL GOV Assurance profile for OAuth 2.0, profiel "Direct Access Client") in plaats van een statische API-key.
- NL-Portal is de vertrouwde client; autorisatie "deze burger mag alleen zijn eigen adres zien" wordt **bij NL-Portal** afgedwongen (vóór de aanroep, op basis van de Haal Centraal-uitkomst), niet bij NewWaste.
- NewWaste ontvangt en valideert alleen een geldig access token met de juiste scope (bijv. `diftar.ledigingen.lezen`) en een adres/BAG-ID als queryparameter — geen BSN.
- Cross-org PKIoverheid/OIN + mTLS wordt (vooralsnog) niet verplicht gesteld, gezien de besloten netwerkverbinding; TLS blijft uiteraard verplicht.

## Consequenties
- NewWaste kan zelf niet verifiëren dat de aanvrager van een adres ook de rechtmatige bewoner is — dat vertrouwen ligt volledig bij NL-Portal. Een compromittatie van de NL-Portal-backend geeft toegang tot alle adressen.
- Als NewWaste ooit rechtstreeks (buiten NL-Portal om) door andere, minder vertrouwde partijen aangeroepen moet worden, moet dit besluit worden herzien richting user-delegation of aanvullende autorisatie-checks.
- Afwijking van de "standaard" Logius-aanbeveling (Authorization Code) is bewust en gedocumenteerd, zodat een toekomstige reviewer niet verrast is.
