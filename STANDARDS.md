# Standaarden-toetsing — Diftar Ledigingen API

Dit document legt vast tegen welke standaarden `diftar-openapi.yaml` is getoetst, en hoe.
De structuur is gebaseerd op de TOGAF Standards Information Base (SIB) —
zie [opengroup.org/architecture/togaf7-doc/arch/p3/sib/sib_use.htm](https://www.opengroup.org/architecture/togaf7-doc/arch/p3/sib/sib_use.htm) —
aangevuld met twee eigen velden (`Datum getoetst`, `Rationale`) die TOGAF zelf niet
voorschrijft maar die hier traceerbaarheid geven.

| Standaard | Versie | Status | Conformiteitstoets | Datum getoetst | Rationale |
|---|---|---|---|---|---|
| OpenAPI Specification | 3.0.3 | Verplicht | Automatisch, CI: `.github/workflows/oas3-validatie.yml` (`mise run validate-oas-spec`, Redocly CLI `lint`) | Elke CI-run (zie workflow-historie) | Machineleesbaar contract, vereist voor NL-Portal-integratie en tooling. |
| NL API Design Rules (Logius) | `ADR_VERSION` in [`mise.toml`](mise.toml) | Verplicht voor overheids-API's | Automatisch, CI: `.github/workflows/api-design-rules.yml` (`mise run validate-nl-api-design-rules`, DON Checker) | Elke CI-run (zie workflow-historie) | Expliciete wens van de opdrachtgever om aan te sluiten bij de Nederlandse API-strategie. |
| Logius OAuth-richtlijn voor overheids-API's (NL GOV Assurance profile for OAuth 2.0) | v1.1.0, publicatie op gitdocumentatie.logius.nl/publicatie/api/oauth/v1.1.0/ | Verplicht | Handmatige review (zie `docs/adr/0001-client-credentials-security.md`); niet geautomatiseerd toetsbaar vanuit de OpenAPI-spec alleen | 2026-11-02 | Bepaalt het securityschema (OAuth2 Client Credentials) en de onderbouwing waarom geen user-delegation. |
| BAG (Basisregistratie Adressen en Gebouwen) informatiemodel | Imbag 2.0 | Richtinggevend (naamgeving) | Handmatige review tegen BAG-catalogus (veldnamen `postcode`, `huisnummer`, `huisletter`, `huisnummertoevoeging`, `nummeraanduidingIdentificatie`) | 2026-11-02 | Domain Driven Design-wens: aansluiten bij het Nederlandse domein i.p.v. ad-hoc Engelse termen. |
| BRP Haal Centraal — bevragen personen | specificatie op github.com/BRP-API/Haal-Centraal-BRP-bevragen | Richtinggevend (naamgeving, patroon) | Handmatige review: veldnamen komen 1-op-1 overeen met BAG; bevestigt consistente naamgeving | 2026-11-02 | NL-Portal haalt het adres van de burger op via deze API vóór aanroep van Diftar Ledigingen API; consistente veldnamen voorkomen vertaalfouten tussen systemen. |
| RFC 7807 — Problem Details for HTTP APIs | — | Verplicht (via NL API Design Rules) | Handmatige review + onderdeel van ADR-ruleset-toetsing | 2026-11-02 | Vervangt de leveranciersspecifieke `Exception`-schema voor foutafhandeling. |

## Toelichting bij "Conformiteitstoets"

- **Automatisch**: afgedwongen in de CI-pipeline (GitHub Actions), zie [Workflows](#workflows).
- **Handmatig**: beoordeeld tijdens het ontwerptraject (vastgelegd in dit document en in `docs/adr/`), niet (volledig) automatisch te verifiëren vanuit de kale OpenAPI-spec.

## Workflows

| Workflow | Doel | Tool |
|---|---|---|
| `.github/workflows/oas3-validatie.yml` | Is `diftar-openapi.yaml` een geldig OpenAPI 3.0-document? | [Redocly CLI](https://redocly.com/docs/cli/) (`lint`) |
| `.github/workflows/api-design-rules.yml` | Voldoet de spec aan de NL API Design Rules? Faalt ook op waarschuwingen (`--fail-on warn`). | [DON Checker](https://developer.overheid.nl/kennisbank/api-ontwikkeling/tools/api-design-rules-linter) van developer.overheid.nl |

### Versiebeheer van tools en standaarden

- Alle tool- en standaardversies staan vastgepind in [`mise.toml`](mise.toml); lokaal
  en in CI worden dezelfde versies en taken gebruikt.
- [Renovate](renovate.json) signaleert nieuwe versies (npm-tools, GitHub Actions en
  definitieve releases van [Logius-standaarden/API-Design-Rules](https://github.com/Logius-standaarden/API-Design-Rules/releases))
  en opent daarvoor wekelijks een PR. Een ADR-update en een DON Checker-update komen
  samen in één PR.
- Minor- en patch-updates van tooling worden automatisch gemerged zodra alle checks
  groen zijn; major-updates worden handmatig beoordeeld. Renovate wijzigt nooit de
  spec zelf: wordt de spec rood door een nieuwe regelversie, dan blijft de PR open
  voor een bewuste beslissing.

## Open punten

- `fractieCode` is vooralsnog een vrije string; zodra de leverancier (NewWaste) een
  vastgelegde codelijst levert, wordt dit een `enum` (zie `docs/adr/`).
- De NL API Design Rules linter dekt niet 100% van de regels af (zie toelichting
  in de linkeropmerking van developer.overheid.nl); periodieke handmatige
  steekproef tegen de volledige regelset blijft aan te raden.
