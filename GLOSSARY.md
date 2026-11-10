# Glossary — Diftar Ledigingen API

## Lediging
Eén registratie van het legen van een minicontainer op een bepaald adres, op een bepaald moment, met een bepaalde afvalfractie en (optioneel) gewicht. Vervangt de leveranciersterm "mc_dump"/"dump".

## Fractie
De soort afval die bij een lediging is ingezameld (bijv. GFT, Rest, PMD). Wordt vooralsnog als vrije string (`fractieCode`) gemodelleerd; zie open actie bij de leverancier om dit om te zetten naar een vastgelegde codelijst (enum).

## Nummeraanduiding
BAG-begrip: de unieke aanduiding van een adresseerbaar object (postcode + huisnummer + eventuele huisletter/-toevoeging). Geïdentificeerd door `nummeraanduidingIdentificatie` (16-cijferig BAG-id). Een Lediging hoort bij precies één Nummeraanduiding.

## Postcode / Huisnummer / Huisletter / Huisnummertoevoeging
BAG-velden die samen een adres identificeren, overgenomen 1-op-1 uit de BAG/BRP-naamgeving (zie ook Haal Centraal BRP). Gebruikt als alternatief voor `nummeraanduidingIdentificatie` om een adres te bevragen.

## NL-Portal
De "mijnomgeving" van de gemeente waarin een ingelogde burger (via DigiD/eHerkenning) zijn eigen Diftar-ledigingen kan inzien. NL-Portal voert zelf de koppeling burger → adres uit (via BRP Haal Centraal) vóórdat de Diftar Ledigingen API wordt aangeroepen; de Diftar Ledigingen API kent geen burgers, enkel adressen. Zie [[adr-0001-client-credentials-security]].

## NewWaste
De leverancier/backend-organisatie die de Diftar Ledigingen API technisch host en de ledigingdata beheert. Kent alleen adressen, gekoppelde passen en ledigingen — geen burgergegevens (geen BSN).

## Diftar Ledigingen API
De API in deze repository (voorheen "Pinkroccade MijnOmgeving API"). Levert ledigingen op, gefilterd op adres of BAG-nummeraanduiding-ID en een periode (`vanaf`/`totEnMet`).

## Mock
Nabootsing van de Diftar Ledigingen API in `mock/`, gegenereerd uit de spec, voor ontwikkel- en testdoeleinden. Nooit voor productie. Zie [`mock/README.md`](mock/README.md).

## Dataset
Het bestand `mock/dataset/dataset.json` met de adressen, ledigingen en stortingen die de mock teruggeeft. Een adres of BAG-nummeraanduiding is "bekend" als het in de dataset staat; anders geeft de mock `404`.

## Scenario-adres
Een vast adres in de dataset met een naam (`label`) dat één situatie van een client laat testen, bijvoorbeeld paginering of een bekend adres zonder ledigingen. Het label is een naam in de dataset en geen API-veld.

## Modus
De manier waarop de mock omgaat met authenticatie: `none` (geen token nodig) of `keycloak` (token verplicht aanwezig, via de Keycloak-voorbeeldinrichting; de mock controleert het token zelf niet).
