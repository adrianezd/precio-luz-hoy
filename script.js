// Precio de la luz hoy: lee el PVPC de REData (Red Eléctrica) en el navegador.
var API = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real';
var datos = { hoy: null, manana: null };
var diaActivo = 'hoy';

function fechaMadrid(desfaseDias) {
  var d = new Date(Date.now() + (desfaseDias || 0) * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(d); // AAAA-MM-DD
}
function horaMadrid() {
  return +new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
}
function euros(v) { return v.toFixed(4).replace('.', ','); }
function hh(h) { return String(h).padStart(2, '0') + ':00'; }

function cargarDia(fecha) {
  var url = API + '?start_date=' + fecha + 'T00:00&end_date=' + fecha + 'T23:59&time_trunc=hour&geo_ids=8741';
  return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
    var pvpc = (j.included || []).filter(function (x) { return x.type === 'PVPC'; })[0];
    if (!pvpc) return null;
    var vals = pvpc.attributes.values.filter(function (v) { return v.datetime.slice(0, 10) === fecha; });
    if (vals.length < 23) return null;
    // Los días de cambio de hora tienen 23 o 25 horas: se indexa por posición.
    return vals.map(function (v, i) { return { h: +v.datetime.slice(11, 13), i: i, p: v.value / 1000 }; });
  }).catch(function () { return null; });
}

function niveles(horas) {
  var orden = horas.map(function (x) { return x.p; }).sort(function (a, b) { return a - b; });
  var t1 = orden[Math.floor(orden.length / 3)], t2 = orden[Math.floor(orden.length * 2 / 3)];
  return function (p) { return p < t1 ? 'bajo' : p < t2 ? 'medio' : 'alto'; };
}
var NOMBRE = { bajo: 'Barata', medio: 'Normal', alto: 'Cara' };

function mejorVentana(horas, n) {
  var mejor = null;
  for (var i = 0; i + n <= horas.length; i++) {
    var s = 0;
    for (var k = 0; k < n; k++) s += horas[i + k].p;
    if (!mejor || s < mejor.s) mejor = { s: s, i: i };
  }
  return mejor && { desde: horas[mejor.i].h, hasta: (horas[mejor.i + n - 1].h + 1) % 24, media: mejor.s / n };
}

function pintar() {
  var horas = datos[diaActivo];
  var esHoy = diaActivo === 'hoy';
  document.getElementById('titDia').textContent = esHoy ? 'hoy' : 'mañana';
  var f = new Date(fechaMadrid(esHoy ? 0 : 1) + 'T12:00:00');
  document.getElementById('fecha').textContent = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('activa', b.dataset.dia === diaActivo); });
  if (!horas) return;

  var nivel = niveles(horas);
  var ahora = horaMadrid();
  var ref = esHoy ? (horas.filter(function (x) { return x.h === ahora; })[0] || horas[0]) : null;
  var min = horas.reduce(function (a, b) { return b.p < a.p ? b : a; });
  var max = horas.reduce(function (a, b) { return b.p > a.p ? b : a; });
  var media = horas.reduce(function (s, x) { return s + x.p; }, 0) / horas.length;

  var bloque = document.getElementById('bloqueAhora');
  bloque.hidden = !esHoy;
  if (ref) {
    document.getElementById('etqAhora').textContent = 'Ahora, de ' + hh(ref.h) + ' a ' + hh((ref.h + 1) % 24);
    document.getElementById('precioAhora').textContent = euros(ref.p);
    var n = nivel(ref.p), el = document.getElementById('nivelAhora');
    el.textContent = NOMBRE[n]; el.style.background = 'var(--' + n + ')';
  }
  document.getElementById('minP').textContent = euros(min.p);
  document.getElementById('minH').textContent = hh(min.h) + ' a ' + hh((min.h + 1) % 24);
  document.getElementById('maxP').textContent = euros(max.p);
  document.getElementById('maxH').textContent = hh(max.h) + ' a ' + hh((max.h + 1) % 24);
  document.getElementById('medP').textContent = euros(media);

  var g = document.getElementById('grafica');
  g.style.gridTemplateColumns = 'repeat(' + horas.length + ', 1fr)';
  g.innerHTML = horas.map(function (x) {
    var alto = Math.max(4, x.p / max.p * 100);
    return '<div class="barra' + (ref && x.i === ref.i ? ' actual' : '') + '" style="height:' + alto + '%;background:var(--' + nivel(x.p) + ')" title="' + hh(x.h) + ': ' + euros(x.p) + ' €/kWh"><span class="h">' + x.h + '</span></div>';
  }).join('');

  // Para hoy solo cuentan las horas que quedan.
  var futuras = esHoy ? horas.filter(function (x) { return x.i >= (ref ? ref.i : 0); }) : horas;
  var tareas = [['🧺 Lavadora', 2], ['🍽️ Lavavajillas', 2], ['🔥 Horno', 1], ['🚗 Cargar el coche', 4]];
  document.getElementById('mejores').innerHTML = tareas.map(function (t) {
    var v = mejorVentana(futuras, t[1]);
    return '<li><span>' + t[0] + '</span><b>' + (v ? hh(v.desde) + ' a ' + hh(v.hasta) : 'Ya no quedan horas') + '</b></li>';
  }).join('');

  var sel = document.getElementById('horaCalc');
  sel.innerHTML = horas.map(function (x) {
    return '<option value="' + x.i + '"' + ((ref ? x.i === ref.i : x.i === min.i) ? ' selected' : '') + '>A las ' + hh(x.h) + '</option>';
  }).join('');
  calcular();
}

