# Scenario's

De mock bevat een kleine vaste set adressen waarmee je de belangrijkste situaties van je client kunt testen. Elk scenario heeft een naam (het `label` in de dataset), een doel en het gedrag dat je client zou moeten laten zien. Start de mock eerst, zie de [quickstart](../README.md#snel-starten). De voorbeelden gaan uit van modus `none`; in modus `keycloak` stuur je ook `-H "Authorization: Bearer <token>"` mee.

In alle voorbeelden is `V` de periode:

```bash
V="vanaf=2026-01-01&totEnMet=2026-12-31"
```

| Scenario | Adres | BAG-nummeraanduiding |
|---|---|---|
| [veel-ledigingen](#veel-ledigingen-paginering) | 1234AB 12 | 0518200000123456 |
| [bekend-maar-leeg](#bekend-maar-leeg) | 1234AB 14 | 0518200000123457 |
| [alleen-stortingen](#alleen-stortingen) | 1234AB 16 | 0518200000123458 |
| [huisletter-en-toevoeging](#huisletter-en-toevoeging) | 1234AB 18 A bis | 0518200000123459 |
| [periodegrenzen](#periodegrenzen) | 5678CD 1 | 0518200000123460 |
| [onbekend adres](#onbekend-adres) | elk ander adres | elke andere BAG-id |
| [ongeldige aanvraag](#ongeldige-aanvraag) | | |

## veel-ledigingen (paginering)

**Doel:** controleren dat je client alle pagina's ophaalt en de `_links` volgt.

```bash
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12&$V&pageSize=2&page=2"
```

Antwoord: `200`, `totaalAantalLedigingen` is `52` (60 wekelijkse ledigingen vanaf 5 januari 2026, waarvan 52 in 2026), `ledigingen` bevat 2 items en `_links` bevat `self`, `first`, `last`, `next` en `prev` (op de laatste pagina geen `next`, op de eerste geen `prev`). Zonder `pageSize` is dat 50 per pagina (de standaard uit de spec). Hetzelfde adres via BAG-nummeraanduiding geeft hetzelfde resultaat:

```bash
curl "localhost:1080/v1/ledigingen?nummeraanduidingIdentificatie=0518200000123456&$V"
```

**Verwacht clientgedrag:** de client blijft pagina's ophalen tot `next` ontbreekt en toont alle 52 ledigingen, niet alleen de eerste pagina.

## bekend-maar-leeg

**Doel:** controleren dat je client een leeg resultaat anders behandelt dan een fout.

```bash
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=14&$V"
```

Antwoord: `200` met `"totaalAantalLedigingen":0` en `"ledigingen":[]`.

**Verwacht clientgedrag:** de client toont "geen ledigingen in deze periode" en geen foutmelding.

## alleen-stortingen

**Doel:** een adres met stortingen in een verzamelcontainer maar zonder ledigingen van een minicontainer.

```bash
curl "localhost:1080/v1/stortingen?postcode=1234AB&huisnummer=16&$V"
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=16&$V"
```

Antwoord: de stortingen geven `200` met 8 stortingen (met `volumeInLiters`, `VerzamelcontainerId` en `VerzamelcontainerTitel`); de ledigingen geven `200` met een lege lijst.

**Verwacht clientgedrag:** de client toont de twee soorten gegevens los van elkaar en gaat niet uit van ledigingen voor elk adres.

## huisletter-en-toevoeging

**Doel:** controleren dat je client `huisletter` en `huisnummertoevoeging` meestuurt, en dat het adres zonder die velden niet gevonden wordt.

```bash
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=18&huisletter=A&huisnummertoevoeging=bis&$V"   # 200, 4 ledigingen
curl "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=18&$V"                                           # 404
```

**Verwacht clientgedrag:** de client geeft alle onderdelen van het adres door zoals ze uit de BRP komen. Een `404` wegens een ontbrekende huisletter laat zien dat het adres onvolledig was.

## periodegrenzen

**Doel:** controleren dat `vanaf` en `totEnMet` beide inclusief zijn, op datum. De ledigingen vallen op 31 maart, 1 april, 30 april en 1 mei 2026.

```bash
curl "localhost:1080/v1/ledigingen?postcode=5678CD&huisnummer=1&vanaf=2026-03-31&totEnMet=2026-04-30"   # 3: 31 mrt, 1 apr, 30 apr
curl "localhost:1080/v1/ledigingen?postcode=5678CD&huisnummer=1&vanaf=2026-04-01&totEnMet=2026-04-01"   # 1: alleen 1 apr
curl "localhost:1080/v1/ledigingen?postcode=5678CD&huisnummer=1&vanaf=2026-04-01&totEnMet=2026-04-30"   # 2: 1 apr en 30 apr
```

**Verwacht clientgedrag:** een periode van een hele maand levert de ledigingen op de eerste en de laatste dag van die maand mee.

## onbekend adres

**Doel:** controleren dat je client een niet-gevonden adres als fout toont, met de `detail` uit het antwoord.

```bash
curl -i "localhost:1080/v1/ledigingen?postcode=9999ZZ&huisnummer=1&$V"
```

Antwoord: `404` met `Content-Type: application/problem+json` en een `detail` die het adres noemt:

```json
{"type":"https://diftar-api.example/problemen/adres-niet-gevonden","title":"Adres niet gevonden","status":404,"detail":"Het adres 9999ZZ 1 staat niet in de dataset van de mock."}
```

Hetzelfde geldt voor een onbekende BAG-nummeraanduiding. "Bekend" betekent: aanwezig in de [dataset](configuratie.md#dataset).

**Verwacht clientgedrag:** de client onderscheidt `404` (onbekend adres) van `200` met een lege lijst (bekend adres, geen data).

## ongeldige aanvraag

**Doel:** controleren hoe je client reageert op een `400`.

```bash
curl -i "localhost:1080/v1/ledigingen?postcode=abc&huisnummer=12&$V"        # ongeldige postcode
curl -i "localhost:1080/v1/ledigingen?postcode=1234AB&huisnummer=12"        # periode ontbreekt
```

Antwoord: `400` met `application/problem+json` en een algemene `detail` ("Ongeldige of ontbrekende parameters of headers; zie de OpenAPI-specificatie."). De mock zegt niet welke parameter fout is.

Let op: de mock controleert niet of je tegelijk een adres én een BAG-nummeraanduiding meestuurt, of geen van beide; dat geeft gewoon een antwoord. Zie [bekende afwijkingen](../README.md#bekende-afwijkingen-van-het-contract).

**Verwacht clientgedrag:** de client toont een foutmelding en probeert dezelfde aanvraag niet opnieuw.
