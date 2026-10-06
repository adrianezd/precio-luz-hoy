// Mercado mayorista: precio spot cada 15 minutos (REData).
var API = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
var datos = { hoy: null, manana: null }, diaActivo = 'hoy';
function $(id) { return document.getElementById(id); }
function fechaMadrid(dd) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(Date.now() + dd * 86400000)); }
function horaMinMadrid() {
  var p = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':');
  return +p[0] * 60 + +p[1];
}
function num(v) { return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function cargar(fecha) {
  return fetch(API + '?start_date=' + fecha + 'T00:00&end_date=' + fecha + 'T23:59&time_trunc=hour&geo_ids=8741')
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var s = (j.included || []).filter(function (x) { return x.type === 'Precio mercado spot'; })[0];
      if (!s) return null;
      var v = s.attributes.values.filter(function (x) { return x.datetime.slice(0, 10) === fecha; });
      return v.length >= 90 ? v.map(function (x) { return { t: x.datetime.slice(11, 16), m: +x.datetime.slice(11, 13) * 60 + +x.datetime.slice(14, 16), p: x.value }; }) : null;
    }).catch(function () { return null; });
}

function pintar() {
  var d = datos[diaActivo], esHoy = diaActivo === 'hoy';
  $('titDia').textContent = esHoy ? 'hoy' : 'mañana';
  $('fecha').textContent = new Date(fechaMadrid(esHoy ? 0 : 1) + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('activa', b.dataset.dia === diaActivo); });
  if (!d) return;
  var min = d.reduce(function (a, b) { return b.p < a.p ? b : a; });
  var max = d.reduce(function (a, b) { return b.p > a.p ? b : a; });
  var media = d.reduce(function (s, x) { return s + x.p; }, 0) / d.length;
  var ahora = horaMinMadrid();
  var act = esHoy ? d.filter(function (x) { return x.m <= ahora; }).pop() : null;
  $('bloqueAhora').hidden = !act;
  if (act) { $('etqAhora').textContent = 'Desde las ' + act.t; $('precioAhora').textContent = num(act.p); }
  $('minP').textContent = num(min.p); $('minH').textContent = 'a las ' + min.t;
  $('maxP').textContent = num(max.p); $('maxH').textContent = 'a las ' + max.t;
  $('medP').textContent = num(media);
  var bajo = Math.min(0, min.p), rango = (max.p - bajo) || 1;
  var g = $('grafica');
  g.style.gridTemplateColumns = 'repeat(' + d.length + ', 1fr)';
  g.innerHTML = d.map(function (x) {
    var nivel = x.p < media * 0.85 ? 'bajo' : x.p > media * 1.15 ? 'alto' : 'medio';
    return '<div class="barra' + (act && x === act ? ' actual' : '') + (x.t.slice(3) === '00' && x.m % 360 === 0 ? ' marca' : '') + '" style="height:' + Math.max(2, (x.p - bajo) / rango * 100) + '%;background:var(--' + nivel + ')" title="' + x.t + ': ' + num(x.p) + ' €/MWh"><span class="h">' + x.t.slice(0, 2) + '</span></div>';
  }).join('');
}

document.querySelectorAll('.tab').forEach(function (b) { b.onclick = function () { if (datos[b.dataset.dia]) { diaActivo = b.dataset.dia; pintar(); } }; });
Promise.all([cargar(fechaMadrid(0)), cargar(fechaMadrid(1))]).then(function (r) {
  datos.hoy = r[0]; datos.manana = r[1];
  document.querySelector('[data-dia="manana"]').disabled = !r[1];
  if (!r[0]) { $('error').hidden = false; $('error').textContent = 'No se han podido cargar los precios. Prueba a recargar en un rato.'; }
  pintar();
});
