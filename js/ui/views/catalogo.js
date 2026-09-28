/* ==========================================================================
   ui/views/catalogo.js — Productos fabricados y materiales (con stock)
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
    const receta = p.receta || [];
    const tipo = (TIPOS.find(t => t[0] === p.tipo) || [])[1];
    const rev = (REVESTIMIENTOS.find(t => t[0] === p.material) || [])[1];
    let html = '<article class="ficha' + (abierto ? ' abierta' : '') + '" id="producto-' + esc(p.id) + '">' +
      '<button type="button" class="ficha-cabecera" data-action="alternar-producto" data-id="' + esc(p.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="ficha-titulo">' + esc(p.nombre) + '</span>' +
      '<span class="fila-chips">' + (tipo ? ui().chip(tipo) : '') + (rev ? ui().chip(rev) : '') + ui().chip(plural(ruta.length, 'etapa', 'etapas')) + '</span>' +
      '<span class="ficha-sub">' + [esc(p.dimensiones), euros(p.precio)].filter(Boolean).join(' · ') + '</span></button>';
    if (abierto) {
      html += '<div class="ficha-detalle"><h3 class="subtitulo">Ruta de proceso</h3><ol class="lista-ruta">' + ruta.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>';
      if (receta.length) {
        html += '<h3 class="subtitulo">Materiales por unidad</h3><ul class="lista-simple">' + receta.map(r => {
          const m = App.repo.get('productos', r.materialId);
          return '<li>' + formatNumber(r.cantidad) + ' ' + esc(m ? m.unidad : '') + ' de ' + esc(m ? m.nombre : 'material eliminado') + '</li>';
        }).join('') + '</ul>';
      }
      if (p.notas) html += '<div class="notas">' + esc(p.notas) + '</div>';
      if (can('producto.gestionar')) {
        html += '<div class="pie-acciones"><button type="button" class="btn btn-pequeno" data-action="editar-producto" data-id="' + esc(p.id) + '">' + ui().icono('editar') + 'Editar</button>' +
          '<button type="button" class="btn btn-pequeno btn-peligro" data-action="eliminar-producto" data-id="' + esc(p.id) + '">' + ui().icono('borrar') + 'Eliminar</button></div>';
      }
      html += '</div>';
    }
    return html + '</article>';
  }

  function filaMaterial(m) {
    const abierto = st().productoAbierto === m.id;
    const reservado = App.catalogo.materialReservado(m.id);
    const disp = App.catalogo.materialDisponible(m);
    const bajo = App.catalogo.tieneStockBajo(m);
    let html = '<article class="ficha' + (abierto ? ' abierta' : '') + '" id="producto-' + esc(m.id) + '">' +
      '<button type="button" class="ficha-cabecera" data-action="alternar-producto" data-id="' + esc(m.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="ficha-linea"><span class="ficha-titulo">' + esc(m.nombre) + '</span>' +
      '<span class="stock' + (bajo ? ' stock-bajo' : '') + '"><span class="stock-num">' + formatNumber(disp) + '</span> <span class="stock-ud">' + esc(m.unidad) + '</span></span></span>' +
      '<span class="ficha-sub">Disponible · real ' + formatNumber(m.stock) + (reservado ? ' · reservado ' + formatNumber(reservado) : '') +
      (m.stockMinimo !== null && m.stockMinimo !== undefined ? ' · mínimo ' + formatNumber(m.stockMinimo) : '') + '</span></button>';
    if (abierto) {
      html += '<div class="ficha-detalle">';
      if (can('stock.ajustar')) {
        html += '<form class="formulario tarjeta-suave" data-form="ajuste-stock" data-id="' + esc(m.id) + '" novalidate><h3 class="subtitulo">Ajustar stock</h3>' +
          '<div class="opciones-radio"><label class="radio"><input type="radio" name="tipo" value="entrada" checked><span>Entrada</span></label>' +
          '<label class="radio"><input type="radio" name="tipo" value="salida"><span>Salida / merma</span></label></div>' +
          '<div class="fila-campos">' + ui().campo('Cantidad (' + esc(m.unidad) + ')', '<input id="aj-cantidad-' + esc(m.id) + '" name="cantidad" inputmode="decimal" autocomplete="off">') +
          ui().campo('Nota', '<input id="aj-nota-' + esc(m.id) + '" name="nota" autocomplete="off" placeholder="Compra, rotura…">') + '</div>' +
          '<button type="submit" class="btn btn-primario btn-pequeno">Guardar movimiento</button></form>';
      }
      const reservas = App.catalogo.reservasDeMaterial(m.id);
      if (reservas.length) {
        html += '<h3 class="subtitulo">Reservado por pedidos sin despachar</h3><ul class="lista-simple">' + reservas.map(r => {
          const t = App.pedidos.titulo(r.pedido);
          return '<li><button type="button" class="enlace" data-action="ir-pedido" data-id="' + esc(r.pedido.id) + '">' + esc(t.linea) + '</button> — ' + formatNumber(r.cantidad) + ' ' + esc(m.unidad) + '</li>';
        }).join('') + '</ul>';
      }
      const movs = App.catalogo.movimientosDe(m.id).slice(0, 8);
      if (movs.length) {
        html += '<h3 class="subtitulo">Últimos movimientos</h3><ul class="lista-simple">' + movs.map(mv =>
          '<li><span class="num">' + formatDateShort(mv.fecha) + '</span> · <strong class="' + (mv.tipo === 'entrada' ? 'mas' : 'menos') + '">' + (mv.tipo === 'entrada' ? '+' : '−') + formatNumber(mv.cantidad) + ' ' + esc(m.unidad) + '</strong>' + (mv.nota ? ' — ' + esc(mv.nota) : '') + '</li>').join('') + '</ul>';
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

  App.views = App.views || {};

  App.views.catalogo = function renderCatalogo() {
    const vista = st().vistaCatalogo;
    const esMat = vista === 'materiales';
    const lista = esMat ? App.catalogo.materiales() : App.catalogo.fabricados();
    const puede = can(esMat ? 'material.gestionar' : 'producto.gestionar');
    return '<div class="barra-herramientas">' +
      ui().segmentos('vista-catalogo', vista, [['productos', 'Productos'], ['materiales', 'Materiales']]) +
      (puede ? '<button type="button" class="btn btn-primario" data-action="' + (esMat ? 'nuevo-material' : 'nuevo-producto') + '">' + ui().icono('plus') + '<span>' + (esMat ? 'Nuevo material' : 'Nuevo producto') + '</span></button>' : '') +
      '</div>' +
      (lista.length ? lista.map(esMat ? filaMaterial : filaProducto).join('')
        : ui().vacio(esMat ? 'Todavía no hay materiales. Añádelos para vincularlos a la receta de cada producto.' : 'Todavía no hay productos fabricados.'));
  };

  /* ---------------------------- Hoja: producto ----------------------------- */

  function filaRuta(valor) {
    return '<li class="ruta-fila"><span class="ruta-num"></span><input name="ruta" class="ruta-input" value="' + esc(valor) + '" placeholder="Nombre de la etapa" autocomplete="off" aria-label="Etapa">' +
      '<span class="ruta-botones"><button type="button" class="btn-icono" data-action="ruta-subir" aria-label="Subir">↑</button>' +
      '<button type="button" class="btn-icono" data-action="ruta-bajar" aria-label="Bajar">↓</button>' +
      '<button type="button" class="btn-icono btn-icono-peligro" data-action="ruta-quitar" aria-label="Quitar etapa">' + ui().icono('cerrar') + '</button></span></li>';
  }
  function filaReceta(r, mats) {
    return '<li class="receta-fila"><select name="recetaMaterial" aria-label="Material">' + ui().opciones(mats.map(m => [m.id, m.nombre + ' (' + m.unidad + ')']), r.materialId) + '</select>' +
      '<input name="recetaCantidad" inputmode="decimal" value="' + esc(r.cantidad) + '" placeholder="Cant." autocomplete="off" aria-label="Cantidad por unidad">' +
      '<button type="button" class="btn-icono btn-icono-peligro" data-action="receta-quitar" aria-label="Quitar material">' + ui().icono('cerrar') + '</button></li>';
  }
  App.views.filaRuta = filaRuta;
  App.views.filaReceta = r => filaReceta(r, App.catalogo.materiales());

  App.sheets = App.sheets || {};

  App.sheets.producto = function ({ id }) {
    const p = id ? App.repo.get('productos', id) : null;
    const mats = App.catalogo.materiales();
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
      '<fieldset class="editor-lista"><legend>Materiales por unidad fabricada</legend>' +
      (mats.length
        ? '<ul class="receta" id="editor-receta">' + ((p && p.receta) || []).map(r => filaReceta(r, mats)).join('') + '</ul>' +
          '<button type="button" class="btn btn-pequeno" data-action="receta-anadir">' + ui().icono('plus') + 'Añadir material</button>'
        : '<p class="ayuda">Aún no hay materiales. Créalos en Catálogo → Materiales para poder reservarlos con cada pedido.</p>') +
      '</fieldset>' +
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
      '<div class="fila-campos">' +
      ui().campo(m ? 'Stock real' : 'Stock inicial', '<input id="ma-stock" name="stock" inputmode="decimal" value="' + val('stock') + '" autocomplete="off">',
        m ? { ayuda: 'Para entradas y salidas usa «Ajustar stock»: queda registrado.' } : null) +
      ui().campo('Avisar si baja de', '<input id="ma-minimo" name="stockMinimo" inputmode="decimal" value="' + val('stockMinimo') + '" placeholder="Opcional" autocomplete="off">') + '</div>' +
      ui().campo('Coste por unidad (€)', '<input id="ma-precio" name="precio" inputmode="decimal" value="' + val('precio') + '" autocomplete="off">') +
      ui().campo('Notas', '<textarea id="ma-notas" name="notas" rows="2">' + val('notas') + '</textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">Guardar</button></div></form>';
    return { titulo: m ? 'Editar material' : 'Nuevo material', cuerpo: c };
  };
})(window.App = window.App || {});
App.sheets.producto.estatica = true;
App.sheets.material.estatica = true;