function calcular() {
  var horas = datos[diaActivo];
  if (!horas) return;
  var a = document.getElementById('aparato').value.split('|');
  var kw = +a[0], dur = +a[1];
  var inicio = +document.getElementById('horaCalc').value;
  var coste = 0, resto = dur, i = inicio;
  while (resto > 0 && i < horas.length) { var t = Math.min(1, resto); coste += kw * t * horas[i].p; resto -= t; i++; }
  var minimo = mejorVentana(horas, Math.ceil(dur));
  var txt = 'Cuesta unos <b>' + coste.toFixed(2).replace('.', ',') + ' €</b>';
  if (minimo) txt += '. En la hora más barata serían ' + (kw * dur * minimo.media).toFixed(2).replace('.', ',') + ' €.';
  document.getElementById('coste').innerHTML = txt;
}

function compartir() {
  var h = datos.hoy;
  if (!h) return;
  var min = h.reduce(function (a, b) { return b.p < a.p ? b : a; });
  var max = h.reduce(function (a, b) { return b.p > a.p ? b : a; });
  var txt = '⚡ Luz hoy: la hora más barata es de ' + hh(min.h) + ' a ' + hh((min.h + 1) % 24) + ' (' + euros(min.p) + ' €/kWh) y la más cara de ' + hh(max.h) + ' a ' + hh((max.h + 1) % 24) + ' (' + euros(max.p) + ' €/kWh)\n' + location.href;
  if (navigator.share) navigator.share({ text: txt }).catch(function () {});
  else navigator.clipboard.writeText(txt).then(function () { document.getElementById('compartir').textContent = 'Copiado'; });
}

document.querySelectorAll('.tab').forEach(function (b) {
  b.addEventListener('click', function () { if (datos[b.dataset.dia]) { diaActivo = b.dataset.dia; pintar(); } });
});
document.getElementById('aparato').addEventListener('change', calcular);
document.getElementById('horaCalc').addEventListener('change', calcular);
document.getElementById('compartir').addEventListener('click', compartir);

Promise.all([cargarDia(fechaMadrid(0)), cargarDia(fechaMadrid(1))]).then(function (r) {
  datos.hoy = r[0]; datos.manana = r[1];
  document.querySelector('[data-dia="manana"]').disabled = !r[1];
  if (!r[1]) document.querySelector('[data-dia="manana"]').title = 'Se publica hacia las 20:30';
  if (!r[0]) {
    var e = document.getElementById('error');
    e.hidden = false; e.textContent = 'No se han podido cargar los precios de Red Eléctrica. Prueba a recargar en un rato.';
  }
  pintar();
});
