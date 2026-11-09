# Onderzoek: NL GOV OAuth-profiel client credentials tegenover de spec

Beantwoordt [issue #24](https://github.com/pinkroccade/diftar-api/issues/24) (onderdeel van kaart #6). Datum onderzoek: 2026-11-10.

## Vraag

Waar wijkt `diftar-openapi.yaml` (nu: eigen `oauth/token` met `client_id` + `client_secret`, opaque Bearer-token, geen `private_key_jwt`) af van het NL GOV Assurance profile for OAuth 2.0 voor de Client Credentials-flow? Welke clientauthenticatie is verplicht, wat zijn de eisen aan token, tokenendpoint, discovery, scopegedrag, foutafhandeling en resource server, en welke afwijking vraagt een spec-wijziging?

## Werkwijze en betrouwbaarheid

- Primaire bronnen: het profiel zelf (Logius, [NL GOV Assurance profile for OAuth 2.0 v1.1.0](https://gitdocumentatie.logius.nl/publicatie/api/oauth/v1.1.0/), status "Logius Standard - Definitive version", gepubliceerd 3 december 2024; `latestVersion` op de publicatiepagina [gitdocumentatie.logius.nl/publicatie/api/oauth/](https://gitdocumentatie.logius.nl/publicatie/api/oauth/) wijst naar v1.1.0) en de RFC's op rfc-editor.org (6749, 6750, 7523, 8414, 9068, 9700). Sectienummers hieronder verwijzen naar het profiel, tenzij een RFC genoemd is.
- De HTML van het profiel is zelf gedownload en op tekst doorzocht; de MUST/SHOULD-zinnen zijn met die tekst gecontroleerd. Het profiel is gebaseerd op iGov (OpenID Foundation); passages die Nederlandse uitbreidingen zijn staan in de bron onder "iGov-NL : Additional content". Dat onderscheid is hieronder niet overal gemaakt.
- De RFC-claims (foutcodes, statuscodes, `WWW-Authenticate`, `at+jwt`, well-known pad) komen uit de RFC-tekst, maar zijn alleen steekproefsgewijs teruggelezen; ze zijn standaardkennis en daarom beknopt gehouden.
- Niets uitgevoerd of getest tegen een draaiende authorization server. Of Keycloak elk punt kan leveren staat in `research/keycloak.md` (branch `research/keycloak`, nog niet in `main`) en is daar ook niet getest.
- Afbakening: het profiel beschrijft **de authorization server en de interactie client - resource server**; het beschrijft **geen** HTTP-API's van de resource server zelf. De spec modelleert nu wel een tokenendpoint. Dat is de kern van de afwijkingen.
- Context uit de repo: ADR 0001 kiest bewust voor client credentials (het profiel noemt dit "Direct Access Client", sectie 2.1.3) en meldt dat cross-org PKIoverheid/OIN en mTLS vooralsnog niet verplicht zijn. `STANDARDS.md` noemt het profiel als "Verplicht" met handmatige review.

## Antwoord in het kort

| Onderwerp | Wat het profiel zegt | Status in de spec |
| --- | --- | --- |
| Clientauthenticatie | Direct access clients MOETEN authenticeren met een JWT-assertion, "using only the `private_key_jwt` method" (2.3.3). `tls_client_auth` mag er naast (MAY). `client_secret` wordt niet genoemd en valt daarmee buiten het profiel. | Alleen `client_secret`: **wijkt af**. |
| Tokenformaat | Access token MOET een ondertekende JWT zijn met minimaal `iss`, `azp`, `exp`, `jti` (3.2.1, 3.1.10). | Spec zegt "opaque": **wijkt af**. |
| Tokenendpoint in de spec | Het tokenendpoint is onderdeel van de authorization server (3.1), vindbaar via discovery (3.1.5). | Spec definieert zelf `/oauth/token` op de resource-API: **wijkt af in plaatsing**. |
| Discovery | OpenID Connect discovery MOET aanwezig zijn (3.1.5); RFC 8414 is niet vereist. | Niet beschreven in de spec. |
| Scopes | Resource server MOET documenteren welke scopes nodig zijn (4.2); AS MOET verzoeken om scopes buiten de rechten van de client afwijzen (4.1). | Scopes gedocumenteerd en per operatie gekoppeld: **voldoet**. |
| Foutafhandeling | Het profiel definieert geen foutcodes en geen 401/403-gedrag; dat komt uit RFC 6749 5.2 en RFC 6750 3. | Spec heeft 401/403 met Problem Details, geen `WWW-Authenticate`: **deels**. |
| Resource server | Bearer in `Authorization`-header MOET, query-parameter MAG NIET, `aud` MOET (indien aanwezig) gecheckt, issuer-allowlist MOET, `azp` SHOULD (4.2, 4.3). | Spec zegt hier niets over (impliciet via Bearer-schema). |

## 1. Rol van het profiel: client type "Direct Access Client"

- Sectie 2.1.3: client credentials-flow, geschikt "only for trusted applications", zoals een partnersysteem dat bulkgegevens uitwisselt; zo'n client MAG GEEN refresh token aanvragen of krijgen. Dit sluit aan op ADR 0001 (NL-Portal als vertrouwde client, geen user-delegation).
- Sectie 3.1.1: de authorization server MOET `authorization_code` ondersteunen en MAG `client_credentials` ondersteunen; elke client-ID MOET beperkt zijn tot een enkel granttype. Een client met meerdere modi heeft een eigen client-ID per modus.
- Sectie 3.1.3: clients MOGEN NIET dynamisch registreren voor client credentials. Registratie is dus out-of-band (relevant voor de mock: vaste clients in de realm-export).
- Sectie 1 (use case): direct access clients die client credentials gebruiken en geen OpenID Connect gebruiken mogen ook een **X.509-certificaat** gebruiken om te authenticeren bij het tokenendpoint (compatibel met RFC 6749 2.3.2 volgens het profiel).

## 2. Clientauthenticatie (2.3.3, 2.3.4, 3.1.2)

- **`private_key_jwt` verplicht.** Full clients, native clients met dynamisch geregistreerde sleutels en direct access clients MOETEN authenticeren met een JWT-assertion volgens RFC 7523, "using only the private_key_jwt method defined in OpenID Connect Core" (2.3.3). `client_secret_basic`, `client_secret_post` en `client_secret_jwt` worden in het profiel niet genoemd; "alleen `private_key_jwt`" sluit ze uit.
- **Aanvulling:** `tls_client_auth` (RFC 8705) MAG er naast gebruikt worden (2.3.3). PKIoverheid wordt in v1.1.0 alleen genoemd als voorbeeld bij proof-of-possession met mutual TLS (5.1); een verplichting van PKIoverheid/OIN voor cross-organisatie-mTLS is in de profieltekst niet teruggevonden. Dit sluit aan op ADR 0001, dat mTLS vooralsnog niet verplicht stelt.
- **Claims van de assertion** (2.3.3): `iss` en `sub` = client-ID; `aud` = **de URL van het tokenendpoint van de authorization server**; `iat`; `exp`; `jti` met minimaal 128 bits entropie, niet hergebruikt.
- **Algoritmes:** de authorization server MOET RS256 ondersteunen, MAG andere asymmetrische algoritmes ondersteunen, en SHOULD PS256 ondersteunen (2.3.3, NL-aanvulling). Het profiel noemt geen verbod op andere algoritmes; symmetrische (HS*) algoritmes zijn voor de assertion uitgesloten doordat de assertion met de private sleutel van de client wordt ondertekend.
- **Sleutelregistratie** (2.3.4): de client MOET een sleutelpaar hebben en de publieke sleutel registreren via `jwks` of `jwks_uri`; `jwks_uri` heeft de voorkeur (RECOMMENDED) omdat dat sleutelrotatie vergemakkelijkt. Een rotatieprocedure definieert het profiel niet.
- **Afdwinging** (3.1.2): de authorization server MOET clientauthenticatie afdwingen voor de granttypes authorization code en client credentials.
- **Tokenverzoek** (3.1.9): direct access clients MOETEN bij elk nieuw tokenverzoek hun credentials aanbieden, met de gewenste `scope`.
- **Let op, verschil met Keycloak:** het profiel eist `aud` = tokenendpoint-URL. Keycloak accepteert volgens `research/keycloak.md` de issuer-URL of de tokenendpoint-URL; de tokenendpoint-URL is dus profielconform en werkt ook in Keycloak (ongetest).

## 3. Access token (3.2.1, 3.1.10, 3.4)

- Het token MOET een **ondertekende JWT** zijn (JWS). Minimaal `iss`, `azp` (client-ID van de client waaraan het is uitgegeven), `exp` en `jti` (128 bits entropie). `sub` en `aud` zijn optioneel (MAY): bij een client credentials-token is `sub` "the client id of a client acting on its own behalf". `aud` is "an array containing the identifier(s) of protected resource(s) ... if this information is known".
- Ondertekening: RS256 MOET ondersteund worden, andere asymmetrische algoritmes MAG, PS256 SHOULD. De JWS-header MOET `kid` bevatten.
- Het profiel noemt `iat` in het voorbeeld, niet in de verplichte lijst; het verplicht ook niet de `typ`-header `at+jwt`, `client_id` of `scope`-claim. Dat doet RFC 9068 (JWT Profile for OAuth 2.0 Access Tokens): `typ` `at+jwt`, `iss`, `exp`, `aud`, `sub`, `client_id`, `iat`, `jti` verplicht, `scope` indien van toepassing. Het NL-profiel verwijst naar RFC 9068 alleen in 3.5.1 (autorisatieclaims buiten delegatie). Toepassing van RFC 9068 is dus een keuze, geen profielverplichting.
- Optionele versleuteling van tokens naar de publieke sleutel van de resource server is mogelijk (zie profiel 3.2.1); niet nodig voor deze spec.
- Tokenresponse (3.1.10): `access_token` (ondertekende JWT) en `token_type` (`Bearer`) verplicht; `expires_in` en `scope` optioneel. De `scope` mag worden weggelaten als hij gelijk is aan de gevraagde. Het profiel noemt `refresh_token` in de lijst, maar verbiedt dit voor direct access clients (2.1.3, 3.1.9).
- Levensduur (3.4): voor client credentials SHOULD het access token **niet langer dan zes uur** geldig zijn. Hogere-gevoeligheid-scopes mogen korter (4.1).
- RFC 6749 (3.1 token response en 5.1): de response moet `Cache-Control: no-store` bevatten. Dit staat niet in het profiel en niet in de spec.

## 4. Tokenendpoint en discovery (3.1.5)

- De authorization server MOET een **OpenID Connect discovery**-endpoint bieden met verplicht `issuer`, `authorization_endpoint`, `token_endpoint` en `jwks_uri`; `introspection_endpoint` en `revocation_endpoint` zijn optioneel. Clients en resource servers SHOULD de discovery-informatie cachen; servers worden geadviseerd cache-headers te zetten en de cache minimaal een week geldig te maken.
- **RFC 8414 (OAuth 2.0 Authorization Server Metadata) wordt door het profiel niet geeist.** Het profiel zegt expliciet dat RFC 8414 hetzelfde generieker doet en "could replace this requirement in a future version". RFC 8414 definieert het pad `/.well-known/oauth-authorization-server` (RFC 8414 3.); OIDC Discovery gebruikt `/.well-known/openid-configuration`. De vraag van de issue naar RFC 8414 als eis is dus: **niet vereist in v1.1.0**, wel een logische opvolger. Keycloak biedt beide aan (zie `research/keycloak.md` voor het OIDC-pad; het RFC 8414-pad bij Keycloak is hier niet geverifieerd).
- `authorization_endpoint` staat in de lijst verplichte discovery-velden omdat het profiel ook de authorization code-flow beschrijft; voor een authorization server die alleen client credentials doet, is dat veld in de praktijk niet zinvol. Het profiel maakt hier geen uitzondering.
- Spec-relevant: het tokenendpoint hoort bij de authorization server en wordt via discovery gevonden. De huidige spec zet `tokenUrl: oauth/token` relatief aan de server-URL van de Diftar-API. OpenAPI 3.0.3 staat voor `tokenUrl` een absolute URL toe (relatieve URL's zijn toegestaan ten opzichte van de server-URL van het document, zie OpenAPI 3.0.3 Security Scheme Object); dat is een bewuste keuze die hier niet is nagetrokken in de OpenAPI-specificatie zelf.

## 5. Scopegedrag en foutafhandeling

- **Scopes** (3.5, 4.1, 4.2): de AS SHOULD default-scopes definieren en documenteren; MAG scopes beperken voor dynamisch geregistreerde of publieke clients; verzoeken met scopes buiten de rechten van de client MOETEN worden afgewezen (4.1, geformuleerd bij hogere-niveau-scopes). De resource server MOET documenteren welke scopes nodig zijn (4.2). Scopes zijn spatiegescheiden, hoofdlettergevoelig (RFC 6749 3.3).
- **Foutcodes bij het tokenendpoint:** het profiel definieert geen foutcodes. RFC 6749 5.2: `invalid_request`, `invalid_client` (HTTP 401 met `WWW-Authenticate` als de client via de `Authorization`-header probeerde te authenticeren, anders 400), `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`. Een niet-toegestane scope levert dus `invalid_scope` (400). Het antwoord is JSON `{"error": ..., "error_description": ...}` (RFC 6749 5.2), niet `application/problem+json`.
- **Foutafhandeling bij de resource server:** het profiel zegt niets over 401/403 of `WWW-Authenticate`. RFC 6750 3: ontbrekend/ongeldig/verlopen token geeft `401` met `WWW-Authenticate: Bearer` (en `error="invalid_token"` als er een token was); onvoldoende scope geeft `403` met `error="insufficient_scope"` (optioneel `scope`-attribuut). De NL API Design Rules vragen problem+json voor fouten; die twee zijn te combineren (header plus body).
- De spec bevat al 401 ("Ontbrekend of ongeldig access token") en 403 ("onvoldoende scope"), beide met Problem Details. Dat komt overeen met RFC 6750; alleen de `WWW-Authenticate`-header is niet in de spec opgenomen.

## 6. Eisen aan de resource server (4.2, 4.3, 6)

- MOET Bearer-tokens in de `Authorization`-header accepteren (RFC 6750); MAG vormveld/query ondersteunen, maar dit profiel zegt: MOET query-parameters **niet** accepteren (4.2).
- SHOULD controleren of de `azp` overeenkomt met de client wanneer clientauthenticatie is gebruikt (4.2).
- MOET tokens interpreteren via JWT-validatie, introspectie of beide; MOET de `aud` controleren als die aanwezig is; MOET beperken van welke authorization servers hij tokens accepteert (allowlist of beleidsengine); MOET zeker stellen dat de rechten bij het token voldoende zijn (4.3). Een token dat via introspectie niet actief is MOET niet worden geaccepteerd (3.2.2).
- Alle transacties MOETEN met TLS beschermd zijn (BCP 195); de NCSC-TLS-richtlijnen worden sterk aanbevolen, waarbij voor back-channel de categorie "good" MOET worden toegepast (6). De Diftar-API gebruikt TLS ook volgens ADR 0001.
- Introspectie en intrekking (3.1.6, 3.2.2) zijn optioneel voor de AS en voor de resource server; bij gebruik moeten de aanroepende partijen authenticeren. Niet nodig voor een stateless JWT-validatie.
- RFC 9700 (OAuth 2.0 Security BCP) vult aan buiten het profiel; het raadt onder meer asymmetrische clientauthenticatie aan boven gedeelde geheimen. Niet nagelopen per punt.

## 7. Afwijkingen tussen profiel en spec

"Spec-wijziging?" = moet `diftar-openapi.yaml` (of ADR 0001) wijzigen om op dit punt profielconform te zijn.

| # | Onderwerp | Profiel (bron) | Huidige spec | Spec-wijziging? |
| --- | --- | --- | --- | --- |
| 1 | Clientauthenticatie | Alleen `private_key_jwt` (2.3.3); `tls_client_auth` mag er naast | `client_id` + `client_secret` in form-body (`/oauth/token`, verplicht); beschrijft "form body of HTTP Basic" | **Ja**: `client_secret` vervangen of aangevuld met `client_assertion_type` + `client_assertion` (RFC 7523/OIDC Core 9). Of een bewuste, gedocumenteerde afwijking in ADR 0001 vastleggen |
| 2 | Tokenformaat | Ondertekende JWT met `iss`, `azp`, `exp`, `jti`, header `kid` (3.2.1) | "opaque Bearer access token" (beschrijving `/oauth/token`); `bearerFormat` ontbreekt | **Ja**: beschrijving aanpassen naar JWT en `bearerFormat: JWT` toevoegen |
| 3 | Tokenendpoint in de resource-API | Tokenendpoint is onderdeel van de authorization server en via discovery te vinden (3.1.5); het profiel schrijft geen tokenendpoint in de resource-API voor | `/oauth/token` staat als pad in de Diftar-API, tag `OAuth`, `tokenUrl: oauth/token` | **Ja, aanbevolen**: pad en tag uit de API halen en `tokenUrl` laten verwijzen naar de externe AS (of `openIdConnect`-scheme met discovery-URL). Of het ontwerpbesluit nemen dat de API-leverancier zelf een profielconforme AS biedt; dan moet het pad aan de eisen van punt 1, 2 en 4 voldoen |
| 4 | Discovery | OIDC discovery MOET bestaan (3.1.5); RFC 8414 niet vereist | Niet vermeld | **Ja, klein**: `openIdConnect`-securityscheme met `openIdConnectUrl`, of de discovery-URL in de beschrijving noemen. OpenAPI 3.0.3 kent beide, maar `openIdConnect` kan niet de scopes per flow uitdrukken; keuze nodig |
| 5 | Tokenverzoek: parameter `scope` | Client biedt bij elk verzoek de gewenste scope aan (3.1.9); RFC 6749 4.4.2 `scope` optioneel | Request-schema heeft geen `scope`-parameter | **Ja** (alleen als het tokenendpoint in de spec blijft, zie 3) |
| 6 | Tokenverzoek: `grant_type` en foutantwoorden | RFC 6749 5.2: `invalid_client` (401), `invalid_scope` (400), JSON-fouttype | 400 "Invalid grant_type", 401 "Invalid client credentials", zonder schema; geen `invalid_scope` | **Ja** (alleen als het tokenendpoint in de spec blijft): foutschema volgens RFC 6749 5.2 |
| 7 | `Cache-Control: no-store` op tokenresponse | RFC 6749 5.1 (niet in profiel) | Ontbreekt | **Ja** (alleen bij behoud endpoint) |
| 8 | Refresh token | Direct access client MOET GEEN refresh token krijgen (2.1.3, 3.1.9) | Response bevat geen `refresh_token` | Nee: conform |
| 9 | Tokenlevensduur | SHOULD <= 6 uur voor client credentials (3.4) | Voorbeeld `expires_in: 3600` (1 uur) | Nee: conform; beheerdersbeleid van de AS bepaalt de werkelijke waarde |
| 10 | Scopes per operatie | Resource server MOET vereiste scopes documenteren (4.2) | `diftar.ledigingen.lezen`/`diftar.stortingen.lezen` per operatie in `securitySchemes` en `security` | Nee: conform. Opmerking: de globale `security` vereist beide scopes als een AND-lijst; de operaties overschrijven dit, dus effectief geen probleem |
| 11 | `aud` van de access token | MOET door resource server gecheckt worden als aanwezig; AS "if known" (3.2.1, 4.3) | Spec noemt geen audience | **Ja, klein**: audience-identificatie voor de Diftar-API vastleggen in beschrijving/ADR zodat de AS-inrichting (bijv. Keycloak audience-mapper) en de resource server hetzelfde verwachten |
| 12 | Vertrouwde issuer(s) | Resource server MOET beperken welke AS hij vertrouwt (4.3) | Niet vermeld | **Ja, klein**: issuer(s) of discovery-URL in de beschrijving noemen; geen schemawijziging |
| 13 | Token in query-parameter | Resource server mag dit NIET accepteren (4.2) | Securityscheme zegt niets over de plaats van het token; de OAuth2-flow in OpenAPI impliceert de `Authorization`-header | Nee: impliciet conform; optioneel in beschrijving expliciet maken |
| 14 | 401/403 en `WWW-Authenticate` | Niet in profiel; RFC 6750 3 voor Bearer | 401/403 aanwezig met `application/problem+json`; geen `WWW-Authenticate`-header gedocumenteerd | **Aanbevolen, geen profielplicht**: `WWW-Authenticate`-header toevoegen aan 401/403 |
| 15 | mTLS/PKIoverheid bij cross-organisatie | `tls_client_auth` is optioneel (MAY) naast `private_key_jwt` (2.3.3); PKIoverheid alleen genoemd als voorbeeld bij PoP via mTLS (5.1) | ADR 0001: vooralsnog niet verplicht wegens besloten netwerkverbinding | Nee: geen profielplicht (mTLS is MAY); ADR 0001 hoeft niet te veranderen. Wel beslissen of `private_key_jwt` alleen volstaat |
| 16 | Beschrijving "Logius Direct Access Client-profiel" | Het profiel heet "NL GOV Assurance profile for OAuth 2.0" v1.1.0 en gebruikt "Direct Access Client" | Verwijst naar "Logius 'Direct Access Client'-profiel" zonder versie; `STANDARDS.md` verwijst naar "Logius OAuth-richtlijn" zonder versie | **Ja, klein** (documentatie): versie 1.1.0 vastleggen in `STANDARDS.md` en de beschrijving van het securityscheme |
| 17 | Algoritmes | RS256 MOET, PS256 SHOULD (2.3.3, 3.2.1) | Niet gespecificeerd | Nee in de spec; wel een eis aan de AS/mock (Keycloak ondersteunt RS256/PS256 volgens zijn documentatie; hier niet geverifieerd) |

Kernconclusie: de spec volgt het profiel op **scope-documentatie, geen refresh token en levensduur**, maar wijkt af op **clientauthenticatie, tokenformaat en de plaatsing van het tokenendpoint in de resource-API**. Het meest zuivere ontwerp is het tokenendpoint uit `diftar-openapi.yaml` halen (de AS is een apart stuk infrastructuur, in de mock Keycloak) en de spec te beperken tot wat een resource server zegt: Bearer-JWT, vereiste scopes, `aud`, vertrouwde issuer en foutafhandeling.

## 8. Caveats en open punten

- **Profiel is geen eis aan de API-spec zelf.** Het profiel regelt AS, client en resource server. Of `/oauth/token` in de OpenAPI van de resource-API hoort, is een ontwerpkeuze; het profiel zegt alleen dat het tokenendpoint bij de AS hoort en via discovery vindbaar is.
- **`client_secret` is geen profielconforme methode.** Als dit voor de mock/het testtraject toch gewenst is (zie #7: Keycloak met `private_key_jwt` naast `client_secret`), is dat een bewuste afwijking die in ADR 0001 vastgelegd moet worden. Dit onderzoek beslist dit niet.
- **RFC 8414 vs OIDC discovery:** profiel v1.1.0 eist OIDC discovery; de issue vermeldt RFC 8414 maar het profiel eist dat niet. Mocht een volgende profielversie dit omdraaien, dan is een RFC 8414-document aanvullend.
- **Bron is gebaseerd op iGov.** Een aantal regels (bijv. `refresh_token` "supported" in de tokenresponse-lijst) komen uit iGov en conflicteren zonder uitleg met de NL-bepalingen voor direct access clients; hier is de strengste lezing gebruikt (geen refresh token).
- **Niet getest en niet bevestigd tegen Keycloak** voor: `aud` = tokenendpoint, `azp`-claim in client credentials-tokens, `kid`-header, PS256. Opnemen in de spike van de bouwticket (#16).
- **Tokenvalidatie in de mock** (scope-check, `aud`, `azp`) is een open punt uit #7; dit onderzoek levert alleen de profieleis, niet het besluit of de mock dit zelf toetst.

## Bronnen

- [NL GOV Assurance profile for OAuth 2.0 v1.1.0](https://gitdocumentatie.logius.nl/publicatie/api/oauth/v1.1.0/) (Logius / Geonovum, definitieve versie 3 december 2024); [publicatiepagina](https://gitdocumentatie.logius.nl/publicatie/api/oauth/)
- [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749) (OAuth 2.0): 2.3, 3.3, 4.4, 5.1, 5.2
- [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750) (Bearer Token Usage): 3, 3.1
- [RFC 7523](https://www.rfc-editor.org/rfc/rfc7523) (JWT Profile for Client Authentication and Authorization Grants)
- [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414) (Authorization Server Metadata): 3
- [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068) (JWT Profile for OAuth 2.0 Access Tokens)
- [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700) (OAuth 2.0 Security Best Current Practice)
- Repo: `docs/adr/0001-client-credentials-security.md`, `GLOSSARY.md`, `STANDARDS.md`, `diftar-openapi.yaml` (`/oauth/token`, `securitySchemes`, `components/responses`); branch `research/keycloak`, `research/keycloak.md`
