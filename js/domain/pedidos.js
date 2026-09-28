/* ==========================================================================
   domain/pedidos.js — Pedidos, etapas de la ruta, asignación y materiales
   --------------------------------------------------------------------------
   Un pedido copia la ruta de su producto al crearse (`etapas`), así que
   cambiar la ruta de un producto no altera pedidos ya en marcha.

   Cada etapa: { nombre, completada, fecha, asignadoA }
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum, todayISO, formatNumber } = App.util;
  const repo = () => App.repo;
  const auth = () => App.auth;
  const cat = () => App.catalogo;

  /* ------------------------------- Lecturas ------------------------------- */

  function estado(p) {
    let ultima = -1;
    p.etapas.forEach((e, i) => { if (e.completada) ultima = i; });
    const terminado = p.etapas.length > 0 && ultima === p.etapas.length - 1;
    const actualIdx = terminado ? p.etapas.length - 1 : ultima + 1;
    return {
      ultimaCompletada: ultima,
      terminado,
      actualIdx,
      actualNombre: p.etapas[actualIdx] ? p.etapas[actualIdx].nombre : '—',
      fechaUltimoAvance: ultima >= 0 ? p.etapas[ultima].fecha : p.fechaPedido,
      fechaFin: terminado ? p.etapas[p.etapas.length - 1].fecha : null
    };
  }

  function todos() {
    return repo().all('pedidos').slice().sort((a, b) => String(b.fechaPedido).localeCompare(String(a.fechaPedido)));
  }
  function activos() { return todos().filter(p => !estado(p).terminado); }
  function terminados() { return todos().filter(p => estado(p).terminado); }

  /** Código de la orden de fabricación: OF-0007. */
  function codigo(p) {
    return p && p.numero ? 'OF-' + String(p.numero).padStart(4, '0') : 'OF';
  }

  /**
   * Textos para mostrar un pedido según quién mira.
   * Editores: cliente + producto. Operarios (sin permiso 'cliente.ver'):
   * código de la orden + producto, nunca el cliente.
   */
  function titulo(p) {
    const prod = repo().get('productos', p.productoId);
    const producto = prod ? prod.nombre : 'Producto eliminado';
    let cliente = null;
    if (auth().can('cliente.ver')) {
      const cli = repo().get('clientes', p.clienteId);
      cliente = cli ? cli.nombre : 'Cliente eliminado';
    }
    const cod = codigo(p);
    return {
      cliente, producto, codigo: cod,
      principal: cliente || producto,
      linea: cliente ? cliente + ' · ' + producto : cod + ' · ' + producto
    };
  }

  function siguienteNumero() {
    return repo().all('pedidos').reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0) + 1;
  }

  function retrasado(p) {
    return !!p.fechaEntrega && !estado(p).terminado && p.fechaEntrega < todayISO();
  }

  /** Etapas no completadas asignadas a un usuario, en pedidos activos. */
  function tareasDe(usuarioId) {
    const out = [];
    activos().forEach(p => p.etapas.forEach((e, i) => {
      if (!e.completada && e.asignadoA === usuarioId) out.push({ pedido: p, etapaIdx: i, etapa: e, esActual: i === estado(p).actualIdx });
    }));
    return out.sort((a, b) => (b.esActual - a.esActual));
  }

  /* ------------------------------ Materiales ------------------------------ */

  function consumoPara(productoId, cantidad) {
    const prod = repo().get('productos', productoId);
    return ((prod && prod.receta) || [])
      .filter(r => { const m = repo().get('productos', r.materialId); return m && m.categoria === 'material'; })
      .map(r => ({ materialId: r.materialId, cantidad: (Number(r.cantidad) || 0) * cantidad }));
  }

  /**
   * Materiales que quedarían en negativo (disponible) al reservar.
   * Devuelve textos listos para enseñar. Lista vacía = todo bien.
   */
  function faltantesAlReservar(productoId, cantidad, excluirPedidoId) {
    return consumoPara(productoId, cantidad).map(c => {
      const mat = repo().get('productos', c.materialId);
      let disp = cat().materialDisponible(mat);
      if (excluirPedidoId) {
        const previo = repo().get('pedidos', excluirPedidoId);
        (previo && !previo.materialesDespachados ? previo.consumo : []).forEach(x => { if (x.materialId === mat.id) disp += x.cantidad; });
      }
      const queda = disp - c.cantidad;
      return queda < 0 ? mat.nombre + ' (quedaría en ' + formatNumber(queda) + ' ' + (mat.unidad || '') + ')' : null;
    }).filter(Boolean);
  }

  /** Materiales cuyo stock real quedaría en negativo al despachar. */
  function faltantesAlDespachar(pedidoId) {
    const p = repo().get('pedidos', pedidoId);
    if (!p) return [];
    return (p.consumo || []).map(c => {
      const mat = repo().get('productos', c.materialId);
      if (!mat) return null;
      const queda = (parseFloat(mat.stock) || 0) - c.cantidad;
      return queda < 0 ? mat.nombre + ' (quedaría en ' + formatNumber(queda) + ' ' + (mat.unidad || '') + ')' : null;
    }).filter(Boolean);
  }

  /* ------------------------------ Escrituras ------------------------------ */

  function validarCantidad(txt) {
    const n = parseNum(txt);
    if (!(n >= 1) || Math.floor(n) !== n) throw new DomainError('La cantidad tiene que ser un número entero mayor que 0.');
    return n;
  }

  function crear(datos) {
    auth().exigir('pedido.crear');
    if (!repo().get('clientes', datos.clienteId)) throw new DomainError('Elige un cliente.');
    const prod = repo().get('productos', datos.productoId);
    if (!prod || prod.categoria === 'material') throw new DomainError('Elige un producto fabricado.');
    const cantidad = validarCantidad(datos.cantidad);
    const fecha = datos.fechaPedido || todayISO();
    const etapas = cat().rutaDe(prod).map((nombre, i) => ({
      nombre, completada: i === 0, fecha: i === 0 ? fecha : null, asignadoA: null
    }));
    return repo().insert('pedidos', {
      numero: siguienteNumero(), clienteId: datos.clienteId, productoId: prod.id, cantidad, fechaPedido: fecha,
      fechaEntrega: datos.fechaEntrega || null, notas: (datos.notas || '').trim(), etapas,
      consumo: consumoPara(prod.id, cantidad), materialesDespachados: false, fechaDespacho: null
    }, { alPrincipio: true });
  }

  function editar(id, datos) {
    auth().exigir('pedido.editar');
    const p = repo().get('pedidos', id);
    if (!p) throw new DomainError('El pedido ya no existe.');
    if (!repo().get('clientes', datos.clienteId)) throw new DomainError('Elige un cliente.');
    const cantidad = validarCantidad(datos.cantidad);
    const cambios = {
      clienteId: datos.clienteId, cantidad, fechaPedido: datos.fechaPedido || p.fechaPedido,
      fechaEntrega: datos.fechaEntrega || null, notas: (datos.notas || '').trim()
    };
    if (cantidad !== p.cantidad) {
      if (p.materialesDespachados) throw new DomainError('Los materiales ya se despacharon: no se puede cambiar la cantidad. Ajusta el stock a mano si hace falta.');
      cambios.consumo = consumoPara(p.productoId, cantidad);
    }
    return repo().update('pedidos', id, cambios);
  }

  /**
   * Marca la siguiente etapa como hecha o deshace la última.
   * Solo se puede tocar la frontera: la siguiente pendiente o la última completada.
   */
  function alternarEtapa(id, idx) {
    auth().exigir('pedido.avanzar');
    const p = repo().get('pedidos', id);
    if (!p) throw new DomainError('El pedido ya no existe.');
    const { ultimaCompletada } = estado(p);
    const etapas = p.etapas.map(e => Object.assign({}, e));
    if (idx === ultimaCompletada + 1) { etapas[idx].completada = true; etapas[idx].fecha = todayISO(); }
    else if (idx === ultimaCompletada && idx > 0) { etapas[idx].completada = false; etapas[idx].fecha = null; }
    else throw new DomainError('Las etapas se completan en orden. Solo puedes marcar la siguiente o deshacer la última.');
    return repo().update('pedidos', id, { etapas });
  }

  function asignarEtapa(id, idx, usuarioId) {
    auth().exigir('pedido.asignar');
    const p = repo().get('pedidos', id);
    if (!p || !p.etapas[idx]) throw new DomainError('Etapa no encontrada.');
    if (usuarioId && !auth().porId(usuarioId)) throw new DomainError('Usuario desconocido.');
    const etapas = p.etapas.map(e => Object.assign({}, e));
    etapas[idx].asignadoA = usuarioId || null;
    return repo().update('pedidos', id, { etapas });
  }

  function despachar(id) {
    auth().exigir('pedido.despachar');
    const p = repo().get('pedidos', id);
    if (!p) throw new DomainError('El pedido ya no existe.');
    if (p.materialesDespachados) throw new DomainError('Los materiales de este pedido ya están despachados.');
    if (!p.consumo || !p.consumo.length) throw new DomainError('Este pedido no tiene materiales que despachar.');
    p.consumo.forEach(c => {
      const mat = repo().get('productos', c.materialId);
      if (mat) cat().registrarMovimiento(mat, 'salida', c.cantidad, 'Despacho de materiales — inicio de fabricación', { auto: true, pedidoId: p.id });
    });
    return repo().update('pedidos', id, { materialesDespachados: true, fechaDespacho: todayISO() });
  }

  /** Elimina el pedido, devuelve al stock lo despachado y borra sus tiempos e incidencias. */
  function eliminar(id) {
    auth().exigir('pedido.eliminar');
    const p = repo().get('pedidos', id);
    if (!p) return;
    if (p.materialesDespachados) {
      (p.consumo || []).forEach(c => {
        const mat = repo().get('productos', c.materialId);
        if (mat) cat().registrarMovimiento(mat, 'entrada', c.cantidad, 'Devolución por eliminación de pedido despachado', { auto: true, pedidoId: id });
      });
    }
    repo().where('tiempos', t => t.pedidoId === id).forEach(t => repo().remove('tiempos', t.id));
    repo().where('incidencias', x => x.pedidoId === id).forEach(x => repo().remove('incidencias', x.id));
    repo().remove('pedidos', id);
  }

  App.pedidos = {
    estado, todos, activos, terminados, titulo, codigo, retrasado, tareasDe,
    consumoPara, faltantesAlReservar, faltantesAlDespachar,
    crear, editar, alternarEtapa, asignarEtapa, despachar, eliminar
  };
})(window.App = window.App || {});
