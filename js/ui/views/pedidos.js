/* ==========================================================================
   ui/views/pedidos.js — Lista de pedidos, detalle, hoja de etapa y formulario
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, formatDate, formatDateShort, formatDuracion, formatNumber, formatTime, todayISO, plural } = App.util;
  const ui = () => App.ui;
  const st = () => App.ui.state;
  const can = (a, r) => App.auth.can(a, r);

  /* --------------------------------- Lista --------------------------------- */

  function filtrados() {
    const q = st().busquedaPedidos.trim().toLowerCase();
    let lista = st().filtroPedidos === 'activos' ? App.pedidos.activos()
      : st().filtroPedidos === 'terminados' ? App.pedidos.terminados() : App.pedidos.todos();
    if (q) lista = lista.filter(p => { const t = App.pedidos.titulo(p); return (t.linea + ' ' + t.codigo + ' ' + (p.notas || '')).toLowerCase().includes(q); });
    return lista;
  }

  function lista() {
    const ps = filtrados();
    if (!ps.length) {
      if (!App.repo.all('pedidos').length) {
        return ui().vacio('Todavía no hay pedidos.', can('pedido.crear') ? '<button type="button" class="btn btn-primario" data-action="nuevo-pedido">' + ui().icono('plus') + 'Crear el primero</button>' : '');
      }
      return ui().vacio('Ningún pedido coincide con la búsqueda o el filtro.');
    }
    return ps.map(tarjeta).join('');
  }

  function tarjeta(p) {
    const t = App.pedidos.titulo(p);
    const est = App.pedidos.estado(p);
    const abierto = st().pedidoAbierto === p.id;
    const minutos = App.tiempos.sumar(App.tiempos.dePedido(p.id));
    const inc = App.incidencias.dePedido(p.id).filter(x => x.tipo === 'incidencia' && !x.resuelta).length;
    const retraso = App.pedidos.retrasado(p);

    let html = '<article class="pedido' + (abierto ? ' abierto' : '') + '" id="pedido-' + esc(p.id) + '">' +
      '<button type="button" class="pedido-cabecera" data-action="alternar-pedido" data-id="' + esc(p.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="pedido-linea"><span class="pedido-cliente">' + esc(t.principal) + '</span>' +
      '<span class="pedido-fecha">' + (p.fechaEntrega ? 'Entrega ' + formatDateShort(p.fechaEntrega) : formatDate(p.fechaPedido)) + '</span></span>' +
      '<span class="pedido-producto"><span class="num">' + esc(t.codigo) + '</span>' + (t.cliente ? ' · ' + esc(t.producto) : '') + ' · ×' + p.cantidad + '</span>' +
      ui().progreso(p) +
      '<span class="pedido-pie"><span class="pedido-etapa' + (est.terminado ? ' terminado' : '') + '">' + (est.terminado ? '✓ ' : '') + esc(est.actualNombre) + '</span>' +
      '<span class="fila-chips">' +
      (retraso ? ui().chip('Fuera de plazo', 'alerta') : '') +
      (inc ? ui().chip(plural(inc, 'incidencia', 'incidencias'), 'alerta') : '') +
      (minutos ? ui().chip(ui().icono('reloj', 'ico-chip') + formatDuracion(minutos)) : '') +
      '</span></span></button>';

    if (abierto) html += detalle(p, est);
    return html + '</article>';
  }

  function detalle(p, est) {
    const u = App.auth.current();
    const enMarcha = App.tiempos.enMarcha(u.id);
    const porEtapa = App.tiempos.porEtapa(p.id);
    let html = '<div class="pedido-detalle">';

    // Acciones rápidas: temporizador en la etapa actual + incidencia.
    html += '<div class="acciones-rapidas">';
    if (can('tiempo.registrar') && !est.terminado) {
      const aqui = enMarcha && enMarcha.pedidoId === p.id && enMarcha.etapaIdx === est.actualIdx;
      html += aqui
        ? '<button type="button" class="btn btn-parar btn-grande" data-action="parar-tiempo">' + ui().icono('stop') + 'Parar temporizador</button>'
        : '<button type="button" class="btn btn-primario btn-grande" data-action="iniciar-tiempo" data-id="' + esc(p.id) + '" data-idx="' + est.actualIdx + '">' + ui().icono('play') + 'Iniciar: ' + esc(est.actualNombre) + '</button>';
    }
    if (can('incidencia.crear')) {
      html += '<button type="button" class="btn" data-action="nueva-incidencia" data-pedido="' + esc(p.id) + '" data-idx="' + (est.terminado ? '' : est.actualIdx) + '">' + ui().icono('incidencias') + 'Incidencia o nota</button>';
    }
    html += '</div>';

    // Materiales
    if (p.consumo && p.consumo.length) {
      const lineas = p.consumo.map(c => {
        const m = App.repo.get('productos', c.materialId);
        return m ? formatNumber(c.cantidad) + ' ' + esc(m.unidad) + ' ' + esc(m.nombre) : null;
      }).filter(Boolean).join(' · ');
      html += p.materialesDespachados
        ? '<div class="aviso-bloque aviso-ok"><strong>Materiales despachados el ' + formatDate(p.fechaDespacho) + '.</strong> Ya descontados del stock. <span class="aviso-detalle">' + lineas + '</span></div>'
        : '<div class="aviso-bloque"><strong>Materiales reservados, sin despachar.</strong> Aún no descuentan del stock real. <span class="aviso-detalle">' + lineas + '</span>' +
          (can('pedido.despachar') ? '<button type="button" class="btn btn-pequeno" data-action="despachar" data-id="' + esc(p.id) + '">' + ui().icono('caja') + 'Despachar materiales</button>' : '') + '</div>';
    }

    // Etapas
    html += '<ol class="etapas">' + p.etapas.map((e, i) => {
      const clase = e.completada ? 'hecha' : (i === est.actualIdx && !est.terminado ? 'actual' : 'futura');
      const puedeMarcar = can('pedido.avanzar') && (i === est.ultimaCompletada + 1 || (i === est.ultimaCompletada && i > 0));
      const asignado = e.asignadoA ? App.auth.porId(e.asignadoA) : null;
      const corriendo = enMarcha && enMarcha.pedidoId === p.id && enMarcha.etapaIdx === i;
      const meta = [
        e.fecha ? formatDateShort(e.fecha) : '',
        asignado ? esc(asignado.nombre) : '',
        porEtapa[i] ? formatDuracion(porEtapa[i]) : ''
      ].filter(Boolean).join(' · ');
      const marca = puedeMarcar
        ? '<button type="button" class="etapa-marca" data-action="alternar-etapa" data-id="' + esc(p.id) + '" data-idx="' + i + '" aria-label="' + (e.completada ? 'Deshacer' : 'Completar') + ' ' + esc(e.nombre) + '">' + (e.completada ? ui().icono('check') : '') + '</button>'
        : '<span class="etapa-marca" aria-hidden="true">' + (e.completada ? ui().icono('check') : '') + '</span>';
      return '<li class="etapa ' + clase + (corriendo ? ' corriendo' : '') + '">' + marca +
        '<button type="button" class="etapa-cuerpo" data-action="abrir-etapa" data-id="' + esc(p.id) + '" data-idx="' + i + '"><span class="etapa-textos">' +
        '<span class="etapa-nombre">' + esc(e.nombre) + (corriendo ? ' <span class="punto-vivo" aria-label="en marcha"></span>' : '') + '</span>' +
        (meta ? '<span class="etapa-meta">' + meta + '</span>' : '') + '</span>' +
        ui().icono('derecha', 'ico-flecha') + '</button></li>';
    }).join('') + '</ol>';

    if (p.notas) html += '<div class="notas">' + esc(p.notas) + '</div>';

    const incs = App.incidencias.dePedido(p.id).filter(x => !x.resuelta);
    if (incs.length) {
      html += '<h3 class="subtitulo">Incidencias y notas abiertas</h3>' + incs.map(x => App.views.incidenciaFila(x, { compacta: true })).join('');
    }

    if (can('pedido.editar') || can('pedido.eliminar')) {
      html += '<div class="pie-acciones">' +
        (can('pedido.editar') ? '<button type="button" class="btn btn-pequeno" data-action="editar-pedido" data-id="' + esc(p.id) + '">' + ui().icono('editar') + 'Editar</button>' : '') +
        (can('pedido.eliminar') ? '<button type="button" class="btn btn-pequeno btn-peligro" data-action="eliminar-pedido" data-id="' + esc(p.id) + '">' + ui().icono('borrar') + 'Eliminar</button>' : '') +
        '</div>';
    }
    return html + '</div>';
  }

  App.views = App.views || {};

  App.views.pedidos = function renderPedidos() {
    return '<div class="barra-herramientas">' +
      '<label class="buscador">' + ui().icono('buscar') + '<input type="search" id="buscar-pedidos" data-input="buscar-pedidos" placeholder="' + (can('cliente.ver') ? 'Buscar cliente, producto u OF' : 'Buscar producto u OF') + '" value="' + esc(st().busquedaPedidos) + '" autocomplete="off" enterkeyhint="search" aria-label="Buscar pedidos"></label>' +
      (can('pedido.crear') ? '<button type="button" class="btn btn-primario" data-action="nuevo-pedido">' + ui().icono('plus') + '<span>Nuevo pedido</span></button>' : '') +
      '</div>' +
      ui().segmentos('filtro-pedidos', st().filtroPedidos, [['activos', 'En curso'], ['terminados', 'Terminados'], ['todos', 'Todos']]) +
      '<div id="lista-pedidos">' + lista() + '</div>';
  };
  App.views.pedidosLista = lista;

  /* ------------------------------ Hoja: etapa ------------------------------ */

  App.sheets = App.sheets || {};

  App.sheets.etapa = function ({ pedidoId, idx }) {
    const p = App.repo.get('pedidos', pedidoId);
    if (!p || !p.etapas[idx]) return null;
    const e = p.etapas[idx];
    const t = App.pedidos.titulo(p);
    const u = App.auth.current();
    const enMarcha = App.tiempos.enMarcha(u.id);
    const aqui = enMarcha && enMarcha.pedidoId === p.id && enMarcha.etapaIdx === idx;
    const registros = App.tiempos.deEtapa(p.id, idx);
    const total = App.tiempos.sumar(registros);

    let c = '<div class="estado-etapa">' +
      (e.completada ? ui().chip('Completada el ' + formatDate(e.fecha), 'ok') : ui().chip('Pendiente')) +
      ui().chip(ui().icono('reloj', 'ico-chip') + formatDuracion(total) + ' en total') + '</div>';

    if (can('pedido.asignar')) {
      c += ui().campo('Asignada a', '<select id="asignar-etapa" data-change="asignar-etapa" data-id="' + esc(p.id) + '" data-idx="' + idx + '">' +
        ui().opciones(App.auth.usuarios().map(x => [x.id, x.nombre + ' (' + App.auth.rolEtiqueta(x) + ')']), e.asignadoA || '', 'Sin asignar') + '</select>');
    } else if (e.asignadoA) {
      c += '<p class="ayuda">Asignada a ' + esc(App.auth.nombreDe(e.asignadoA)) + '.</p>';
    }

    if (can('tiempo.registrar')) {
      c += '<div class="cronometro">' + (aqui
        ? '<div class="cronometro-lectura" data-desde="' + esc(enMarcha.inicio) + '">00:00:00</div><button type="button" class="btn btn-parar btn-grande" data-action="parar-tiempo">' + ui().icono('stop') + 'Parar y guardar</button>'
        : '<button type="button" class="btn btn-primario btn-grande" data-action="iniciar-tiempo" data-id="' + esc(p.id) + '" data-idx="' + idx + '">' + ui().icono('play') + 'Iniciar temporizador</button>' +
          (enMarcha ? '<p class="ayuda">Tienes otro temporizador en marcha. Al iniciar este, el otro se para y se guarda.</p>' : '')) + '</div>';

      c += '<form class="formulario tarjeta-suave" data-form="tiempo-manual" data-pedido="' + esc(p.id) + '" data-idx="' + idx + '" novalidate>' +
        '<h3 class="subtitulo">Imputar tiempo a mano</h3><div class="fila-campos fila-campos-3">' +
        ui().campo('Horas', '<input id="tm-horas" name="horas" inputmode="decimal" autocomplete="off" placeholder="0" enterkeyhint="next">') +
        ui().campo('Minutos', '<input id="tm-minutos" name="minutos" inputmode="numeric" autocomplete="off" placeholder="0" enterkeyhint="next">') +
        ui().campo('Fecha', '<input id="tm-fecha" name="fecha" type="date" value="' + todayISO() + '" max="' + todayISO() + '">') + '</div>' +
        (can('tiempo.registrarOtros') ? ui().campo('Quién lo hizo', '<select id="tm-usuario" name="usuarioId">' + ui().opciones(App.auth.usuarios().map(x => [x.id, x.nombre]), u.id) + '</select>') : '') +
        ui().campo('Nota (opcional)', '<input id="tm-nota" name="nota" autocomplete="off" placeholder="Qué se ha hecho" enterkeyhint="done">') +
        '<button type="submit" class="btn btn-primario">' + ui().icono('plus') + 'Añadir tiempo</button></form>';
    }

    c += '<h3 class="subtitulo">Registros de tiempo</h3>' + (registros.length ? '<ul class="registros">' + registros.map(r => {
      const corriendo = r.modo === 'timer' && !r.fin;
      return '<li class="registro"><span class="registro-principal"><span class="registro-quien">' + esc(App.auth.nombreDe(r.usuarioId)) + '</span>' +
        '<span class="registro-cuando">' + formatDateShort(r.fecha) + (r.inicio ? ' · ' + formatTime(r.inicio) + (r.fin ? '–' + formatTime(r.fin) : '') : '') + ' · ' + (r.modo === 'timer' ? 'temporizador' : 'manual') + '</span>' +
        (r.nota ? '<span class="registro-nota">' + esc(r.nota) + '</span>' : '') + '</span>' +
        (corriendo ? '<span class="registro-duracion en-marcha" data-desde="' + esc(r.inicio) + '">…</span>' : '<span class="registro-duracion">' + formatDuracion(r.minutos) + '</span>') +
        (can('tiempo.borrar', r) && !corriendo ? '<button type="button" class="btn-icono btn-icono-peligro" data-action="borrar-tiempo" data-id="' + esc(r.id) + '" aria-label="Borrar registro">' + ui().icono('borrar') + '</button>' : '') +
        '</li>';
    }).join('') + '</ul>' : '<p class="ayuda">Aún no hay tiempo imputado en esta etapa.</p>');

    const incs = App.incidencias.deEtapa(p.id, idx);
    c += '<div class="seccion-cabecera"><h3 class="subtitulo">Incidencias y notas</h3>' +
      (can('incidencia.crear') ? '<button type="button" class="btn btn-pequeno" data-action="nueva-incidencia" data-pedido="' + esc(p.id) + '" data-idx="' + idx + '">' + ui().icono('plus') + 'Añadir</button>' : '') + '</div>' +
      (incs.length ? incs.map(x => App.views.incidenciaFila(x, { compacta: true })).join('') : '<p class="ayuda">Nada anotado en esta etapa.</p>');

    return { titulo: esc(e.nombre), subtitulo: 'Etapa ' + (idx + 1) + ' de ' + p.etapas.length + ' · ' + esc(t.linea), cuerpo: c };
  };

  /* --------------------------- Hoja: nuevo/editar -------------------------- */

  App.sheets.pedido = function ({ id }) {
    const p = id ? App.repo.get('pedidos', id) : null;
    const clientes = App.catalogo.clientes();
    const fabricados = App.catalogo.fabricados();
    if (!p && (!clientes.length || !fabricados.length)) {
      return {
        titulo: 'Nuevo pedido', cuerpo: ui().vacio('Para crear un pedido hace falta al menos un cliente y un producto fabricado.',
          '<div class="fila-botones">' + (!clientes.length ? '<button type="button" class="btn" data-action="nuevo-cliente">Añadir cliente</button>' : '') +
          (!fabricados.length ? '<button type="button" class="btn" data-action="nuevo-producto">Añadir producto</button>' : '') + '</div>')
      };
    }
    const prodSel = p ? p.productoId : (fabricados[0] && fabricados[0].id);
    const ruta = App.catalogo.rutaDe(App.repo.get('productos', prodSel));
    const c = '<form class="formulario" data-form="pedido" data-id="' + esc(id || '') + '" novalidate>' +
      ui().campo('Cliente', '<select id="pf-cliente" name="clienteId" required>' + ui().opciones(clientes.map(x => [x.id, x.nombre]), p ? p.clienteId : '') + '</select>') +
      (p
        ? ui().campo('Producto', '<input id="pf-producto-fijo" value="' + esc(App.pedidos.titulo(p).producto) + '" disabled>', { ayuda: 'El producto no se puede cambiar: define la ruta del pedido.' })
        : ui().campo('Producto', '<select id="pf-producto" name="productoId" data-change="vista-ruta">' + ui().opciones(fabricados.map(x => [x.id, x.nombre]), prodSel) + '</select>',
          { ayuda: '<span id="pf-ruta">Ruta de ' + ruta.length + ' etapas: ' + esc(ruta.join(' → ')) + '</span>' })) +
      '<div class="fila-campos">' +
      ui().campo('Cantidad', '<input id="pf-cantidad" name="cantidad" inputmode="numeric" value="' + (p ? p.cantidad : 1) + '" autocomplete="off">') +
      ui().campo('Fecha del pedido', '<input id="pf-fecha" name="fechaPedido" type="date" value="' + esc(p ? p.fechaPedido : todayISO()) + '">') + '</div>' +
      ui().campo('Entrega prevista (opcional)', '<input id="pf-entrega" name="fechaEntrega" type="date" value="' + esc(p && p.fechaEntrega ? p.fechaEntrega : '') + '">') +
      ui().campo('Notas', '<textarea id="pf-notas" name="notas" rows="3" placeholder="Color, acabado, detalles del encargo">' + esc(p ? p.notas : '') + '</textarea>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">' + (p ? 'Guardar cambios' : 'Crear pedido') + '</button></div></form>';
    return { titulo: p ? 'Editar pedido' : 'Nuevo pedido', cuerpo: c };
  };
})(window.App = window.App || {});
App.sheets.pedido.estatica = true;
