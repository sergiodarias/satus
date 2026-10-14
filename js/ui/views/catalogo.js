/* ==========================================================================
   ui/views/catalogo.js — Productos fabricados y materiales (con lo gastado)
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, formatNumber, formatDateShort, plural } = App.util;
  const ui = () => App.ui;
  const st = () => App.ui.state;
  const can = (a, r) => App.auth.can(a, r);

  const TIPOS = [['interior', 'Interior'], ['exterior', 'Exterior']];
  const REVESTIMIENTOS = [['microcemento', 'Microcemento'], ['cal', 'Cal'], ['otro', 'Otro']];
  const UNIDADES = [['ud', 'Unidades (ud)'], ['kg', 'Kilogramos (kg)'], ['l', 'Litros (l)'], ['m', 'Metros (m)'], ['m2', 'Metros cuadrados (m²)']];

  function euros(n) { return n === null || n === undefined || n === '' ? '' : formatNumber(n) + ' €'; }

  function filaProducto(p) {
    const ruta = App.catalogo.rutaDe(p);
    const abierto = st().productoAbierto === p.id;
    const tipo = (TIPOS.find(t => t[0] === p.tipo) || [])[1];
    const rev = (REVESTIMIENTOS.find(t => t[0] === p.material) || [])[1];
    let html = '<article class="ficha' + (abierto ? ' abierta' : '') + '" id="producto-' + esc(p.id) + '">' +
      '<button type="button" class="ficha-cabecera" data-action="alternar-producto" data-id="' + esc(p.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="ficha-producto">' + ui().dibujo(p, 'dibujo-grande') + '<span class="ficha-textos">' +
      '<span class="ficha-titulo">' + esc(p.nombre) + '</span>' +
      '<span class="ficha-sub">' + [rev, esc(p.dimensiones), euros(p.precio)].filter(Boolean).join(' · ') + '</span>' +
      '<span class="fila-chips fila-chips-izq">' + (tipo ? ui().chip(tipo) : '') + ui().chip(plural(ruta.length, 'etapa', 'etapas')) + '</span>' +
      '</span></span></button>';
    if (abierto) {
      html += '<div class="ficha-detalle"><h3 class="subtitulo">Ruta de proceso</h3><ol class="lista-ruta">' + ruta.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
      if (p.notas) html += '<div class="notas">' + esc(p.notas) + '</div>';
      if (can('producto.gestionar')) {
        html += '<div class="pie-acciones"><button type="button" class="btn btn-pequeno" data-action="editar-producto" data-id="' + esc(p.id) + '">' + ui().icono('editar') + 'Editar</button>' +
          '<button type="button" class="btn btn-pequeno btn-peligro" data-action="eliminar-producto" data-id="' + esc(p.id) + '">' + ui().icono('borrar') + 'Eliminar</button></div>';
      }
      html += '</div>';
    }
    return html + '</article>';
  }

  /** Gastado desde la última puesta a cero, en negativo: «−12,5 kg». */
  function textoGastado(cantidad, unidad) {
    return '<span class="stock' + (cantidad ? ' gastado' : '') + '"><span class="stock-num">' + (cantidad ? '−' : '') + formatNumber(cantidad) + '</span> <span class="stock-ud">' + esc(unidad) + '</span></span>';
  }

  function filaMaterial(m) {
    const abierto = st().productoAbierto === m.id;
    const gastado = App.consumos.gastado(m.id);
    const pendientes = App.consumos.pendientesDe(m.id);
    const regs = App.catalogo.movimientosDe(m.id).filter(x => x.tipo === 'regularizacion');
    const ultima = regs[0];
    let html = '<article class="ficha' + (abierto ? ' abierta' : '') + '" id="producto-' + esc(m.id) + '">' +
      '<button type="button" class="ficha-cabecera" data-action="alternar-producto" data-id="' + esc(m.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="ficha-linea"><span class="ficha-titulo">' + esc(m.nombre) + '</span>' + textoGastado(gastado, m.unidad) + '</span>' +
      '<span class="ficha-sub">Gastado ' + (ultima ? 'desde el ' + formatDateShort(ultima.fecha) : 'hasta ahora') +
      (m.precio !== null && m.precio !== undefined && m.precio !== '' ? ' · ' + euros(m.precio) + '/' + esc(m.unidad) : '') + '</span></button>';
    if (abierto) {
      html += '<div class="ficha-detalle">';
      if (can('stock.regularizar') && gastado) {
        html += '<div class="aviso-bloque"><strong>¿Ya has cuadrado este material en el inventario?</strong> Ponerlo a 0 guarda un movimiento con lo gastado; los pedidos conservan su consumo.' +
          '<button type="button" class="btn btn-pequeno" data-action="poner0-material" data-id="' + esc(m.id) + '">Poner a 0</button></div>';
      }
      if (pendientes.length) {
        // Agrupado por OF: cuánto se ha llevado cada pedido.
        const porPedido = new Map();
        pendientes.forEach(c => porPedido.set(c.pedidoId, (porPedido.get(c.pedidoId) || 0) + (Number(c.cantidad) || 0)));
        html += '<h3 class="subtitulo">Gastado desde la última puesta a cero</h3><ul class="lista-simple">' + [...porPedido.entries()].map(([pid, cant]) => {
          const p = App.repo.get('pedidos', pid);
          const linea = p ? App.pedidos.titulo(p).linea : 'Pedido eliminado';
          return '<li>' + (p ? '<button type="button" class="enlace" data-action="ir-pedido" data-id="' + esc(pid) + '">' + esc(linea) + '</button>' : esc(linea)) +
            ' — <strong class="menos">−' + formatNumber(Math.round(cant * 1000) / 1000) + ' ' + esc(m.unidad) + '</strong></li>';
        }).join('') + '</ul>';
      }
      const movs = App.catalogo.movimientosDe(m.id).slice(0, 8);
      if (movs.length) {
        html += '<h3 class="subtitulo">Movimientos</h3><ul class="lista-simple">' + movs.map(mv => {
          const esReg = mv.tipo === 'regularizacion';
          const signo = esReg ? '' : mv.tipo === 'entrada' ? '+' : '−';
          return '<li><span class="num">' + formatDateShort(mv.fecha) + '</span> · ' +
            (esReg ? 'Puesta a 0 de <strong>' + formatNumber(mv.cantidad) + ' ' + esc(m.unidad) + '</strong> gastados'
              : '<strong class="' + (mv.tipo === 'entrada' ? 'mas' : 'menos') + '">' + signo + formatNumber(mv.cantidad) + ' ' + esc(m.unidad) + '</strong>') +
            (mv.usuarioId && esReg ? ' · ' + esc(App.auth.nombreDe(mv.usuarioId)) : '') +
            (mv.nota ? ' — ' + esc(mv.nota) : '') + '</li>';
        }).join('') + '</ul>';
      }
      if (m.notas) html += '<div class="notas">' + esc(m.notas) + '</div>';
      if (can('material.gestionar')) {
        html += '<div class="pie-acciones"><button type="button" class="btn btn-pequeno" data-action="editar-material" data-id="' + esc(m.id) + '">' + ui().icono('editar') + 'Editar</button>' +
          '<button type="button" class="btn btn-pequeno btn-peligro" data-action="eliminar-producto" data-id="' + esc(m.id) + '">' + ui().icono('borrar') + 'Eliminar</button></div>';
      }
      html += '</div>';
    }
    return html + '</article>';
  }

  /** Materiales que coinciden con la búsqueda (nombre o notas, sin tildes). */
  function materialesFiltrados() {
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(st().busquedaMateriales).trim();
    const todos = App.catalogo.materiales();
    return q ? todos.filter(m => norm(m.nombre + ' ' + (m.notas || '')).includes(q)) : todos;
  }

  function listaMateriales() {
    const lista = materialesFiltrados();
    if (lista.length) return lista.map(filaMaterial).join('');
    return App.catalogo.materiales().length
      ? ui().vacio('Ningún material coincide con «' + esc(st().busquedaMateriales.trim()) + '».')
      : ui().vacio('Todavía no hay materiales. Añádelos para poder apuntar lo que se gasta en cada etapa.');
  }

  App.views = App.views || {};

  App.views.catalogo = function renderCatalogo() {
    const vista = st().vistaCatalogo;
    const esMat = vista === 'materiales';
    const puede = can(esMat ? 'material.gestionar' : 'producto.gestionar');
    let html = '<div class="barra-herramientas">' +
      ui().segmentos('vista-catalogo', vista, [['productos', 'Productos'], ['materiales', 'Materiales']]) +
      (puede ? '<button type="button" class="btn btn-primario" data-action="' + (esMat ? 'nuevo-material' : 'nuevo-producto') + '">' + ui().icono('plus') + '<span>' + (esMat ? 'Nuevo material' : 'Nuevo producto') + '</span></button>' : '') +
      '</div>';
    if (!esMat) {
      const lista = App.catalogo.fabricados();
      return html + (lista.length ? lista.map(filaProducto).join('') : ui().vacio('Todavía no hay productos fabricados.'));
    }
    const conGasto = App.consumos.materialesConGasto().length;
    html += '<div class="barra-herramientas">' +
      '<label class="buscador">' + ui().icono('buscar') + '<input type="search" id="buscar-materiales" data-input="buscar-materiales" placeholder="Buscar material" value="' + esc(st().busquedaMateriales) + '" autocomplete="off" enterkeyhint="search" aria-label="Buscar materiales"></label>' +
      (can('stock.regularizar') && conGasto ? '<button type="button" class="btn" data-action="poner0-todo">Poner todo a 0</button>' : '') + '</div>' +
      '<p class="intro">Junto a cada material, lo gastado desde que se cuadró el inventario por última vez.</p>';
    return html + '<div id="lista-materiales">' + listaMateriales() + '</div>';
  };
  App.views.materialesLista = listaMateriales;

  /* ---------------------------- Hoja: producto ----------------------------- */

  function filaRuta(valor) {
    return '<li class="ruta-fila"><span class="ruta-num"></span><input name="ruta" class="ruta-input" value="' + esc(valor) + '" placeholder="Nombre de la etapa" autocomplete="off" aria-label="Etapa">' +
      '<span class="ruta-botones"><button type="button" class="btn-icono" data-action="ruta-subir" aria-label="Subir">↑</button>' +
      '<button type="button" class="btn-icono" data-action="ruta-bajar" aria-label="Bajar">↓</button>' +
      '<button type="button" class="btn-icono btn-icono-peligro" data-action="ruta-quitar" aria-label="Quitar etapa">' + ui().icono('cerrar') + '</button></span></li>';
  }
  App.views.filaRuta = filaRuta;

  App.sheets = App.sheets || {};

  App.sheets.producto = function ({ id }) {
    const p = id ? App.repo.get('productos', id) : null;
    const ruta = p ? App.catalogo.rutaDe(p) : App.config.DEFAULT_ROUTE;
    const c = '<form class="formulario" data-form="producto" data-id="' + esc(id || '') + '" novalidate>' +
      ui().campo('Nombre', '<input id="pr-nombre" name="nombre" value="' + esc(p ? p.nombre : '') + '" autocomplete="off" autofocus>') +
      '<div class="fila-campos">' +
      ui().campo('Uso', '<select id="pr-tipo" name="tipo">' + ui().opciones(TIPOS, p ? p.tipo : '', '—') + '</select>') +
      ui().campo('Revestimiento', '<select id="pr-material" name="material">' + ui().opciones(REVESTIMIENTOS, p ? p.material : '', '—') + '</select>') + '</div>' +
      '<div class="fila-campos">' +
      ui().campo('Dimensiones', '<input id="pr-dim" name="dimensiones" value="' + esc(p ? p.dimensiones : '') + '" placeholder="180×60×75 cm" autocomplete="off">') +
      ui().campo('Precio de venta (€)', '<input id="pr-precio" name="precio" inputmode="decimal" value="' + esc(p && p.precio !== null && p.precio !== undefined ? p.precio : '') + '" autocomplete="off">') + '</div>' +
      '<fieldset class="editor-lista"><legend>Ruta de proceso <span class="ayuda-inline">— el orden importa</span></legend>' +
      '<ol class="ruta" id="editor-ruta">' + ruta.map(filaRuta).join('') + '</ol>' +
      '<div class="fila-botones"><button type="button" class="btn btn-pequeno" data-action="ruta-anadir">' + ui().icono('plus') + 'Añadir etapa</button>' +
      '<button type="button" class="btn btn-pequeno" data-action="ruta-plantilla">Usar plantilla habitual</button></div></fieldset>' +
      ui().campo('Notas', '<textarea id="pr-notas" name="notas" rows="2">' + esc(p ? p.notas : '') + '</textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">Guardar</button></div></form>';
    return { titulo: p ? 'Editar producto' : 'Nuevo producto fabricado', cuerpo: c };
  };

  App.sheets.material = function ({ id }) {
    const m = id ? App.repo.get('productos', id) : null;
    const val = k => (m && m[k] !== null && m[k] !== undefined ? esc(m[k]) : '');
    const c = '<form class="formulario" data-form="material" data-id="' + esc(id || '') + '" novalidate>' +
      ui().campo('Nombre', '<input id="ma-nombre" name="nombre" value="' + val('nombre') + '" autocomplete="off" autofocus>') +
      ui().campo('Unidad', '<select id="ma-unidad" name="unidad">' + ui().opciones(UNIDADES, m ? m.unidad : 'kg') + '</select>') +
      ui().campo('Coste por unidad (€)', '<input id="ma-precio" name="precio" inputmode="decimal" value="' + val('precio') + '" autocomplete="off">') +
      ui().campo('Notas', '<textarea id="ma-notas" name="notas" rows="2">' + val('notas') + '</textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">Guardar</button></div></form>';
    return { titulo: m ? 'Editar material' : 'Nuevo material', cuerpo: c };
  };
})(window.App = window.App || {});
App.sheets.producto.estatica = true;
App.sheets.material.estatica = true;
