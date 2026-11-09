# Onderzoek: JSON-schema met faker-annotaties en seed-generatie

Issue: [#10](https://github.com/pinkroccade/diftar-api/issues/10) (onderdeel van kaart [#6](https://github.com/pinkroccade/diftar-api/issues/6)).
Onderzoeksdatum: 2026-11-09. Versies en datums hieronder zijn op die datum opgevraagd.

## Vraag

Welke bestaande aanpakken en tools genereren data uit een JSON-schema met faker-annotaties,
deterministisch via een seed, en hoe past CSV-invoer daarbij? Per ecosysteem (Node, Java,
standalone CLI), hoe een developer een schema zelf uitbreidt, en wat nodig is voor Nederlandse
testdata (postcodes, BAG-id's, datumtijd in Europe/Amsterdam).

## Korte conclusie

1. **json-schema-faker (jsf) + `@faker-js/faker` is de enige onderzochte aanpak die het gevraagde
   "JSON-schema met faker-annotaties" letterlijk biedt.** Annotatie is een `faker`-sleutel in het schema,
   het schema blijft geldig JSON Schema, en de generator heeft een `seed`-optie en een CLI (`jsf`).
2. **Seed-determinisme is niet vanzelfsprekend.** jsf's `seed` stuurt alleen de eigen generator aan.
   De faker-instantie moet je apart seeden (zelf geverifieerd, zie [Proef](#proef-een-adres-met-ledigingen)).
   Zonder dat is de uitvoer niet reproduceerbaar. Ook faker zelf garandeert geen gelijke uitvoer
   tussen versies: pin dus de versies van beide pakketten.
3. **Nederlandse testdata vraagt eigen uitbreiding.** Fakers `nl`-locale kent postcodes, maar met
   spatie (`1234 AB`), terwijl de spec `^[1-9][0-9]{3}[A-Z]{2}$` eist. BAG-id's en datumtijd met
   Europe/Amsterdam-offset zijn niet standaard beschikbaar en worden als eigen `format` geregistreerd
   (werkt, zie proef).
4. **CSV wordt door geen enkele onderzochte tool als invoer voor het schema gelezen.** CSV hoort in
   het mock-ontwerp een apart pad te zijn (inlezen en mappen op het canonieke JSON-model), los van
   de generator. Datafaker kan CSV wel als *uitvoer* maken.
5. **Java**: Datafaker is de volwassen fakerbibliotheek (seed via `Random`, `nl`-locale, CSV/JSON-uitvoer),
   maar ik vond in de documentatie geen mechanisme om faker-annotaties uit een JSON-schema te lezen.
   Een eigen interpreter is nodig. Prism (Node) genereert dynamisch met jsf, maar een seed is daar niet
   gedocumenteerd.

## Bronnen en wat ze zeggen

| Bron | Gebruikt voor |
|---|---|
| [json-schema-faker README](https://raw.githubusercontent.com/json-schema-faker/json-schema-faker/master/README.md) | `faker`-sleutel, `seed`, `registerFormat`, `define`, CLI |
| [json-schema-faker MIGRATION.md](https://raw.githubusercontent.com/json-schema-faker/json-schema-faker/master/MIGRATION.md) | `random` vervangen door `seed`; `define()`-context |
| [npm-registry json-schema-faker](https://registry.npmjs.org/json-schema-faker) en GitHub-API | versie 0.6.4 (2026-11-08), MIT, niet gearchiveerd |
| [Faker: gebruik](https://fakerjs.dev/guide/usage) | `faker.seed()`, seed niet stabiel tussen versies, `setDefaultRefDate` |
| [Faker: randomizer](https://fakerjs.dev/guide/randomizer) | seeden van meerdere instanties, standaard Mersenne 53-bit sinds v9 |
| [faker-js `nl`-locale postcode](https://raw.githubusercontent.com/faker-js/faker/next/src/locales/nl/location/postcode.ts) | patroon `#### XX` (met spatie), geen SS/SD/SA |
| [npm-registry @faker-js/faker](https://registry.npmjs.org/%40faker-js%2Ffaker) | versie 10.6.0 (2026-08-14), MIT |
| [Datafaker: gebruik](https://raw.githubusercontent.com/datafaker-net/datafaker/main/docs/documentation/usage.md) | seed via `new Faker(new Random(0))`, `Locale("nl")` |
| [Datafaker: schemas](https://www.datafaker.net/documentation/schemas/) | `Schema.of`, `field`, CSV/JSON/YAML/SQL-transformers |
| [Datafaker: expressions](https://www.datafaker.net/documentation/expressions/) | `#{...}`-expressies, `regexify`, `csv`, `json` |
| [Datafaker: custom providers](https://raw.githubusercontent.com/datafaker-net/datafaker/main/docs/documentation/custom-providers.md) | eigen providers (Java-klasse of YAML-bestand) |
| GitHub-API datafaker | release 2.7.0 (2026-06-24), Apache-2.0, actief |
| [Prism: mocking](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/01-mocking.md) en [Prism: dynamic response with faker](https://raw.githubusercontent.com/stoplightio/prism/master/docs/guides/11-dynamic-response-with-faker.md) | dynamische modus (`-d` of `Prefer: dynamic=true`), `x-faker`, jsf als generator |
| GitHub-API Prism, Synth | Prism 5.16.0 (2026-07-17), Apache-2.0; Synth laatste push 2024-09-27 |
| `diftar-openapi.yaml` (deze repo) | schema's `Lediging`, `Storting`, adresparameters |

## Doel in contractvorm

Uit `diftar-openapi.yaml`:

- `Lediging`: verplicht `datumTijd` (date-time, Europe/Amsterdam) en `fractieCode` (vrije string);
  optioneel `fractieOmschrijving`, `gewichtInKg` (double).
- `Storting`: idem, met `volumeInLiters` (integer), `VerzamelcontainerTitel`, `VerzamelcontainerId`.
- Adres: `postcode` (`^[1-9][0-9]{3}[A-Z]{2}$`), `huisnummer` (integer >= 1), `huisletter`,
  `huisnummertoevoeging`, of `nummeraanduidingIdentificatie` (`^[0-9]{16}$`).

De generator moet dus per adres een lijst `ledigingen`/`stortingen` maken, die in de mock onder
dat adres wordt geserveerd. Het adres zelf komt niet in de response voor; het is de sleutel van de dataset.

## Vergelijking per aanpak

### A. json-schema-faker + @faker-js/faker (Node, ook CLI)

- **Seed-determinisme**: `seed`-optie (standaard 1); `createGenerator({ seed })` verhoogt de seed bij
  elke aanroep, dus opeenvolgende aanroepen geven verschillende maar reproduceerbare uitvoer.
  Faker wordt als extensie meegegeven en **wordt niet door jsf geseed** (zelf getest: zonder
  `faker.seed()` verschilden twee runs met dezelfde jsf-seed). Seed daarom beide.
  Relatieve datums (`faker.date.past/future`) hangen af van de huidige datum; vermijd ze of zet
  `setDefaultRefDate`. Faker waarschuwt dat dezelfde seed in een andere versie andere waarden geeft.
- **Annotatiestijl**: `"faker": "person.fullName"` of met argumenten
  `"faker": { "number.int": [{ "min": 18, "max": 65 }] }`. Waarden worden naar het schema-`type`
  gecast. Dit is een eigen sleutel `faker` (jsf kent `x-faker` alleen als alias via `propAliases`);
  het schema is daarmee niet meer strikt "pure" JSON Schema, maar onbekende sleutels zijn volgens
  JSON Schema toegestaan en worden door validators genegeerd.
- **CSV-ondersteuning**: geen. Alleen JSON-schema's als invoer, JSON als uitvoer.
- **Uitbreidbaarheid**: `registerFormat(naam, fn)` voor eigen formats (fn krijgt een `random`-object
  met `int()` dat aan de seed hangt); `define(naam, cb)` voor eigen sleutelwoorden; `outputTransform`;
  opties voor datumbereik (`minDateTime`, `maxDateTime`); arraygrootte via `minItems`/`maxItems`.
- **Onderhoud**: actief. Release 0.6.4 op 2026-11-08, MIT, 3447 sterren, TypeScript-herschrijving van
  de 0.5.x-lijn. Versie 0.x betekent dat de API kan wijzigen; pin de versie.

### B. Prism (Node, standalone mockserver op een OpenAPI-spec)

- **Seed-determinisme**: dynamische modus gebruikt jsf, maar de documentatie vermeldt geen seed
  (niet te bevestigen). Standaard (statische modus) gebruikt Prism voorbeelden uit de spec.
- **Annotatiestijl**: `x-faker` met een fakermethode, bijv. `name.firstName`; opties als object of
  positionele array. Ongeldige methodenaam valt terug op jsf. Welke faker-versie Prism bundelt en dus
  welke methodenamen gelden (`name.*` is de oude naamgeving, jsf 0.6 gebruikt `person.*`) heb ik
  niet geverifieerd; controleer dit vóór gebruik.
- **CSV**: geen.
- **Uitbreidbaarheid**: beperkt tot wat de OpenAPI-spec en `x-faker` toelaten. Eigen datasets,
  mutatie en chaos vallen buiten Prism (past bij de kaart: eigen service of MockServer/WireMock).
- **Onderhoud**: actief (5.16.0, 2026-07-17, Apache-2.0).
- **Opmerking**: annotaties zouden in `diftar-openapi.yaml` moeten komen. De opdracht is de spec niet
  te wijzigen, dus Prism is hier alleen relevant als referentie.

### C. Datafaker (Java/Kotlin)

- **Seed-determinisme**: `new Faker(new Random(0))` geeft volgens de documentatie dezelfde reeks per
  run. Documentatie over stabiliteit tussen versies vond ik niet.
- **Annotatiestijl**: geen JSON-schema-annotaties in de documentatie. Wel `#{...}`-expressies
  (`faker.expression("#{regexify '[1-9][0-9]{3}[A-Z]{2}'}")`-achtig) en `Schema.of(field(...))`
  in Java-code. Een JSON-schema met faker-annotaties vraagt dus een eigen interpreter, bijvoorbeeld:
  `"x-faker": "#{...}"` lezen met Jackson en doorgeven aan `faker.expression(...)`. Dat is een
  eigen ontwerp, geen bestaande tool.
- **CSV-ondersteuning**: wel als uitvoer (`CsvTransformer`, ook `csv`-expressie), niet als invoer
  voor schema's. YAML/JSON/SQL-uitvoer ook beschikbaar.
- **Uitbreidbaarheid**: eigen providers als Java-klasse of YAML-bestand (`addPath`); gewogen selectie
  sinds 2.4.2 (proof of concept).
- **Onderhoud**: actief; 2.7.0 op 2026-06-24, Apache-2.0, 1808 sterren; `nl`-locale aanwezig.

### D. Standalone / overig

- **jsf-CLI**: `jsf schema.json --seed 42 -c 5 -o uit.json`; leest ook stdin. Vergelijkbaar met A
  (zelfde faker-seedprobleem: gebruik de API als je faker moet seeden; of controleer de CLI daarop).
- **Synth** (Shuttle): declaratief schema, maar laatste push 2024-09-27; niet nader onderzocht en
  niet aan te raden zonder actieve onderhouder.
- **Mockaroo en vergelijkbare SaaS**: niet onderzocht (niet zelfstandig draaibaar in de container).

### Samenvatting

| Aspect | jsf + faker-js | Prism | Datafaker | Synth |
|---|---|---|---|---|
| Seed-determinisme | Ja, maar faker apart seeden | Niet gedocumenteerd | Ja, via `Random` | Niet onderzocht |
| Annotatiestijl | `faker`-sleutel in schema | `x-faker` in OpenAPI | Geen (code/expressies) | Eigen DSL |
| CSV | Nee | Nee | Alleen uitvoer | Niet onderzocht |
| Uitbreidbaar | `registerFormat`, `define` | Beperkt | Providers (Java/YAML) | Niet onderzocht |
| Onderhoud | Actief, 0.x | Actief | Actief, 2.x | Stil sinds 2024 |

## Nederlandse testdata

| Veld | Aanpak | Status |
|---|---|---|
| `postcode` | `faker: { "helpers.fromRegExp": ["[1-9][0-9]{3}[A-Z]{2}"] }` volgt exact de spec-regex. `fakerNL`'s `location.zipCode` geeft `#### XX` met spatie en moet gestript worden. | Regex-variant getest |
| `huisnummer` | `number.int` met `min` 1 | Getest |
| `nummeraanduidingIdentificatie` | Eigen format: 16 cijfers. Mijn voorbeeld is gemeentecode (4) + `20` + volgnummer (10). Die opbouw komt uit mijn kennis van de BAG-catalogus en is **niet** in dit onderzoek bij de primaire bron gecontroleerd; de spec zelf vereist alleen 16 cijfers. | Formaat getest, opbouw te verifiëren |
| `datumTijd` | Eigen format met `Intl.DateTimeFormat` en `timeZone: "Europe/Amsterdam"`, `timeZoneName: "longOffset"`. Levert `+01:00`/`+02:00` juist rond zomertijd (getest: juli geeft `+02:00`). | Getest |
| `fractieCode` | `enum` zolang er geen codelijst is (zie open punt in STANDARDS.md). | Voorbeeld |

Beperking: random datums zijn niet gesorteerd. Voor realistische reeksen (oplopend) is een
`outputTransform` of nabewerking nodig. Dit is niet uitgewerkt.

## Proef: een adres met ledigingen

Dit schema en script zijn lokaal gedraaid met `json-schema-faker@0.6.4` en `@faker-js/faker@10.6.0`
(Node 26). Twee runs met seed 42 gaven identieke uitvoer; seed 43 gaf andere uitvoer.

`schema.json`:

```json
{
  "type": "object",
  "required": ["label", "postcode", "huisnummer", "nummeraanduidingIdentificatie", "ledigingen"],
  "properties": {
    "label": { "const": "gezin-met-gft" },
    "postcode": { "type": "string", "faker": { "helpers.fromRegExp": ["[1-9][0-9]{3}[A-Z]{2}"] } },
    "huisnummer": { "type": "integer", "faker": { "number.int": [{ "min": 1, "max": 200 }] } },
    "nummeraanduidingIdentificatie": { "type": "string", "format": "bag-nummeraanduiding" },
    "ledigingen": {
      "type": "array",
      "minItems": 3,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": ["datumTijd", "fractieCode"],
        "properties": {
          "datumTijd": { "type": "string", "format": "datum-tijd-amsterdam" },
          "fractieCode": { "type": "string", "enum": ["GFT", "REST", "PMD", "PAPIER"] },
          "gewichtInKg": { "type": "number", "faker": { "number.float": [{ "min": 2, "max": 40, "fractionDigits": 1 }] } }
        }
      }
    }
  }
}
```

`gen.mjs`:

```js
import { readFileSync } from "node:fs";
import { generate, registerFormat } from "json-schema-faker";
import { fakerNL } from "@faker-js/faker";

registerFormat("bag-nummeraanduiding", (random) =>
  "0518" + "20" + String(random.int(0, 9999999999)).padStart(10, "0"));
registerFormat("datum-tijd-amsterdam", (random) => {
  const ms = Date.UTC(2026, 0, 1) + random.int(0, 364 * 86400) * 1000;
  const p = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam", timeZoneName: "longOffset",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const off = p.timeZoneName.replace("GMT", "") || "+00:00";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${off}`;
});

const schema = JSON.parse(readFileSync(new URL("./schema.json", import.meta.url), "utf8"));
const seed = Number(process.argv[2] ?? 42);
fakerNL.seed(seed); // jsf seedt faker niet; zonder deze regel is de uitvoer niet reproduceerbaar
console.log(JSON.stringify(await generate(schema, { seed, extensions: { faker: fakerNL } }), null, 1));
```

Uitvoer bij seed 42 (ingekort tot twee ledigingen):

```json
{
  "label": "gezin-met-gft",
  "postcode": "4975EE",
  "huisnummer": 12,
  "nummeraanduidingIdentificatie": "0518206011037519",
  "ledigingen": [
    { "datumTijd": "2026-11-07T08:08:29+01:00", "fractieCode": "PMD", "gewichtInKg": 35 },
    { "datumTijd": "2026-07-11T18:18:45+02:00", "fractieCode": "REST" }
  ]
}
```

Let op:

- `gewichtInKg` is optioneel in het schema en wordt soms weggelaten; jsf heeft opties om
  optionele velden altijd te vullen (naam niet geverifieerd, zie de README).
- `35` in plaats van `35.0` is normaal voor JSON.
- Dit is een generatieschema voor één adres, geen response van de API. Hoe het `genereer`-blok en
  het adres in de dataset-JSON samenkomen is een ontwerpbesluit voor een ander ticket.

## Bevindingen voor het ontwerp

- Voor een Node-gebaseerde mock is jsf + `@faker-js/faker` direct bruikbaar. Voor een Java-gebaseerde
  mock (bijv. WireMock) is er geen kant-en-klare equivalent; de keuze is dan een eigen interpreter
  op Datafaker, of de generator als aparte Node-stap bij het opstarten.
- Leg in het ontwerp vast: pin versies van jsf en faker; seed beide; vermijd relatieve datums;
  registreer Nederlandse formats (`postcode`, BAG-id, datumtijd) centraal.
- CSV-invoer en schema-generatie zijn twee losse bronnen die op hetzelfde canonieke JSON-model uitkomen.
- Zelf een schema uitbreiden betekent voor een developer: een veld toevoegen met een `faker`-sleutel
  of een eigen `format` gebruiken. Eigen formats vereisen JavaScript (jsf) of Java (Datafaker); dat
  moet in de onboarding-documentatie staan.

## Onzekerheden en niet onderzocht

- Of de jsf-CLI faker zelf seedt; alleen de API is getest.
- Prism: bundelde faker-versie en seed-ondersteuning.
- Datafaker: seed-stabiliteit tussen versies; leesbaarheid van JSON-schema's.
- Opbouw van het BAG-nummeraanduiding-id bij de primaire bron (Kadaster).
- Synth en SaaS-tools alleen oppervlakkig; MockServer/WireMock-eigen generatie niet onderzocht.
- Bronnen die met 404 faalden (Prism-docs op docs.stoplight.io, Datafaker-seeddocumentatie) zijn
  vervangen door de bronbestanden in de repositories.
