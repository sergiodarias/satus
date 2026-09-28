/* ==========================================================================
   ui/components.js — Piezas de interfaz reutilizables
   --------------------------------------------------------------------------
   Funciones que devuelven HTML (texto) a partir de datos, más los tres
   elementos flotantes: hoja inferior (formularios), diálogo de confirmación
   y aviso breve (toast). Todo el texto dinámico pasa por esc().
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc } = App.util;

  /* --------------------------------- Iconos -------------------------------- */
  const ICONOS = {
    panel: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    pedidos: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3.5h6v2H9zM8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
    incidencias: '<path d="M12 3.5 2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4.2M12 17h.01"/>',
    catalogo: '<path d="M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3v-9z"/><path d="M3.5 7.5 12 11.8l8.5-4.3M12 11.8v9"/>',
    clientes: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.8-3.4 3.3-5.2 6.2-5.2s5.4 1.8 6.2 5.2"/><path d="M15.8 4.8a3.3 3.3 0 0 1 0 6.4M17.6 14.6c1.7.7 2.9 2.3 3.4 4.9"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    cerrar: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    derecha: '<path d="M9.5 6l6 6-6 6"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    editar: '<path d="M4.5 19.5h4l10-10-4-4-10 10v4z"/><path d="M13 7l4 4"/>',
    borrar: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
    nota: '<path d="M5.5 4h9l4 4v12h-13z"/><path d="M14.5 4v4h4M9 12.5h6M9 16h4"/>',
    usuario: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
    caja: '<path d="M4 8h16v11H4zM3 4.5h18V8H3zM10 12h4"/>',
    telefono: '<path d="M6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4 5.5a2 2 0 0 1 2-2z"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>'
  };

  function icono(nombre, clase) {
    return '<svg class="ico ' + (clase || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICONOS[nombre] || '') + '</svg>';
  }

  /* ------------------------------- Pequeñas -------------------------------- */

  function chip(texto, tono) {
    return '<span class="chip' + (tono ? ' chip-' + tono : '') + '">' + texto + '</span>';
  }

  function vacio(texto, accionHtml) {
    return '<div class="vacio"><p>' + texto + '</p>' + (accionHtml || '') + '</div>';
  }

  function kpi(valor, etiqueta, tono) {
    return '<div class="kpi' + (tono ? ' kpi-' + tono : '') + '"><div class="kpi-valor">' + valor + '</div><div class="kpi-etiqueta">' + etiqueta + '</div></div>';
  }

  function avatar(usuario, clase) {
    if (!usuario) return '';
    return '<span class="avatar avatar-' + esc(usuario.rol) + ' ' + (clase || '') + '" title="' + esc(usuario.nombre) + '">' + esc(App.util.iniciales(usuario.nombre)) + '</span>';
  }

  /** Barra de progreso segmentada (una pieza por etapa). */
  function progreso(pedido) {
    const est = App.pedidos.estado(pedido);
    return '<span class="progreso" role="img" aria-label="' + (est.ultimaCompletada + 1) + ' de ' + pedido.etapas.length + ' etapas">' +
      pedido.etapas.map((e, i) => '<span class="seg ' + (e.completada ? 'hecho' : (i === est.actualIdx && !est.terminado ? 'actual' : '')) + '"></span>').join('') + '</span>';
  }

  /** Segmentos tipo pestaña (filtros). opciones: [[valor, etiqueta], …] */
  function segmentos(accion, actual, opciones) {
    return '<div class="segmentos" role="tablist">' + opciones.map(([v, t]) =>
      '<button type="button" role="tab" aria-selected="' + (v === actual) + '" class="segmento' + (v === actual ? ' activo' : '') + '" data-action="' + accion + '" data-valor="' + esc(v) + '">' + t + '</button>').join('') + '</div>';
  }

  function opciones(lista, seleccionado, vacioTexto) {
    return (vacioTexto !== undefined ? '<option value="">' + esc(vacioTexto) + '</option>' : '') +
      lista.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(seleccionado) ? ' selected' : '') + '>' + esc(t) + '</option>').join('');
  }

  /** Campo de formulario con etiqueta. `control` es el HTML del input/select. */
  function campo(etiqueta, control, extra) {
    return '<label class="campo' + (extra && extra.ancho ? ' campo-ancho' : '') + '"><span class="campo-etiqueta">' + etiqueta + '</span>' + control +
      (extra && extra.ayuda ? '<span class="campo-ayuda">' + extra.ayuda + '</span>' : '') + '</label>';
  }

  /* ---------------------------------- Toast -------------------------------- */

  let toastTimer = null;
  function toast(texto, tono) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    root.innerHTML = '<div class="toast' + (tono ? ' toast-' + tono : '') + '" role="status">' + esc(texto) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { root.innerHTML = ''; }, 3200);
  }

  /* ---------------------------- Diálogo de confirmación -------------------- */
  // Sustituye a window.confirm(): funciona igual en la app instalada, en
  // Safari y en la vista previa, y se puede probar automáticamente.

  let resolverDialogo = null;
  function confirmar({ titulo, texto, ok = 'Aceptar', cancelar = 'Cancelar', peligro = false }) {
    const root = document.getElementById('dialog-root');
    if (resolverDialogo) resolverDialogo(false);
    root.innerHTML = '<div class="velo velo-dialogo" data-action="dialogo-no"></div>' +
      '<div class="dialogo" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">' +
      '<h2 id="dlg-t" class="dialogo-titulo">' + esc(titulo) + '</h2>' +
      (texto ? '<p class="dialogo-texto">' + esc(texto) + '</p>' : '') +
      '<div class="dialogo-acciones"><button type="button" class="btn" data-action="dialogo-no">' + esc(cancelar) + '</button>' +
      '<button type="button" class="btn ' + (peligro ? 'btn-peligro-lleno' : 'btn-primario') + '" data-action="dialogo-si">' + esc(ok) + '</button></div></div>';
    const btn = root.querySelector('[data-action="dialogo-si"]');
    if (btn && btn.focus) btn.focus();
    return new Promise(res => { resolverDialogo = res; });
  }
  function cerrarDialogo(valor) {
    const root = document.getElementById('dialog-root');
    if (root) root.innerHTML = '';
    const r = resolverDialogo; resolverDialogo = null;
    if (r) r(valor);
  }

  /* ------------------------------ Hoja inferior ---------------------------- */
  // En móvil sube desde abajo; en escritorio es un panel centrado.
  // Cada hoja se define en App.sheets[nombre] = params => ({ titulo, subtitulo, cuerpo }).

  // Hojas "de formulario" (estatica: true) no se vuelven a pintar mientras
  // están abiertas, para no perder lo que el usuario está escribiendo.
  // Las demás se refrescan, conservando los valores tecleados por id.
  let hojaActual = null;
  function abrirHoja(nombre, params) {
    hojaActual = { nombre, params: params || {} };
    pintarHoja(true);
    const primer = document.querySelector('#sheet-root [autofocus]');
    if (primer && primer.focus && window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) primer.focus();
  }
  function pintarHoja(forzar) {
    const root = document.getElementById('sheet-root');
    if (!root) return;
    if (!hojaActual) { root.innerHTML = ''; document.body.classList.remove('con-hoja'); return; }
    const def = App.sheets[hojaActual.nombre];
    if (!def) { hojaActual = null; root.innerHTML = ''; return; }
    const pintada = root.getAttribute('data-hoja') === hojaActual.nombre && root.querySelector('.hoja');
    if (!forzar && pintada && def.estatica) return;
    const h = def(hojaActual.params);
    if (!h) { cerrarHoja(); return; }
    const scroll = root.querySelector('.hoja-cuerpo');
    const posicion = scroll && pintada ? scroll.scrollTop : 0;
    const valores = {};
    if (pintada && !forzar) {
      root.querySelectorAll('input[id], textarea[id]').forEach(el => {
        if (el.type !== 'file' && el.type !== 'radio' && el.type !== 'checkbox') valores[el.id] = el.value;
      });
    }
    root.setAttribute('data-hoja', hojaActual.nombre);
    root.innerHTML = '<div class="velo" data-action="cerrar-hoja"></div>' +
      '<section class="hoja" role="dialog" aria-modal="true" aria-labelledby="hoja-t">' +
      '<header class="hoja-cabecera"><div><h2 id="hoja-t" class="hoja-titulo">' + h.titulo + '</h2>' +
      (h.subtitulo ? '<p class="hoja-subtitulo">' + h.subtitulo + '</p>' : '') + '</div>' +
      '<button type="button" class="btn-icono" data-action="cerrar-hoja" aria-label="Cerrar">' + icono('cerrar') + '</button></header>' +
      '<div class="hoja-cuerpo">' + h.cuerpo + '</div></section>';
    document.body.classList.add('con-hoja');
    Object.keys(valores).forEach(id => { const el = document.getElementById(id); if (el) el.value = valores[id]; });
    const nuevo = root.querySelector('.hoja-cuerpo');
    if (nuevo && posicion) nuevo.scrollTop = posicion;
  }
  function cerrarHoja() { hojaActual = null; const r = document.getElementById('sheet-root'); if (r) r.removeAttribute('data-hoja'); pintarHoja(); }
  function hoja() { return hojaActual; }

  App.ui = Object.assign(App.ui || {}, {
    icono, chip, vacio, kpi, avatar, progreso, segmentos, opciones, campo,
    toast, confirmar, cerrarDialogo, abrirHoja, pintarHoja, cerrarHoja, hoja
  });
})(window.App = window.App || {});
