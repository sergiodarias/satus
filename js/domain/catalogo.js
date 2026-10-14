/* ==========================================================================
   domain/catalogo.js — Clientes, productos fabricados y materiales
   --------------------------------------------------------------------------
   Reglas de negocio puras: validan, comprueban permisos y escriben a través
   de App.repo. No saben nada del DOM.

   Productos y materiales comparten colección (`productos`) y se distinguen
   por `categoria`: 'fabricado' | 'material'.

   El stock y el inventario se llevan en otra aplicación. Aquí solo se
   apunta lo que se gasta (ver domain/consumos.js).
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum } = App.util;
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
    const precio = parseNum(datos.precio);
    const limpio = {
      categoria: 'fabricado', nombre, tipo: datos.tipo || '', material: datos.material || '',
      dimensiones: (datos.dimensiones || '').trim(), precio: isNaN(precio) ? null : precio,
      notas: (datos.notas || '').trim(), ruta
    };
    return id ? repo().update('productos', id, limpio) : repo().insert('productos', limpio);
  }

  function guardarMaterial(datos, id) {
    auth().exigir('material.gestionar');
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw new DomainError('El nombre del material es obligatorio.');
    const precio = parseNum(datos.precio);
    const limpio = {
      categoria: 'material', nombre, unidad: datos.unidad || 'ud',
      precio: isNaN(precio) ? null : precio, notas: (datos.notas || '').trim()
    };
    return id ? repo().update('productos', id, limpio) : repo().insert('productos', limpio);
  }

  function eliminarProducto(id) {
    const prod = repo().get('productos', id);
    if (!prod) return;
    if (prod.categoria === 'material') {
      auth().exigir('material.gestionar');
      if (repo().where('consumos', c => c.materialId === id).length) {
        throw new DomainError('Este material tiene consumos apuntados en pedidos: no se puede eliminar sin perder ese histórico.');
      }
      repo().where('movimientos', m => m.materialId === id).forEach(m => repo().remove('movimientos', m.id));
    } else {
      auth().exigir('producto.gestionar');
      if (repo().where('pedidos', p => p.productoId === id).length) {
        throw new DomainError('Este producto tiene pedidos. Elimina o reasigna esos pedidos primero.');
      }
    }
    repo().remove('productos', id);
  }

  App.catalogo = {
    clientes, fabricados, materiales, rutaDe, movimientosDe,
    guardarCliente, eliminarCliente, guardarProducto, guardarMaterial, eliminarProducto
  };
})(window.App = window.App || {});
