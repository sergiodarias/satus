/* ==========================================================================
   domain/pedidos.js — Pedidos, etapas de la ruta, asignación y materiales
   --------------------------------------------------------------------------
   Un pedido copia la ruta de su producto al crearse (`etapas`), así que
   cambiar la ruta de un producto no altera pedidos ya en marcha.

   Cada etapa: { nombre, completada, fecha, consumoMaterial: 'si'|'no'|null }
   La OF se asigna entera a uno o varios trabajadores (`asignados`, lista de
   ids). El operario solo ve y trabaja las OF que tiene asignadas.
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum, todayISO } = App.util;
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

  /** Pedidos que el usuario actual puede ver: todos (editor) o sus OF asignadas (operario). */
  function todos() {
    const verTodos = auth().can('pedido.verTodos');
    return repo().where('pedidos', p => verTodos || auth().asignado(p)).sort((a, b) => String(b.fechaPedido).localeCompare(String(a.fechaPedido)));
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

  /** Nombres de los trabajadores asignados a la OF. */
  function asignadosNombres(p) {
    return (p.asignados || []).map(id => auth().nombreDe(id));
  }

  /* ------------------------------ Escrituras ------------------------------ */

  function validarCantidad(txt) {
    const n = parseNum(txt);
    if (!(n >= 1) || Math.floor(n) !== n) throw new DomainError('La cantidad tiene que ser un número entero mayor que 0.');
    return n;
  }

  /** Limpia una lista de ids de usuario: sin repetidos y solo usuarios que existen. */
  function limpiarAsignados(ids) {
    const lista = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    const fuera = lista.filter(id => id && !auth().porId(id));
    if (fuera.length) throw new DomainError('Usuario desconocido.');
    return [...new Set(lista.filter(Boolean))];
  }

  function crear(datos) {
    auth().exigir('pedido.crear');
    if (!repo().get('clientes', datos.clienteId)) throw new DomainError('Elige un cliente.');
    const prod = repo().get('productos', datos.productoId);
    if (!prod || prod.categoria === 'material') throw new DomainError('Elige un producto fabricado.');
    const cantidad = validarCantidad(datos.cantidad);
    const fecha = datos.fechaPedido || todayISO();
    const etapas = cat().rutaDe(prod).map((nombre, i) => ({
      nombre, completada: i === 0, fecha: i === 0 ? fecha : null, asignadoA: null, consumoMaterial: null
    }));
    return repo().insert('pedidos', {
      numero: siguienteNumero(), clienteId: datos.clienteId, productoId: prod.id, cantidad, fechaPedido: fecha,
      fechaEntrega: datos.fechaEntrega || null, notas: (datos.notas || '').trim(), etapas,
      asignados: limpiarAsignados(datos.asignados)
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
    if (datos.asignados !== undefined) cambios.asignados = limpiarAsignados(datos.asignados);
    return repo().update('pedidos', id, cambios);
  }

  /**
   * Marca la siguiente etapa como hecha o deshace la última.
   * Solo se puede tocar la frontera: la siguiente pendiente o la última completada.
   */
  function alternarEtapa(id, idx) {
    const p = repo().get('pedidos', id);
    if (!p) throw new DomainError('El pedido ya no existe.');
    auth().exigir('pedido.avanzar', p);
    const { ultimaCompletada } = estado(p);
    const etapas = p.etapas.map(e => Object.assign({}, e));
    if (idx === ultimaCompletada + 1) { etapas[idx].completada = true; etapas[idx].fecha = todayISO(); }
    else if (idx === ultimaCompletada && idx > 0) { etapas[idx].completada = false; etapas[idx].fecha = null; }
    else throw new DomainError('Las etapas se completan en orden. Solo puedes marcar la siguiente o deshacer la última.');
    return repo().update('pedidos', id, { etapas });
  }

  /** Asigna o quita un trabajador de la OF. */
  function alternarAsignado(id, usuarioId, asignar) {
    auth().exigir('pedido.asignar');
    const p = repo().get('pedidos', id);
    if (!p) throw new DomainError('El pedido ya no existe.');
    if (!auth().porId(usuarioId)) throw new DomainError('Usuario desconocido.');
    const actuales = (p.asignados || []).filter(x => x !== usuarioId);
    return repo().update('pedidos', id, { asignados: asignar ? actuales.concat(usuarioId) : actuales });
  }

  /** Elimina el pedido y borra sus tiempos, consumos de material e incidencias. */
  function eliminar(id) {
    auth().exigir('pedido.eliminar');
    const p = repo().get('pedidos', id);
    if (!p) return;
    repo().where('consumos', c => c.pedidoId === id).forEach(c => repo().remove('consumos', c.id));
    repo().where('tiempos', t => t.pedidoId === id).forEach(t => repo().remove('tiempos', t.id));
    repo().where('incidencias', x => x.pedidoId === id).forEach(x => repo().remove('incidencias', x.id));
    repo().remove('pedidos', id);
  }

  App.pedidos = {
    estado, todos, activos, terminados, titulo, codigo, retrasado, asignadosNombres,
    crear, editar, alternarEtapa, alternarAsignado, eliminar
  };
})(window.App = window.App || {});
