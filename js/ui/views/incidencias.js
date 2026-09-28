/* ==========================================================================
   ui/views/incidencias.js — Incidencias y notas de campo
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, formatDateShort, formatTime } = App.util;
  const ui = () => App.ui;
  const st = () => App.ui.state;
  const can = (a, r) => App.auth.can(a, r);

  /** Fila de incidencia. Se usa aquí, en el detalle del pedido y en la hoja de etapa. */
  function incidenciaFila(x, opts) {
    opts = opts || {};
    const esNota = x.tipo === 'nota';
    const tono = x.resuelta ? 'ok' : esNota ? '' : x.gravedad === 'alta' ? 'alerta' : x.gravedad === 'media' ? 'aviso' : '';
    const p = x.pedidoId ? App.repo.get('pedidos', x.pedidoId) : null;
    const t = p ? App.pedidos.titulo(p) : null;
    const etapa = p && x.etapaIdx !== null && x.etapaIdx !== undefined && p.etapas[x.etapaIdx] ? p.etapas[x.etapaIdx].nombre : null;
    const cuando = formatDateShort(x.creada) + ' ' + formatTime(x.creada);

    let html = '<div class="incidencia' + (x.resuelta ? ' resuelta' : '') + (esNota ? ' es-nota' : ' grav-' + esc(x.gravedad)) + '">' +
      '<div class="incidencia-cabecera">' +
      ui().chip(esNota ? ui().icono('nota', 'ico-chip') + 'Nota' : 'Incidencia · ' + esc(App.incidencias.GRAVEDADES[x.gravedad] || ''), tono) +
      (x.resuelta ? ui().chip('Resuelta', 'ok') : '') +
      '<span class="incidencia-meta">' + esc(App.auth.nombreDe(x.usuarioId)) + ' · ' + cuando + '</span></div>' +
      '<p class="incidencia-texto">' + esc(x.texto) + '</p>';

    if (!opts.compacta && t) {
      html += '<button type="button" class="enlace" data-action="ir-pedido" data-id="' + esc(p.id) + '">' + esc(t.linea) + (etapa ? ' — ' + esc(etapa) : '') + '</button>';
    } else if (opts.compacta && etapa && !opts.sinEtapa) {
      html += '<span class="incidencia-meta">' + esc(etapa) + '</span>';
    }

    const acciones = [];
    if (!esNota && can('incidencia.resolver')) {
      acciones.push(x.resuelta
        ? '<button type="button" class="btn btn-pequeno" data-action="reabrir-incidencia" data-id="' + esc(x.id) + '">Reabrir</button>'
        : '<button type="button" class="btn btn-pequeno" data-action="resolver-incidencia" data-id="' + esc(x.id) + '">' + ui().icono('check') + 'Marcar resuelta</button>');
    }
    if (esNota && !x.resuelta && can('incidencia.resolver')) {
      acciones.push('<button type="button" class="btn btn-pequeno" data-action="resolver-incidencia" data-id="' + esc(x.id) + '">Archivar</button>');
    }
    if (can('incidencia.borrar', x)) {
      acciones.push('<button type="button" class="btn btn-pequeno btn-peligro" data-action="borrar-incidencia" data-id="' + esc(x.id) + '">' + ui().icono('borrar') + 'Borrar</button>');
    }
    if (acciones.length) html += '<div class="incidencia-acciones">' + acciones.join('') + '</div>';
    return html + '</div>';
  }

  App.views = App.views || {};
  App.views.incidenciaFila = incidenciaFila;

  App.views.incidencias = function renderIncidencias() {
    const f = st().filtroIncidencias;
    let lista = App.incidencias.todas();
    if (f === 'abiertas') lista = lista.filter(x => !x.resuelta);
    else if (f === 'resueltas') lista = lista.filter(x => x.resuelta);

    return '<div class="barra-herramientas"><p class="intro">Cualquiera puede avisar de un problema o dejar una nota del taller.</p>' +
      (can('incidencia.crear') ? '<button type="button" class="btn btn-primario" data-action="nueva-incidencia">' + ui().icono('plus') + '<span>Reportar</span></button>' : '') + '</div>' +
      ui().segmentos('filtro-incidencias', f, [['abiertas', 'Abiertas'], ['resueltas', 'Resueltas'], ['todas', 'Todas']]) +
      (lista.length ? lista.map(x => incidenciaFila(x)).join('') : ui().vacio(f === 'abiertas' ? 'No hay nada abierto. Todo en orden.' : 'No hay registros en esta vista.'));
  };

  /* -------------------------- Hoja: nueva incidencia ----------------------- */

  function opcionesEtapa(pedidoId, seleccion) {
    const p = pedidoId ? App.repo.get('pedidos', pedidoId) : null;
    if (!p) return '<option value="">—</option>';
    return ui().opciones(p.etapas.map((e, i) => [i, (i + 1) + '. ' + e.nombre]), seleccion, 'Todo el pedido');
  }
  App.views.opcionesEtapa = opcionesEtapa;

  App.sheets = App.sheets || {};
  App.sheets.incidencia = function ({ pedidoId, etapaIdx }) {
    const pedidos = App.pedidos.activos().concat(App.pedidos.terminados().slice(0, 10));
    const c = '<form class="formulario" data-form="incidencia" novalidate>' +
      '<div class="campo"><span class="campo-etiqueta">Tipo</span><div class="opciones-radio">' +
      '<label class="radio"><input type="radio" name="tipo" value="incidencia" checked data-change="tipo-incidencia"><span>Incidencia</span></label>' +
      '<label class="radio"><input type="radio" name="tipo" value="nota" data-change="tipo-incidencia"><span>Nota de campo</span></label></div></div>' +
      '<div class="campo" id="campo-gravedad"><span class="campo-etiqueta">Gravedad</span><div class="opciones-radio">' +
      '<label class="radio"><input type="radio" name="gravedad" value="baja"><span>Baja</span></label>' +
      '<label class="radio"><input type="radio" name="gravedad" value="media" checked><span>Media</span></label>' +
      '<label class="radio radio-alerta"><input type="radio" name="gravedad" value="alta"><span>Alta</span></label></div></div>' +
      ui().campo('Pedido', '<select id="inc-pedido" name="pedidoId" data-change="pedido-incidencia">' +
        ui().opciones(pedidos.map(p => { return [p.id, App.pedidos.titulo(p).linea]; }), pedidoId || '', 'Sin pedido (general del taller)') + '</select>') +
      ui().campo('Etapa', '<select id="inc-etapa" name="etapaIdx"' + (pedidoId ? '' : ' disabled') + '>' + opcionesEtapa(pedidoId, etapaIdx) + '</select>') +
      ui().campo('Qué ha pasado', '<textarea id="inc-texto" name="texto" rows="4" placeholder="Describe el problema o la observación" autofocus></textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">Guardar</button></div></form>';
    return { titulo: 'Reportar incidencia o nota', cuerpo: c };
  };
})(window.App = window.App || {});
App.sheets.incidencia.estatica = true;
