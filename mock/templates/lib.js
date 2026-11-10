var BASE = '/v1';
var API_VERSION = '1.1.0';
var q = request.queryStringParameters || {};
function p(n, d) { return q[n] ? q[n][0] : d; }
function problem(status, slug, title, detail) {
  return { statusCode: status, headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [API_VERSION] },
    body: JSON.stringify({ type: 'https://diftar-api.example/problemen/' + slug, title: title, status: status, detail: detail }) };
}
// Dataset: adressen met ledigingen en stortingen. 'label' is een naam voor de testset, geen API-veld.
function gen(n, fracties, start) {
  var rows = [];
  for (var i = 0; i < n; i++) {
    var d = new Date(start + i * 7 * 86400000);
    rows.push({ datumTijd: d.toISOString().slice(0, 10) + 'T08:00:00+01:00', fractieCode: fracties[i % fracties.length][0], fractieOmschrijving: fracties[i % fracties.length][1] });
  }
  return rows;
}
var FRACTIES = [['GFT', 'GFT-afval'], ['RST', 'Restafval'], ['PMD', 'Plastic, metaal en drankenkartons']];
var START = Date.UTC(2026, 0, 5);
var ADRESSEN = {
  '1234AB-12': { label: 'veel-ledigingen', bag: '0518200000123456',
    ledigingen: gen(60, FRACTIES, START).map(function (r) { r.gewichtInKg = 12.5; return r; }),
    stortingen: gen(3, FRACTIES, START).map(function (r) { r.volumeInLiters = 30; r.VerzamelcontainerId = 'CC-00123'; r.VerzamelcontainerTitel = 'Ondergrondse container Marktstraat'; return r; }) },
  '1234AB-14': { label: 'bekend-maar-leeg', bag: '0518200000123457', ledigingen: [], stortingen: [] }
};
function vind() {
  var bag = p('nummeraanduidingIdentificatie', null);
  var toev = (p('huisletter', '') || '') + (p('huisnummertoevoeging', '') ? '-' + p('huisnummertoevoeging', '') : '');
  var key = p('postcode', '') + '-' + p('huisnummer', '') + (toev ? '|' + toev : '');
  for (var k in ADRESSEN) { if ((bag && ADRESSEN[k].bag === bag) || (!bag && k === key)) return ADRESSEN[k]; }
  return null;
}
function pagina(naam, totaalNaam) {
  var adres = vind();
  if (!adres) {
    var wie = p('nummeraanduidingIdentificatie', null) ? 'BAG-nummeraanduiding ' + p('nummeraanduidingIdentificatie', '') : 'adres ' + p('postcode', '') + ' ' + p('huisnummer', '');
    return problem(404, 'adres-niet-gevonden', 'Adres niet gevonden', 'Het ' + wie + ' staat niet in de dataset van de mock.');
  }
  var vanaf = p('vanaf', ''), tot = p('totEnMet', '');
  var rows = adres[naam].filter(function (r) { var d = r.datumTijd.slice(0, 10); return d >= vanaf && d <= tot; });
  var ps = parseInt(p('pageSize', '50'), 10), pg = parseInt(p('page', '1'), 10);
  var laatste = Math.max(1, Math.ceil(rows.length / ps));
  function link(n) { var s = request.queryStringParameters; var parts = []; for (var k in s) { if (k !== 'page') parts.push(k + '=' + encodeURIComponent(s[k][0])); } parts.push('page=' + n); return { href: BASE + request.path.replace(BASE, '') + '?' + parts.join('&') }; }
  var links = { self: link(pg), first: link(1), last: link(laatste) };
  if (pg < laatste) links.next = link(pg + 1);
  if (pg > 1) links.prev = link(pg - 1);
  var body = { _links: links }; body[totaalNaam] = rows.length; body[naam] = rows.slice((pg - 1) * ps, pg * ps);
  return { statusCode: 200, headers: { 'Content-Type': ['application/json'], 'API-Version': [API_VERSION] }, body: JSON.stringify(body) };
}
