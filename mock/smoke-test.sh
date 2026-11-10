#!/bin/sh
# Rooktest van de mock: controleert de belangrijkste flows op statuscode en inhoudstype.
# Gebruik: mock/smoke-test.sh [basis-url] [modus]    (standaard http://localhost:1080 en none)
# Modus keycloak verwacht een 401 zonder Authorization-header; modus none heeft geen token nodig.
BASE="${1:-http://localhost:1080}"
MODUS="${2:-none}"
V="vanaf=2026-01-01&totEnMet=2026-12-31"
FOUTEN=0
AUTH=""
[ "$MODUS" = "keycloak" ] && AUTH="Authorization: Bearer test"

controleer() { # naam, verwachte status, verwacht inhoudstype, pad
  uitkomst=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' ${AUTH:+-H "$AUTH"} "$BASE$4")
  if [ "${uitkomst%% *}" = "$2" ] && echo "$uitkomst" | grep -q "$3"; then
    echo "ok     $1 ($uitkomst)"
  else
    echo "FOUT   $1: verwacht $2 $3, kreeg $uitkomst"
    FOUTEN=$((FOUTEN + 1))
  fi
}

controleer "ledigingen, veel (paginering)" 200 application/json "/v1/ledigingen?postcode=1234AB&huisnummer=12&$V&pageSize=20&page=2"
controleer "ledigingen via BAG-id" 200 application/json "/v1/ledigingen?nummeraanduidingIdentificatie=0518200000123456&$V"
controleer "ledigingen, bekend maar leeg" 200 application/json "/v1/ledigingen?postcode=1234AB&huisnummer=14&$V"
controleer "stortingen" 200 application/json "/v1/stortingen?postcode=1234AB&huisnummer=16&$V"
controleer "huisletter en toevoeging" 200 application/json "/v1/ledigingen?postcode=1234AB&huisnummer=18&huisletter=A&huisnummertoevoeging=bis&$V"
controleer "onbekend adres" 404 application/problem+json "/v1/ledigingen?postcode=9999ZZ&huisnummer=1&$V"
controleer "ongeldige postcode" 400 application/problem+json "/v1/ledigingen?postcode=abc&huisnummer=12&$V"
controleer "ontbrekende periode" 400 application/problem+json "/v1/ledigingen?postcode=1234AB&huisnummer=12"
AUTH=""
controleer "openapi.json" 200 application/json "/v1/openapi.json"
if [ "$MODUS" = "keycloak" ]; then
  controleer "zonder token" 401 application/problem+json "/v1/ledigingen?postcode=1234AB&huisnummer=12&$V"
else
  controleer "zonder token (modus none)" 200 application/json "/v1/ledigingen?postcode=1234AB&huisnummer=12&$V"
fi

[ "$FOUTEN" -eq 0 ] && echo "Alle controles geslaagd." || { echo "$FOUTEN controle(s) mislukt."; exit 1; }
