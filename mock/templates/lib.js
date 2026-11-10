var BASE = '/v1';
var API_VERSION = '1.1.0';
var q = request.queryStringParameters || {};
function p(n, d) { return q[n] ? q[n][0] : d; }
function problem(status, slug, title, detail) {
  return { statusCode: status, headers: { 'Content-Type': ['application/problem+json'], 'API-Version': [API_VERSION] },
    body: JSON.stringify({ type: 'https://diftar-api.example/problemen/' + slug, title: title, status: status, detail: detail }) };
}
// Dataset: wordt bij het genereren ingevuld vanuit mock/dataset/dataset.json.
var ADRESSEN = __DATASET__;
function vind() {
  var bag = p('nummeraanduidingIdentificatie', null);
  for (var i = 0; i < ADRESSEN.length; i++) {
    var a = ADRESSEN[i];
    if (bag ? a.nummeraanduidingIdentificatie === bag
            : a.postcode === p('postcode', '') && String(a.huisnummer) === p('huisnummer', '') &&
              (a.huisletter || '') === p('huisletter', '') && (a.huisnummertoevoeging || '') === p('huisnummertoevoeging', '')) {
      return { ledigingen: a.ledigingen || [], stortingen: a.stortingen || [] };
    }
  }
  return null;
}
function pagina(naam, totaalNaam) {
  var adres = vind();
  if (!adres) {
    var wie = p('nummeraanduidingIdentificatie', null)
      ? 'BAG-nummeraanduiding ' + p('nummeraanduidingIdentificatie', '')
      : 'adres ' + p('postcode', '') + ' ' + p('huisnummer', '') + p('huisletter', '') + (p('huisnummertoevoeging', '') ? '-' + p('huisnummertoevoeging', '') : '');
    return problem(404, 'adres-niet-gevonden', 'Adres niet gevonden', 'Het ' + wie + ' staat niet in de dataset van de mock.');
  }
  // Periode inclusief, op datum (de datumdelen van vanaf en totEnMet).
  var vanaf = p('vanaf', ''), tot = p('totEnMet', '');
  var rows = adres[naam].filter(function (r) { var d = r.datumTijd.slice(0, 10); return d >= vanaf && d <= tot; });
  var ps = parseInt(p('pageSize', '50'), 10), pg = parseInt(p('page', '1'), 10);
  var laatste = Math.max(1, Math.ceil(rows.length / ps));
  function link(n) {
    var parts = [];
    for (var k in q) { if (k !== 'page') parts.push(k + '=' + encodeURIComponent(q[k][0])); }
    parts.push('page=' + n);
    return { href: request.path + '?' + parts.join('&') };
  }
  var links = { self: link(pg), first: link(1), last: link(laatste) };
  if (pg < laatste) links.next = link(pg + 1);
  if (pg > 1) links.prev = link(pg - 1);
  var body = { _links: links };
  body[totaalNaam] = rows.length;
  body[naam] = rows.slice((pg - 1) * ps, pg * ps);
  return { statusCode: 200, headers: { 'Content-Type': ['application/json'], 'API-Version': [API_VERSION] }, body: JSON.stringify(body) };
}
