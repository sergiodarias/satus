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
      if (!can('pedido.verTodos') && !App.pedidos.todos().length) {
        return ui().vacio('No tienes órdenes de fabricación asignadas. Cuando un editor te asigne una, aparecerá aquí.');
      }
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
    const prod = App.repo.get('productos', p.productoId);
    const ficha = ui().fichaProducto(prod);

    let html = '<article class="pedido' + (abierto ? ' abierto' : '') + '" id="pedido-' + esc(p.id) + '">' +
      '<button type="button" class="pedido-cabecera" data-action="alternar-pedido" data-id="' + esc(p.id) + '" aria-expanded="' + abierto + '">' +
      '<span class="pedido-arriba">' + ui().dibujo(prod) + '<span class="pedido-textos">' +
      '<span class="pedido-linea"><span class="pedido-cliente">' + esc(t.principal) + '</span>' +
      '<span class="pedido-fecha">' + (p.fechaEntrega ? 'Entrega ' + formatDateShort(p.fechaEntrega) : formatDate(p.fechaPedido)) + '</span></span>' +
      '<span class="pedido-producto"><span class="num">' + esc(t.codigo) + '</span>' + (t.cliente ? ' · ' + esc(t.producto) : '') + ' · ×' + p.cantidad + '</span>' +
      (ficha ? '<span class="pedido-ficha">' + ficha + '</span>' : '') + '</span></span>' +
      ui().progreso(p) +
      '<span class="pedido-pie"><span class="pedido-etapa' + (est.terminado ? ' terminado' : '') + '">' + (est.terminado ? '✓ ' : '') + esc(est.actualNombre) + '</span>' +
      '<span class="fila-chips">' +
      (retraso ? ui().chip('Fuera de plazo', 'alerta') : '') +
      (can('pedido.asignar') && !(p.asignados || []).length && !est.terminado ? ui().chip('Sin asignar', 'aviso') : '') +
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
    if (can('tiempo.registrar', p) && !est.terminado) {
      const aqui = enMarcha && enMarcha.pedidoId === p.id && enMarcha.etapaIdx === est.actualIdx;
      html += aqui
        ? '<button type="button" class="btn btn-parar btn-grande" data-action="parar-tiempo">' + ui().icono('stop') + 'Parar temporizador</button>'
        : '<button type="button" class="btn btn-primario btn-grande" data-action="iniciar-tiempo" data-id="' + esc(p.id) + '" data-idx="' + est.actualIdx + '">' + ui().icono('play') + 'Iniciar: ' + esc(est.actualNombre) + '</button>';
    }
    if (can('incidencia.crear')) {
      html += '<button type="button" class="btn" data-action="nueva-incidencia" data-pedido="' + esc(p.id) + '" data-idx="' + (est.terminado ? '' : est.actualIdx) + '">' + ui().icono('incidencias') + 'Incidencia o nota</button>';
    }
    html += '</div>';

    // Trabajadores asignados a la OF
    html += asignacion(p);

    // Material consumido (total por material)
    html += resumenMaterial(p);

    // Etapas
    html += '<ol class="etapas">' + p.etapas.map((e, i) => {
      const clase = e.completada ? 'hecha' : (i === est.actualIdx && !est.terminado ? 'actual' : 'futura');
      const puedeMarcar = can('pedido.avanzar', p) && (i === est.ultimaCompletada + 1 || (i === est.ultimaCompletada && i > 0));
      const corriendo = enMarcha && enMarcha.pedidoId === p.id && enMarcha.etapaIdx === i;
      const lineas = App.consumos.deEtapa(p.id, i).length;
      const meta = [
        e.fecha ? formatDateShort(e.fecha) : '',
        porEtapa[i] ? formatDuracion(porEtapa[i]) : '',
        lineas ? plural(lineas, 'material', 'materiales') : (e.consumoMaterial === 'no' ? 'sin material' : '')
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

  /** Quién trabaja la OF. El editor la asigna marcando trabajadores; el operario solo lo ve. */
  function asignacion(p) {
    const asignados = p.asignados || [];
    if (!can('pedido.asignar')) {
      return asignados.length ? '<p class="ayuda">Asignada a ' + esc(App.pedidos.asignadosNombres(p).join(', ')) + '.</p>' : '';
    }
    const operarios = App.auth.usuarios().filter(u => u.rol === 'operario');
    const otros = asignados.filter(id => !operarios.some(u => u.id === id));
    return '<div class="bloque-asignar"><h3 class="subtitulo">Asignada a</h3>' +
      (operarios.length ? '<div class="casillas">' + operarios.map(u =>
        '<label class="casilla"><input type="checkbox" data-change="asignar-of" data-id="' + esc(p.id) + '" value="' + esc(u.id) + '"' + (asignados.includes(u.id) ? ' checked' : '') + '><span>' + esc(u.nombre) + '</span></label>').join('') + '</div>'
        : '<p class="ayuda">No hay operarios dados de alta.</p>') +
      (otros.length ? '<p class="ayuda">También: ' + esc(otros.map(id => App.auth.nombreDe(id)).join(', ')) + '.</p>' : '') +
      (!asignados.length ? '<p class="ayuda">Ningún operario la ve hasta que la asignes.</p>' : '') + '</div>';
  }

  /** Total de material consumido en la OF, por material. */
  function resumenMaterial(p) {
    const resumen = App.consumos.resumenPedido(p.id);
    if (!resumen.length) return '';
    const total = resumen.reduce((s, r) => s + (r.coste || 0), 0);
    const hayCoste = resumen.some(r => r.coste !== null);
    return '<div class="bloque-material"><h3 class="subtitulo">Material consumido</h3><ul class="lista-simple">' + resumen.map(r =>
      '<li><strong class="num">' + formatNumber(r.cantidad) + ' ' + esc(r.material ? r.material.unidad : '') + '</strong> ' +
      esc(r.material ? r.material.nombre : 'Material eliminado') +
      (r.coste !== null ? ' <span class="ayuda-inline">· ' + formatNumber(r.coste) + ' €</span>' : '') + '</li>').join('') + '</ul>' +
      (hayCoste ? '<p class="ayuda">Coste de material ≈ ' + formatNumber(Math.round(total * 100) / 100) + ' € (con el coste por unidad del catálogo).</p>' : '') + '</div>';
  }

  App.views = App.views || {};

  App.views.pedidos = function renderPedidos() {
    return '<div class="barra-herramientas">' +
      '<label class="buscador">' + ui().icono('buscar') + '<input type="search" id="buscar-pedidos" data-input="buscar-pedidos" placeholder="' + (can('cliente.ver') ? 'Buscar cliente, producto u OF' : 'Buscar producto u OF') + '" value="' + esc(st().busquedaPedidos) + '" autocomplete="off" enterkeyhint="search" aria-label="Buscar pedidos"></label>' +
      (can('pedido.crear') ? '<button type="button" class="btn btn-primario" data-action="nuevo-pedido">' + ui().icono('plus') + '<span>Nuevo pedido</span></button>' : '') +
      '</div>' +
      (!can('pedido.verTodos') ? '<p class="intro">Órdenes de fabricación que tienes asignadas.</p>' : '') +
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

    c += seccionMaterial(p, e, idx);

    if (can('tiempo.registrar', p)) {
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

  /** Material consumido en la etapa: ¿sí o no? y, si sí, las líneas (material + cantidad). */
  function seccionMaterial(p, e, idx) {
    const lineas = App.consumos.deEtapa(p.id, idx);
    const puede = can('consumo.registrar', p);
    const valor = e.consumoMaterial || (lineas.length ? 'si' : null);
    let c = '<section class="tarjeta-suave seccion-material"><h3 class="subtitulo">¿Se ha consumido material?</h3>';
    if (puede) {
      c += '<div class="opciones-radio">' + [['si', 'Sí'], ['no', 'No']].map(([v, t]) =>
        '<label class="radio"><input type="radio" name="consumo-etapa" value="' + v + '" data-change="consumo-etapa" data-id="' + esc(p.id) + '" data-idx="' + idx + '"' + (valor === v ? ' checked' : '') + '><span>' + t + '</span></label>').join('') + '</div>';
    } else {
      c += '<p class="ayuda">' + (valor === 'si' ? 'Sí.' : valor === 'no' ? 'No.' : 'Sin indicar.') + '</p>';
    }
    if (lineas.length) {
      c += '<ul class="registros">' + lineas.map(x => {
        const m = App.repo.get('productos', x.materialId);
        return '<li class="registro"><span class="registro-principal"><span class="registro-quien">' + esc(m ? m.nombre : 'Material eliminado') + '</span>' +
          '<span class="registro-cuando">' + esc(App.auth.nombreDe(x.usuarioId)) + ' · ' + formatDateShort(x.fecha) + (x.regularizacionId ? ' · contado en inventario' : '') + '</span>' +
          (x.nota ? '<span class="registro-nota">' + esc(x.nota) + '</span>' : '') + '</span>' +
          '<span class="registro-duracion">' + formatNumber(x.cantidad) + ' ' + esc(m ? m.unidad : '') + '</span>' +
          (can('consumo.borrar', x) && !x.regularizacionId ? '<button type="button" class="btn-icono btn-icono-peligro" data-action="borrar-consumo" data-id="' + esc(x.id) + '" aria-label="Borrar línea de material">' + ui().icono('borrar') + '</button>' : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    if (puede && valor === 'si') {
      const mats = App.catalogo.materiales();
      c += mats.length
        ? '<form class="formulario form-consumo" data-form="consumo" data-pedido="' + esc(p.id) + '" data-idx="' + idx + '" novalidate>' +
          '<div class="fila-campos fila-consumo">' +
          ui().campo('Material', '<select id="co-material" name="materialId">' + ui().opciones(mats.map(m => [m.id, m.nombre + ' (' + m.unidad + ')']), '', 'Elige material') + '</select>') +
          ui().campo('Cantidad', '<input id="co-cantidad" name="cantidad" inputmode="decimal" autocomplete="off" placeholder="0" enterkeyhint="done">') + '</div>' +
          '<button type="submit" class="btn btn-primario">' + ui().icono('plus') + 'Añadir material</button></form>'
        : '<p class="ayuda">Todavía no hay materiales en el catálogo.</p>';
    }
    return c + '</section>';
  }

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
      (p ? '' : '<fieldset class="editor-lista"><legend>Asignar a <span class="ayuda-inline">— solo verán la OF los marcados</span></legend><div class="casillas">' +
        App.auth.usuarios().filter(u => u.rol === 'operario').map(u =>
          '<label class="casilla"><input type="checkbox" name="asignados" value="' + esc(u.id) + '"><span>' + esc(u.nombre) + '</span></label>').join('') + '</div></fieldset>') +
      '<div class="formulario-acciones"><button type="button" class="btn" data-action="cerrar-hoja">Cancelar</button><button type="submit" class="btn btn-primario">' + (p ? 'Guardar cambios' : 'Crear pedido') + '</button></div></form>';
    return { titulo: p ? 'Editar pedido' : 'Nuevo pedido', cuerpo: c };
  };
})(window.App = window.App || {});
App.sheets.pedido.estatica = true;
