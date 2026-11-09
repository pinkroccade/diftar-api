# Onderzoek: MockServer, WireMock en een eigen service tegen de eisen

Beantwoordt [issue #8](https://github.com/pinkroccade/diftar-api/issues/8) (onderdeel van kaart #6). Datum onderzoek: 2026-11-09. Spec: `diftar-openapi.yaml` (versie 1.0.1).

## Vraag

Wat kunnen MockServer, WireMock en een kleine eigen service (Node/TypeScript) per eis, in één container? Toets: OpenAPI-validatie en contractfideliteit, datasets en faker met seed, hot-reload, chaos, JWT-validatie tegen Keycloak en eigen tokenuitgifte, scope-controle, imagegrootte en opstarttijd, onderhoud en community.

## Werkwijze en betrouwbaarheid

- Alleen primaire bronnen: de documentatie van mock-server.com en wiremock.org, GitHub-repo's/releases van de projecten zelf, Docker Hub-API (imagegroottes), en de documentatie van faker, jose, Keycloak en openapi-backend.
- Er is **niets uitgevoerd of gemeten**: de onderzoeksomgeving had geen draaiende Docker-daemon. Opstarttijd is dus **niet gemeten** (zie eis 8) en gedrag is afgeleid uit documentatie. Waar een pagina afgekapt was of iets niet beschrijft, staat dat als "niet vastgesteld". Die punten horen in een korte spike vóór het besluit (ticket #13).
- Gebruikte versies: MockServer 9.2.0 (stabiel, 2026-10-27), WireMock 3.13.2 (laatste stabiele release, 2025-11-14; 4.0.0-beta.41 is een pre-release). Documentatie-pagina's van MockServer zijn niet overal onderling consistent; waar relevant is dat vermeld.

## Relevante eigenschappen van de spec

Uit `diftar-openapi.yaml`: query-validatie met patronen (`postcode` `^[1-9][0-9]{3}[A-Z]{2}$`, `nummeraanduidingIdentificatie` 16 cijfers, `huisnummer` integer >= 1, `pageSize` 1..200, `vanaf`/`totEnMet` verplicht en `date`); "adresvelden **of** nummeraanduiding, niet beide en niet geen" (een regel die OpenAPI niet kan uitdrukken, dus altijd eigen logica); foutresponses als `application/problem+json`; `API-Version`-header op 200-antwoorden; scopes `diftar.ledigingen.lezen` en `diftar.stortingen.lezen` per endpoint; `/oauth/token` (client_credentials, form body of Basic); `/openapi.json`.

## Samenvatting per eis (kort)

Legenda: Ja = standaard aanwezig volgens bron; Deels = kan met eigen werk/extensie; Nee = niet gevonden; n.v. = niet vastgesteld.

| Eis | MockServer 9.2.0 | WireMock 3.13.2 | Eigen service (Node/TS) |
|---|---|---|---|
| 1. OpenAPI-validatie van requests | Deels (instelbaar; semantiek per pagina verschillend) | Nee (alleen community-extensies) | Ja (bibliotheek, o.a. openapi-backend) |
| 2. Contractfideliteit (eigen regels, problem+json, paginering, `API-Version`) | Deels (templates) | Deels (Handlebars-templates) | Ja (volledige controle) |
| 3. Datasets JSON/CSV, faker, seed | Deels (faker-helper, seed n.v.) | Deels (faker via extensie, seed Nee) | Ja (`@faker-js/faker` met seed) |
| 4. Hot-reload | Ja (file watch, poll 5 s) | n.v. (admin-API reset/herladen; geen file watch vastgesteld) | Ja (eigen implementatie) |
| 5. Chaos | Ja (chaos-profielen, kapotte/afgekapte body, 429, drops) | Deels (vertraging en 4 fault-types ingebouwd; random 5xx/429 n.v.) | Ja (eigen implementatie) |
| 6. JWT via JWKS (Keycloak) | Nee op mock-endpoints (alleen control plane) | Nee (alleen genereren/serveren van JWKS) | Ja (`jose`) |
| 7. Eigen tokenuitgifte en scope-controle | Deels (token uitgeven ja, ondertekenen via template-helper, scope-controle bij inkomend token Nee) | Deels (JWT-extensie genereert tokens, controle Nee) | Ja |
| 8. Imagegrootte en opstarttijd | ~131 MB amd64 (JVM); opstarttijd niet gemeten | ~127 MB (alpine ~90 MB); opstarttijd niet gemeten | Klein te houden; niet gemeten |
| 9. Onderhoud en community | Actief, 5006 sterren, Apache-2.0 | Actief, 7419 sterren, Apache-2.0 | Eigen onderhoud (bibliotheken wel actief) |

De details en bronnen staan per eis hieronder.

## Eis 1 en 2: OpenAPI-validatie en contractfideliteit

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | Genereert per operatie een expectation uit een OpenAPI 3.0/3.1-spec; antwoord uit `examples` of gegenereerd uit het schema; her-importeren is idempotent (wijzigingen worden bijgewerkt, verwijderde operaties opgeruimd). Contracttest-functie stuurt voorbeeldverzoeken naar een draaiende service en rapporteert `validationErrors`. | `initializationOpenAPIPath` of `PUT /mockserver/openapi` met `specUrlOrPayload` | De OpenAPI-pagina beschrijft de spec als *request matcher*, niet als aparte validatiestap op inkomende query-parameters. De configuratie kent wel `validateRequestsAgainstOpenApiSpec` en `enforceResponseValidationForMocks`; de doc zegt dat bij overtreding een 400 met beschrijving terugkomt voor requests die een OpenAPI-gegenereerde expectation raken, maar een zoekresultaat noemt de eerste instelling juist voor proxy-verkeer en het 7.5.0-javadoc zegt dat requests standaard niet gevalideerd worden. Foutformaat is MockServer-eigen; **geen vermelding van problem+json**. De parser controleert niet alles (bijv. een typefout als `strin` wordt niet gemeld). De regel "adres of nummeraanduiding, niet beide" is niet in OpenAPI uit te drukken. | [OpenAPI & WSDL](https://www.mock-server.com/mock_server/using_openapi.html), [Configuration](https://www.mock-server.com/mock_server/configuration_properties.html), [Running MockServer](https://www.mock-server.com/mock_server/running_mock_server.html) |
| MockServer (eigen antwoorden) | Eigen antwoorden per expectation, incl. headers (`API-Version`, `Content-Type: application/problem+json`) en templates (Mustache, Velocity, JavaScript via GraalJS-image) met toegang tot `request.queryStringParameters`. | Expectation-JSON of template | Paginering/filtering met een template is mogelijk maar wordt in de geraadpleegde templatepagina niet uitgewerkt; JavaScript vereist het `graaljs`-image (~159 MB). Geen vaste toestand, dus per-adres-filtering moet in het template zelf. | [Response Templates](https://www.mock-server.com/mock_server/response_templates.html) |
| WireMock | Vergelijkt requests met stubs: queryparameters (`equalTo`, `matching`, `absent`, numeriek vergelijken), JSON-schema-matching (3.4+). Antwoorden via Handlebars-templates met `request.query.<key>`, `parseJson` en rekenhelpers (`+ - * / %`). | JSON-mappings in `mappings/`, bodies in `__files/` | **Geen ingebouwde OpenAPI-validatie** in de open-source versie; WireMock verwijst naar WireMock Cloud. Community: `dimabarbul/wiremock-openapi-validation-extension` en `VirginGates/validating-wiremock` (beide geven bij overtreding 500 terug en zijn niet officieel, mogelijk verouderd). Pagina over templating beschrijft geen paginering en geen plafond/vloer-afronding. Ongeldige queryparameters moeten met handmatige stubs (prioriteit) naar een 400-problem+json. | [Stubbing](https://wiremock.org/docs/stubbing/), [Request matching](https://wiremock.org/docs/request-matching/), [Response templating](https://wiremock.org/docs/response-templating/), [zoekresultaat OpenAPI](https://github.com/dimabarbul/wiremock-openapi-validation-extension) |
| Eigen service | Volledige controle over validatie, foutformaat, paginering, headers. `openapi-backend` valideert requests (path, query, header, cookie, body) met JSON Schema (ajv), kan mocken uit voorbeelden, kent security-handlers; validatie is standaard aan. De "of/of"-regel is gewone code. De spec kan direct als `/openapi.json` geserveerd worden. | TypeScript-code + de spec uit deze repo | Moet gebouwd en onderhouden worden. `openapi-backend`: security-handlers rekenen alleen een resultaat uit en weigeren niet zelf (`strict` of `unauthorizedHandler` nodig); MIT, 912 commits, 50 open issues; releasedatum niet vastgesteld. Alternatieven zijn niet vergeleken. | [openapi-backend](https://github.com/openapistack/openapi-backend) |

## Eis 3: datasets (JSON/CSV), faker-generatie, seed

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | `faker`-helper in templates ("250+ categorieën"), ingebouwde random-variabelen (`uuid`, `rand_int_10`, ...). | Template in expectation | In de gelezen delen **geen seed-instelling** vastgesteld; alleen klokbesturing voor herhaalbare datums (de pagina was afgekapt, dus n.v.). Geen ingebouwde CSV-inlading of dataset-selectie per adres; dat zou in template/callback moeten. | [Response Templates](https://www.mock-server.com/mock_server/response_templates.html) |
| WireMock | Helpers `randomValue`, `pickRandom`, `randomInt`, `randomDecimal`; fake-data via `{{random 'Name.first_name'}}` uit de aparte `RandomExtension`. Bodies uit bestanden (`__files`). | Handlebars-template; extension-JAR in `/var/wiremock/extensions` met `--extensions` | **Seed niet beschreven**; CSV-inlading niet vastgesteld. Datasets per adres vereisen dus eigen `mappings`-generatie vooraf of een extensie. | [Response templating](https://wiremock.org/docs/response-templating/), [Docker](https://wiremock.org/docs/standalone/docker/) |
| Eigen service | JSON en CSV zelf inlezen; `@faker-js/faker` met `.seed(n)` voor herhaalbare data; een `genereer`-blok met seed uit de dataset is gewone code. | Bibliotheek + eigen dataset-loader | Faker-documentatie: default randomizer wisselde in v9 (32-bit Mersenne -> 53-bit), dus seeded uitvoer kan per major-versie verschillen: versie pinnen. Aanroepvolgorde bepaalt de uitkomst; bij meerdere instanties één gedeelde `Randomizer` gebruiken. | [Faker: Randomizer](https://fakerjs.dev/guide/randomizer) |

## Eis 4: hot-reload van de dataset

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | Bestanden worden bewaakt en wijzigingen worden op `id` van de expectation verwerkt (aanmaken, wijzigen, verwijderen). | `watchInitializationJson=true`; poll-interval standaard 5000 ms (`watchInitializationJsonPollPeriodMillis`) | Werkt op expectations (JSON/OpenAPI-bestanden), niet op een eigen CSV/dataset-formaat. Gepolld, niet direct. Bij dubbele `id` wint de laatste. Herordenen verandert de matchvolgorde niet. | [Initializing Expectations](https://www.mock-server.com/mock_server/initializing_expectations.html) |
| WireMock | Mappings uit `mappings/` laden bij start; admin-API kan stubs toevoegen en resetten (`resetToDefault` behoudt de bestandsmappings). | `/__admin/mappings`, `/__admin/mappings/reset` | **Automatisch herladen bij bestandswijziging is niet vastgesteld** in de geraadpleegde pagina's; de stubbing-pagina beschrijft het niet. | [Stubbing](https://wiremock.org/docs/stubbing/) |
| Eigen service | Bestandswatcher (bijv. `fs.watch`) herlaadt dataset en valideert die vóór activering. Alles, ook CSV, is mogelijk. | Eigen code | Eigen werk; atomair wisselen van de dataset moet zelf correct. | n.v. (ontwerpkeuze) |

## Eis 5: chaos (vertraging, verbroken verbinding, kapotte/afgekapte body, willekeurige 5xx/429, per-request)

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | Chaos-profiel per expectation: `latency`, `errorStatus` + `errorProbability`, `dropConnectionProbability` (drops gaan voor), `retryAfter`, `succeedFirst`/`failRequestCount`, uitval in tijdsvenster (`outageAfterMillis`, `outageDurationMillis`), `degradationRampMillis`, quota met `quotaErrorStatus` (standaard **429**), `truncateBodyAtFraction`, `malformedBody`, dribble-modus (`slowResponseChunkSize`/`Delay`), `seed`. Daarnaast de *error action* (`dropConnection`, `responseBytes`) met optionele vertraging. Per-host chaos via `PUT /mockserver/serviceChaos` met `ttlMillis`. | `chaos`-blok in de expectation-JSON | Dit dekt de eisenlijst vrijwel volledig. Opmerkingen: een vaste `seed` geeft bij kansen tussen 0 en 1 elke keer dezelfde beslissing; afgekapt/kapot geldt alleen voor het echte antwoord, niet voor geïnjecteerde fouten; geen streaming-bodies. Een **per-request header** om chaos te kiezen is in de gelezen delen niet vastgesteld (pagina afgekapt); `responseBytes` werkt alleen over HTTP/1.1. De geïnjecteerde foutbody heeft type `chaos_injected`, niet problem+json. | [Chaos Testing](https://www.mock-server.com/mock_server/chaos_testing.html), [zoekresultaat error action](https://www.mock-server.com/mock_server/creating_expectations.html) |
| WireMock | Vaste vertraging, per stub of globaal; willekeurige vertraging (uniform, lognormaal met `maxValue` sinds 3.13.0); *chunked dribble delay*; faults `EMPTY_RESPONSE`, `MALFORMED_RESPONSE_CHUNK`, `RANDOM_DATA_THEN_CLOSE`, `CONNECTION_RESET_BY_PEER`. | `fixedDelayMilliseconds`, `delayDistribution`, `fault` in de stub; globaal via `/__admin/settings` | Een **kans per request** (willekeurige 5xx/429) en afgekapte-maar-geldige response worden niet als functie beschreven; te benaderen via meerdere stubs en header-matching (per-request header is een gewone request-matcher), niet vastgesteld voor kansen. `CONNECTION_RESET_BY_PEER` werkt betrouwbaar op *nix, kan op Windows blijven hangen. | [Simulating faults](https://wiremock.org/docs/simulating-faults/) |
| Eigen service | Alles: vertraging, `socket.destroy()`, halve body, willekeurige 5xx/429 met `Retry-After`, statische profielen, `X-Mock-Fault`-achtige header (achter `MOCK_ADMIN_ENABLED`), seedbare kans. | Eigen middleware | Eigen werk en eigen test; het gedrag is zo realistisch als wij het maken. | n.v. (ontwerpkeuze) |

## Eis 6: JWT-validatie tegen Keycloak (JWKS)

Keycloak publiceert de JWKS op `/realms/{realm}/protocol/openid-connect/certs` en de discovery op `/realms/{realm}/.well-known/openid-configuration`; clients mogen tokens lokaal valideren op `kid` en de sleutels cachen ([Keycloak](https://www.keycloak.org/securing-apps/oidc-layers)).

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | JWT/OIDC-validatie (JWKS-URI of issuer-discovery, issuer, audience, verval, vereiste scopes) bestaat, maar voor de **control plane** (beheer-API van MockServer zelf). | `controlPlaneOidcJwksUri`, `controlPlaneOidcIssuer`, `controlPlaneOidcAudience`, `controlPlaneOidcRequiredScopes` | Niet gevonden als functie voor het beveiligen van gemockte endpoints. De OAuth2-mockpagina beschrijft het uitgeven van tokens, niet het valideren van een inkomend token (handtekening, verval, scopes). Een http-JWKS-URI is alleen voor localhost toegestaan. De pagina's zijn onderling inconsistent over wat tijdens runtime te wijzigen is. | [Control Plane Authentication](https://www.mock-server.com/mock_server/control_plane_authorisation.html), [Mocking OAuth2](https://www.mock-server.com/mock_server/mocking_oauth2.html) |
| WireMock | Een JWT-extensie (`wiremock-jwt-extension` 0.3.0) voegt helpers toe om JWT, claims en een JWKS te **genereren/serveren**. | `{{jwt ...}}`, `{{{jwks}}}` | Geen verificatie van inkomende tokens tegen een externe JWKS beschreven; `matchesJwt` niet vastgesteld. De extensie is zelf niet recent bijgewerkt (laatste push 2025-06-11). | [JWT](https://wiremock.org/docs/jwt/) |
| Eigen service | `jose` `createRemoteJWKSet` + `jwtVerify` met `issuer`/`audience`; selectie op `alg` en `kid`; cache met `cooldownDuration` voor opnieuw ophalen bij onbekende sleutel. Scopes uit de claim `scope` zijn gewone code. | Ca. tien regels code | Timeout-gedrag van de JWKS-fetch niet gedocumenteerd op de geraadpleegde pagina (zelf instellen/testen); Keycloak moet bereikbaar zijn bij eerste gebruik. | [jose: createRemoteJWKSet](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md) |

## Eis 7: eigen tokenuitgifte (`/oauth/token`) en scope-controle

| Platform | Wat kan het | Hoe | Beperkingen | Bron |
|---|---|---|---|---|
| MockServer | Een expectation op `POST /oauth/token` kan een token-JSON teruggeven; met Mustache (`{{uuid}}`) per aanroep een ander token. Template-helper `jwt.generate(claims)` (claims vrij in Velocity/JavaScript) en `jwt.jwks()` tekenen met RS256 en een automatisch gegenereerd sleutelpaar. | Expectation + template | Client credentials worden letterlijk of met regex gematcht, geen echte client-registratie. Het uitgegeven token wordt bij latere calls **niet** gecontroleerd op scope of verval; dat zou matchen op de `Authorization`-header zijn (letterlijk). Daarmee is scope-controle per endpoint (403 bij ontbrekende scope) niet af te dwingen zonder tokens vooraf te kennen. | [Mocking OAuth2](https://www.mock-server.com/mock_server/mocking_oauth2.html), [Response Templates](https://www.mock-server.com/mock_server/response_templates.html) |
| WireMock | Stub op `/oauth/token`; JWT-extensie kan ondertekende tokens maken (`alg` RS256, ook HS256-geheim), sleutels via `/__admin/settings`. | Stub + `{{jwt ...}}` | Geen formele scope-controle op inkomende tokens beschreven; zou met header-matching op bekende tokens moeten. Extensie is een aparte, weinig onderhouden component. | [JWT](https://wiremock.org/docs/jwt/) |
| Eigen service | `/oauth/token` volgens RFC 6749 (form of Basic), eigen sleutelpaar, JWKS-endpoint, `builtin`-modus; scope-controle per route met 401/403 als problem+json en `none`-modus als uitzetten van de controle. Past op de drie modi uit de map. | Code met `jose` (`SignJWT`, `jwtVerify`) | Eigen werk; moet dezelfde validatiecode gebruiken voor `builtin` en `keycloak` zodat beide modi gelijk gedrag geven. | [jose](https://github.com/panva/jose) |

## Eis 8: imagegrootte en opstarttijd

| Platform | Imagegrootte (Docker Hub-API, gelezen 2026-11-09) | Opstarttijd | Bron |
|---|---|---|---|
| MockServer 9.2.0 | `9.2.0`: 131 MB amd64 / 130 MB arm64; `9.2.0-graaljs` 159 MB; `9.2.0-aot` 127 MB; `clustered` 202 MB | **Niet gemeten** (geen Docker beschikbaar); JVM-gebaseerd | [Docker Hub mockserver](https://hub.docker.com/r/mockserver/mockserver/tags) |
| WireMock 3.13.2 | `3.13.2`: 127 MB; `3.13.2-alpine`: 90 MB (amd64); `3.13.2-2` was nog 110 MB (alpine 84 MB), dus de grootte schommelt per bouwrevisie. 4.0.0-beta.41: 134 MB (alpine 99 MB) | **Niet gemeten**; JVM-gebaseerd | [Docker Hub wiremock](https://hub.docker.com/r/wiremock/wiremock/tags), [Docker-pagina](https://wiremock.org/docs/standalone/docker/) |
| Eigen service | Niet gemeten. Een Node-image op alpine met een handvol afhankelijkheden ligt naar verwachting duidelijk onder beide JVM-images; dit is een **aanname**, geen bron. | Niet gemeten; Node start doorgaans sneller dan een JVM (aanname) | n.v. |

Voor een betrouwbare vergelijking is een korte meting nodig: `docker run` met een minimale configuratie, tijd tot eerste 200 op een gezondheidscheck, drie runs, op dezelfde machine.

## Eis 9: onderhoud en community

| Platform | Feiten | Bron |
|---|---|---|
| MockServer | Licentie Apache-2.0. Repo is verhuisd naar `mock-server/mockserver-monorepo` (de oude naam verwijst door), 5006 sterren, 9 open issues, laatste commit 2026-11-09, snelle releasereeks (7.6.0 op 2026-08-17, 8.0.0 op 2026-09-15, 9.0.0 op 2026-10-15, 9.2.0 op 2026-10-27). Hoge major-snelheid: let op breuken. | [GitHub](https://github.com/mock-server/mockserver-monorepo), [releases](https://github.com/mock-server/mockserver-monorepo/releases) |
| WireMock | Apache-2.0, 7419 sterren, laatste push 2026-11-09. Laatste stabiele release 3.13.2 (2025-11-14); sinds 2026 alleen pre-releases van 4.0.0 (beta.36 t/m beta.41, laatst 2026-10-21): lang geen stabiele release. | [GitHub](https://github.com/wiremock/wiremock), [releases](https://github.com/wiremock/wiremock/releases) |
| Eigen service | Geen extern onderhoud; wij onderhouden de code. Bouwstenen: `jose`, `@faker-js/faker`, `openapi-backend` (MIT, actief maar releasedatum niet vastgesteld) of vergelijkbaar. Kost bouw- en testwerk, maar de roadmap is de onze en de pinning van versies is onder eigen controle. | zie hierboven |

## Conclusies

1. **Geen van de twee kant-en-klare tools dekt de volledige eisenlijst.** Beide missen JWT-validatie tegen Keycloak-JWKS met scope-controle op de gemockte endpoints (MockServer doet JWT/OIDC alleen voor zijn eigen control plane), en beide missen een duidelijke manier voor problem+json-validatiefouten volgens de spec en voor de "adres of nummeraanduiding"-regel.
2. **MockServer is de sterkste kant-en-klare kandidaat voor chaos**: kansen, 429 met `Retry-After`, afgekapte en kapotte bodies, verbroken verbindingen, tijdsvensters en seed zitten in de documentatie. Per-request header-sturing en seed voor faker zijn niet vastgesteld.
3. **WireMock is sterk in vertraging en fault-types en in matchen**, maar heeft geen OpenAPI-validatie (alleen community-extensies), geen seed voor random data, geen vastgestelde hot-reload en geen kansgestuurde chaos. De laatste stabiele release is bijna een jaar oud.
4. **Een eigen service dekt alle eisen** (OpenAPI-validatie via bibliotheek, problem+json, paginering, seed, hot-reload, chaos, `jose` voor Keycloak-JWKS, eigen tokenuitgifte, drie authenticatiemodi), tegen de prijs van bouw- en onderhoudswerk. De bouwstenen zijn volwassen en klein.
5. **Open te toetsen in een korte spike voor het besluit (#13)**: opstarttijd en imagegrootte meten; of MockServer met `validateRequestsAgainstOpenApiSpec`/`enforceResponseValidationForMocks` query-fouten daadwerkelijk als 400 afvangt en of het foutformaat aan te passen is naar problem+json; of er een per-request chaos-header is; of WireMock een bestandswijziging herlaadt; en of een hybride (MockServer of WireMock achter een dunne Node-laag voor auth en validatie) minder werk is dan alles zelf bouwen.
