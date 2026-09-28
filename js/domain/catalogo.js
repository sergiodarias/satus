/* ==========================================================================
   domain/catalogo.js — Clientes, productos fabricados, materiales y stock
   --------------------------------------------------------------------------
   Reglas de negocio puras: validan, comprueban permisos y escriben a través
   de App.repo. No saben nada del DOM.

   Productos y materiales comparten colección (`productos`) y se distinguen
   por `categoria`: 'fabricado' | 'material'.

   Stock:
   - stock real       → material.stock (cambia con ajustes y despachos).
   - reservado        → suma del consumo de pedidos aún no despachados.
   - disponible       → stock real − reservado.
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum, todayISO } = App.util;
  const repo = () => App.repo;
  const auth = () => App.auth;

  /* ------------------------------- Lecturas ------------------------------- */

  function clientes() {
    return repo().all('clientes').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function fabricados() {
    return repo().where('productos', p => p.categoria !== 'material').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function materiales() {
    return repo().where('productos', p => p.categoria === 'material').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  function rutaDe(producto) {
    return (producto && Array.isArray(producto.ruta) && producto.ruta.length) ? producto.ruta : App.config.DEFAULT_ROUTE;
  }

  function reservasDeMaterial(materialId) {
    const out = [];
    repo().all('pedidos').forEach(p => {
      if (p.materialesDespachados) return;
      (p.consumo || []).forEach(c => { if (c.materialId === materialId) out.push({ pedido: p, cantidad: c.cantidad }); });
    });
    return out;
  }
  function materialReservado(materialId) {
    return reservasDeMaterial(materialId).reduce((s, r) => s + (Number(r.cantidad) || 0), 0);
  }
  function materialDisponible(material) {
    return (parseFloat(material.stock) || 0) - materialReservado(material.id);
  }
  function tieneStockBajo(material) {
    const disp = materialDisponible(material);
    const min = material.stockMinimo;
    return disp < 0 || (min !== null && min !== undefined && min !== '' && disp < parseFloat(min));
  }
  function materialesBajos() { return materiales().filter(tieneStockBajo); }

  function movimientosDe(materialId) {
    return repo().where('movimientos', m => m.materialId === materialId)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  /* ------------------------------- Clientes ------------------------------- */

  function guardarCliente(datos, id) {
    auth().exigir('cliente.gestionar');
    const limpio = {
      nombre: (datos.nombre || '').trim(), contacto: (datos.contacto || '').trim(),
      telefono: (datos.telefono || '').trim(), email: (datos.email || '').trim(),
      direccion: (datos.direccion || '').trim(), notas: (datos.notas || '').trim()
    };
    if (!limpio.nombre) throw new DomainError('El nombre del cliente es obligatorio.');
    return id ? repo().update('clientes', id, limpio) : repo().insert('clientes', limpio);
  }

  function eliminarCliente(id) {
    auth().exigir('cliente.gestionar');
    if (repo().where('pedidos', p => p.clienteId === id).length) {
      throw new DomainError('Este cliente tiene pedidos. Elimina o reasigna esos pedidos primero.');
    }
    repo().remove('clientes', id);
  }

  /* ------------------------------ Productos ------------------------------- */

  function guardarProducto(datos, id) {
    auth().exigir('producto.gestionar');
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw new DomainError('El nombre del producto es obligatorio.');
    const ruta = (datos.ruta || []).map(s => String(s).trim()).filter(Boolean);
    if (!ruta.length) throw new DomainError('Añade al menos una etapa a la ruta de proceso.');
    const receta = (datos.receta || [])
      .map(r => ({ materialId: r.materialId, cantidad: parseNum(r.cantidad) }))
      .filter(r => r.materialId && r.cantidad > 0);
    const precio = parseNum(datos.precio);
    const limpio = {
      categoria: 'fabricado', nombre, tipo: datos.tipo || '', material: datos.material || '',
      dimensiones: (datos.dimensiones || '').trim(), precio: isNaN(precio) ? null : precio,
      notas: (datos.notas || '').trim(), ruta, receta
    };
    return id ? repo().update('productos', id, limpio) : repo().insert('productos', limpio);
  }

  function guardarMaterial(datos, id) {
    auth().exigir('material.gestionar');
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw new DomainError('El nombre del material es obligatorio.');
    const stock = parseNum(datos.stock), minimo = parseNum(datos.stockMinimo), precio = parseNum(datos.precio);
    if (datos.stock !== '' && datos.stock !== undefined && isNaN(stock)) throw new DomainError('El stock tiene que ser un número.');
    const limpio = {
      categoria: 'material', nombre, unidad: datos.unidad || 'ud',
      stock: isNaN(stock) ? 0 : stock, stockMinimo: isNaN(minimo) ? null : minimo,
      precio: isNaN(precio) ? null : precio, notas: (datos.notas || '').trim()
    };
    return id ? repo().update('productos', id, limpio) : repo().insert('productos', limpio);
  }

  function eliminarProducto(id) {
    const prod = repo().get('productos', id);
    if (!prod) return;
    if (prod.categoria === 'material') {
      auth().exigir('material.gestionar');
      const enUso = fabricados().some(p => (p.receta || []).some(r => r.materialId === id));
      if (enUso) throw new DomainError('Este material está en la receta de algún producto. Quítalo de esas recetas antes de eliminarlo.');
      repo().where('movimientos', m => m.materialId === id).forEach(m => repo().remove('movimientos', m.id));
    } else {
      auth().exigir('producto.gestionar');
      if (repo().where('pedidos', p => p.productoId === id).length) {
        throw new DomainError('Este producto tiene pedidos. Elimina o reasigna esos pedidos primero.');
      }
    }
    repo().remove('productos', id);
  }

  /* -------------------------------- Stock --------------------------------- */

  /** Movimiento de stock (entrada/salida). Uso interno y desde el formulario de ajuste. */
  function registrarMovimiento(material, tipo, cantidad, nota, extra) {
    const delta = tipo === 'entrada' ? cantidad : -cantidad;
    repo().update('productos', material.id, { stock: (parseFloat(material.stock) || 0) + delta });
    return repo().insert('movimientos', Object.assign({
      materialId: material.id, fecha: todayISO(), tipo, cantidad, nota: nota || '', auto: false,
      pedidoId: null, usuarioId: auth().current() ? auth().current().id : null
    }, extra || {}));
  }

  function ajustarStock(materialId, tipo, cantidadTxt, nota) {
    auth().exigir('stock.ajustar');
    const mat = repo().get('productos', materialId);
    if (!mat || mat.categoria !== 'material') throw new DomainError('Material no encontrado.');
    const cantidad = parseNum(cantidadTxt);
    if (!(cantidad > 0)) throw new DomainError('Introduce una cantidad mayor que 0.');
    if (tipo !== 'entrada' && tipo !== 'salida') throw new DomainError('Tipo de movimiento no válido.');
    return registrarMovimiento(mat, tipo, cantidad, (nota || '').trim());
  }

  App.catalogo = {
    clientes, fabricados, materiales, rutaDe,
    reservasDeMaterial, materialReservado, materialDisponible, tieneStockBajo, materialesBajos, movimientosDe,
    guardarCliente, eliminarCliente, guardarProducto, guardarMaterial, eliminarProducto,
    ajustarStock, registrarMovimiento
  };
})(window.App = window.App || {});
