/* ==========================================================================
   ui/views/clientes.js — Clientes
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, plural } = App.util;
  const ui = () => App.ui;
  const st = () => App.ui.state;
  const can = a => App.auth.can(a);

  function lista() {
    const q = st().busquedaClientes.trim().toLowerCase();
    const todos = App.catalogo.clientes();
    const cs = q ? todos.filter(c => [c.nombre, c.contacto, c.telefono, c.email, c.direccion].join(' ').toLowerCase().includes(q)) : todos;
    if (!cs.length) return ui().vacio(todos.length ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes.');
    return cs.map(c => {
      const ped = App.repo.where('pedidos', p => p.clienteId === c.id);
      const activos = ped.filter(p => !App.pedidos.estado(p).terminado).length;
      return '<article class="ficha"><div class="ficha-cabecera ficha-estatica">' +
        '<span class="ficha-linea"><span class="ficha-titulo">' + esc(c.nombre) + '</span>' +
        (ped.length ? ui().chip(plural(ped.length, 'pedido', 'pedidos') + (activos ? ' · ' + activos + ' en curso' : '')) : '') + '</span>' +
        (c.contacto ? '<span class="ficha-sub">' + esc(c.contacto) + '</span>' : '') +
        '<span class="contacto">' +
        (c.telefono ? '<a class="enlace" href="tel:' + esc(c.telefono.replace(/\s+/g, '')) + '">' + ui().icono('telefono', 'ico-chip') + esc(c.telefono) + '</a>' : '') +
        (c.email ? '<a class="enlace" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') + '</span>' +
        (c.direccion ? '<span class="ficha-sub">' + esc(c.direccion) + '</span>' : '') +
        (c.notas ? '<span class="ficha-sub ficha-nota">' + esc(c.notas) + '</span>' : '') +
        (can('cliente.gestionar') ? '<span class="pie-acciones"><button type="button" class="btn btn-pequeno" data-action="editar-cliente" data-id="' + esc(c.id) + '">' + ui().icono('editar') + 'Editar</button>' +
          '<button type="button" class="btn btn-pequeno btn-peligro" data-action="eliminar-cliente" data-id="' + esc(c.id) + '">' + ui().icono('borrar') + 'Eliminar</button></span>' : '') +
        '</div></article>';
    }).join('');
  }

  App.views = App.views || {};
  App.views.clientesLista = lista;

  App.views.clientes = function renderClientes() {
    return '<div class="barra-herramientas">' +
      '<label class="buscador">' + ui().icono('buscar') + '<input type="search" id="buscar-clientes" data-input="buscar-clientes" placeholder="Buscar cliente" value="' + esc(st().busquedaClientes) + '" autocomplete="off" enterkeyhint="search" aria-label="Buscar clientes"></label>' +
      (can('cliente.gestionar') ? '<button type="button" class="btn btn-primario" data-action="nuevo-cliente">' + ui().icono('plus') + '<span>Nuevo cliente</span></button>' : '') +
      '</div><div id="lista-clientes">' + lista() + '</div>';
  };

  App.sheets = App.sheets || {};
  App.sheets.cliente = function ({ id }) {
    const c = id ? App.repo.get('clientes', id) : null;
    const v = k => (c ? esc(c[k] || '') : '');
    const cuerpo = '<form class="formulario" data-form="cliente" data-id="' + esc(id || '') + '" novalidate>' +
      ui().campo('Nombre o razón social', '<input id="cl-nombre" name="nombre" value="' + v('nombre') + '" autocomplete="off" autofocus>') +
      ui().campo('Persona de contacto', '<input id="cl-contacto" name="contacto" value="' + v('contacto') + '" autocomplete="off">') +
      '<div class="fila-campos">' +
      ui().campo('Teléfono', '<input id="cl-telefono" name="telefono" type="tel" inputmode="tel" value="' + v('telefono') + '" autocomplete="off">') +
      ui().campo('Email', '<input id="cl-email" name="email" type="email" inputmode="email" autocapitalize="off" value="' + v('email') + '" autocomplete="off">') + '</div>' +
      ui().campo('Dirección', '<input id="cl-direccion" name="direccion" value="' + v('direccion') + '" autocomplete="off">') +
      ui().campo('Notas', '<textarea id="cl-notas" name="notas" rows="2">' + v('notas') + '</textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">Guardar</button></div></form>';
    return { titulo: c ? 'Editar cliente' : 'Nuevo cliente', cuerpo };
  };
})(window.App = window.App || {});
App.sheets.cliente.estatica = true;
