/* ==========================================================================
   domain/consumos.js — Material consumido en cada etapa y puesta a cero
   --------------------------------------------------------------------------
   El stock y el inventario se llevan en otra aplicación. Esta app solo
   apunta lo que se gasta:

   Consumo: { id, pedidoId, etapaIdx, etapaNombre, materialId, cantidad,
              fecha, usuarioId, nota, regularizacionId }
     regularizacionId === null → gasto pendiente: suma en el «gastado» del
                                 material (se enseña en negativo).
     regularizacionId = id     → ya contado en una puesta a cero.

   Puesta a cero (regularización): cuando se cuadra el inventario real en la
   otra app, el gastado de un material (o de todos) vuelve a 0. Queda un
   movimiento { tipo: 'regularizacion', cantidad } y los consumos se marcan
   con su id: siguen enlazados a su pedido, así que el gasto de cada OF
   cerrada se puede consultar siempre.

   En cada etapa se indica si se ha consumido material (etapa.consumoMaterial:
   'si' | 'no' | null).
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum, todayISO, uid } = App.util;
  const repo = () => App.repo;
  const auth = () => App.auth;

  /* ------------------------------- Lecturas ------------------------------- */

  const porFecha = (a, b) => String(b.fecha).localeCompare(String(a.fecha));

  function dePedido(pedidoId) { return repo().where('consumos', c => c.pedidoId === pedidoId).sort(porFecha); }
  function deEtapa(pedidoId, idx) { return dePedido(pedidoId).filter(c => c.etapaIdx === idx); }

  /** Consumos de un material aún sin poner a cero. */
  function pendientesDe(materialId) {
    return repo().where('consumos', c => c.materialId === materialId && !c.regularizacionId).sort(porFecha);
  }

  /** Total gastado de un material desde la última puesta a cero (número positivo). */
  function gastado(materialId) {
    return redondear(pendientesDe(materialId).reduce((s, c) => s + (Number(c.cantidad) || 0), 0));
  }

  /** Materiales con algo gastado pendiente de poner a cero. */
  function materialesConGasto() {
    return App.catalogo.materiales().filter(m => gastado(m.id) > 0);
  }

  /**
   * Total por material de un pedido: [{ material, cantidad, coste }].
   * coste = cantidad × coste por unidad del material (null si no hay precio o no se puede ver).
   */
  function resumenPedido(pedidoId) {
    const totales = new Map();
    dePedido(pedidoId).forEach(c => totales.set(c.materialId, (totales.get(c.materialId) || 0) + (Number(c.cantidad) || 0)));
    const verPrecio = auth().can('precio.ver');
    return [...totales.entries()].map(([materialId, cantidad]) => {
      const material = repo().get('productos', materialId);
      const precio = material && verPrecio && material.precio !== null && material.precio !== undefined && material.precio !== '' ? Number(material.precio) : null;
      return { materialId, material, cantidad: redondear(cantidad), coste: precio === null ? null : redondear(precio * cantidad) };
    }).sort((a, b) => String(a.material ? a.material.nombre : '').localeCompare(String(b.material ? b.material.nombre : ''), 'es'));
  }

  /** Evita colas de decimales al sumar (0,1 + 0,2). */
  function redondear(n) { return Math.round(n * 1000) / 1000; }

  /* ------------------------------ Escrituras ------------------------------ */

  function validarEtapa(pedidoId, etapaIdx) {
    const p = repo().get('pedidos', pedidoId);
    if (!p) throw new DomainError('El pedido ya no existe.');
    const e = p.etapas[etapaIdx];
    if (!e) throw new DomainError('Etapa no encontrada.');
    auth().exigir('consumo.registrar', p);
    return { pedido: p, etapa: e };
  }

  /** Indica si en la etapa se ha consumido material: 'si' | 'no' | null (sin indicar). */
  function marcarEtapa(pedidoId, etapaIdx, valor) {
    const { pedido } = validarEtapa(pedidoId, etapaIdx);
    if (valor !== 'si' && valor !== 'no' && valor !== null) throw new DomainError('Valor no válido.');
    if (valor === 'no' && deEtapa(pedidoId, etapaIdx).length) {
      throw new DomainError('Esta etapa tiene material apuntado. Quita esas líneas antes de marcar «No».');
    }
    const etapas = pedido.etapas.map(e => Object.assign({}, e));
    etapas[etapaIdx].consumoMaterial = valor;
    return repo().update('pedidos', pedidoId, { etapas });
  }

  /** Apunta una línea de material consumido. datos: { pedidoId, etapaIdx, materialId, cantidad, nota } */
  function registrar(datos) {
    const etapaIdx = Number(datos.etapaIdx);
    const { pedido, etapa } = validarEtapa(datos.pedidoId, etapaIdx);
    const mat = repo().get('productos', datos.materialId);
    if (!mat || mat.categoria !== 'material') throw new DomainError('Elige un material.');
    const cantidad = parseNum(datos.cantidad);
    if (!(cantidad > 0)) throw new DomainError('Introduce una cantidad mayor que 0.');
    const nuevo = repo().insert('consumos', {
      pedidoId: pedido.id, etapaIdx, etapaNombre: etapa.nombre, materialId: mat.id, cantidad,
      fecha: todayISO(), usuarioId: auth().current().id, nota: (datos.nota || '').trim(), regularizacionId: null
    });
    if (etapa.consumoMaterial !== 'si') marcarEtapa(pedido.id, etapaIdx, 'si');
    return nuevo;
  }

  function eliminar(id) {
    const c = repo().get('consumos', id);
    if (!c) return;
    auth().exigir('consumo.borrar', c);
    if (c.regularizacionId) throw new DomainError('Este consumo ya se contó al poner el material a cero: no se puede borrar.');
    repo().remove('consumos', id);
  }

  /**
   * Pone a 0 el gastado de uno o varios materiales (todos si no se indican).
   * Deja un movimiento por material y marca sus consumos. Se guarda de una
   * vez en la base de datos (función regularizar_materiales).
   * Devuelve la lista de movimientos creados.
   */
  function poner0(materialIds, nota) {
    auth().exigir('stock.regularizar');
    const ids = materialIds && materialIds.length ? materialIds : App.catalogo.materiales().map(m => m.id);
    const regs = ids.map(materialId => {
      const consumos = pendientesDe(materialId);
      if (!consumos.length) return null;
      return {
        movimientoId: uid(), materialId,
        cantidad: redondear(consumos.reduce((s, c) => s + (Number(c.cantidad) || 0), 0)),
        consumoIds: consumos.map(c => c.id)
      };
    }).filter(Boolean);
    if (!regs.length) throw new DomainError('No hay material gastado que poner a cero.');
    const texto = (nota || '').trim() || 'Inventario cuadrado en la otra app';
    const fecha = todayISO(), usuarioId = auth().current().id;

    return repo().operacion('regularizar_materiales', { p_regs: regs, p_nota: texto }, () => regs.map(r => {
      const mov = repo().insert('movimientos', {
        id: r.movimientoId, materialId: r.materialId, fecha, tipo: 'regularizacion', cantidad: r.cantidad,
        nota: texto, auto: false, pedidoId: null, usuarioId
      });
      r.consumoIds.forEach(cid => repo().update('consumos', cid, { regularizacionId: r.movimientoId }));
      return mov;
    }));
  }

  App.consumos = {
    dePedido, deEtapa, pendientesDe, gastado, materialesConGasto, resumenPedido,
    marcarEtapa, registrar, eliminar, poner0
  };
})(window.App = window.App || {});
