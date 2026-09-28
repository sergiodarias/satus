/* ==========================================================================
   data/repo.js — Acceso a datos (repositorio)
   --------------------------------------------------------------------------
   Única puerta a los datos para el resto de la app. Mantiene una copia en
   memoria (lecturas síncronas e instantáneas) y delega el guardado en el
   adaptador activo (local o Supabase). Las escrituras son optimistas: se
   aplican en memoria al momento y, si el guardado falla, se avisa.
   ========================================================================== */
(function (App) {
  'use strict';

  const COLECCIONES = ['clientes', 'productos', 'pedidos', 'movimientos', 'tiempos', 'incidencias'];
  const DATA_VERSION = 2;

  let db = vacia();
  let adapter = null;
  const escuchasError = [];

  function vacia() {
    const o = { version: DATA_VERSION };
    COLECCIONES.forEach(c => { o[c] = []; });
    return o;
  }

  /**
   * Normaliza cualquier copia de datos a la versión actual.
   * Acepta también el formato de la versión anterior de la app
   * ({clientes, productos, pedidos} con los movimientos dentro de cada material).
   */
  function normalizar(entrada) {
    const out = vacia();
    if (!entrada || typeof entrada !== 'object') return out;
    COLECCIONES.forEach(c => { if (Array.isArray(entrada[c])) out[c] = entrada[c].slice(); });

    // v1 → v2: los movimientos de stock pasan a su propia colección.
    out.productos = out.productos.map(p => {
      if (Array.isArray(p.movimientos)) {
        p.movimientos.forEach(m => out.movimientos.push({
          id: m.id || App.util.uid(), materialId: p.id, fecha: m.fecha, tipo: m.tipo,
          cantidad: m.cantidad, nota: m.nota || '', auto: !!m.auto, pedidoId: m.pedidoId || null, usuarioId: null
        }));
        const copia = Object.assign({}, p);
        delete copia.movimientos;
        return copia;
      }
      return p;
    });

    // Pedidos: garantizar campos nuevos.
    out.pedidos = out.pedidos.map(p => Object.assign({
      fechaEntrega: null, consumo: [], materialesDespachados: false, fechaDespacho: null, notas: ''
    }, p, {
      etapas: (p.etapas || []).map(e => Object.assign({ asignadoA: null, fecha: null, completada: false }, e))
    }));

    // Número de orden de fabricación (OF-0001…) para los pedidos que no lo tengan,
    // por orden de fecha. Los existentes se respetan.
    let max = out.pedidos.reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0);
    out.pedidos.filter(p => !p.numero)
      .sort((a, b) => String(a.fechaPedido).localeCompare(String(b.fechaPedido)))
      .forEach(p => { p.numero = ++max; });
    return out;
  }

  function avisarError(err) {
    escuchasError.forEach(fn => { try { fn(err); } catch (e) { /* nada */ } });
  }

  // Escrituras en vuelo: mientras haya alguna, no se recarga desde el servidor
  // (evita que una lectura vieja pise un cambio que aún se está guardando).
  let pendientes = 0;
  function guardar(op, col, registro) {
    const snapshot = db;
    // Copia del registro tal y como está ahora (el objeto en memoria puede cambiar después).
    const copia = registro ? JSON.parse(JSON.stringify(registro)) : null;
    pendientes++;
    return adapter.persist(op, col, copia, snapshot).catch(avisarError).finally(() => { pendientes--; });
  }

  function coleccion(col) {
    if (!db[col]) throw new Error('Colección desconocida: ' + col);
    return db[col];
  }

  App.repo = {
    COLECCIONES,

    async init(adapterImpl) {
      adapter = adapterImpl;
      db = normalizar(await adapter.load());
    },

    /** Vuelve a leer del servidor. Devuelve false si no se ha podido (o no tocaba). */
    async recargar() {
      if (!adapter || pendientes > 0) return false;
      const nuevo = normalizar(await adapter.load());
      if (pendientes > 0) return false;
      db = nuevo;
      return true;
    },

    /** Olvida los datos en memoria (al cerrar sesión). */
    vaciar() { db = vacia(); },

    guardadosPendientes() { return pendientes; },

    /**
     * Importa una copia de seguridad.
     * - Local: sustituye todos los datos.
     * - Servidor: añade o actualiza por id, sin borrar nada, y vuelve a leer.
     */
    async importar(datos) {
      const limpio = normalizar(datos);
      if (adapter && adapter.importar) {
        // Evitar números de OF repetidos: los pedidos nuevos cuyo número ya
        // usa otro pedido del servidor reciben el siguiente libre.
        const usados = new Map(db.pedidos.map(p => [Number(p.numero), p.id]));
        let max = db.pedidos.concat(limpio.pedidos).reduce((m, p) => Math.max(m, Number(p.numero) || 0), 0);
        limpio.pedidos.forEach(p => {
          const duenio = usados.get(Number(p.numero));
          if (duenio && duenio !== p.id) p.numero = ++max;
          usados.set(Number(p.numero), p.id);
        });
        const r = await adapter.importar(limpio);
        db = normalizar(await adapter.load());
        return r;
      }
      db = limpio;
      await adapter.persist('replaceAll', null, null, db);
      return { subidos: null, omitidos: 0 };
    },

    permiteSustituirTodo() { return !!adapter && !adapter.importar; },

    adapterNombre() { return adapter ? adapter.nombre : '—'; },
    adapterDescripcion() { return adapter ? adapter.descripcion : ''; },

    onError(fn) { escuchasError.push(fn); },

    all(col) { return coleccion(col); },
    get(col, id) { return coleccion(col).find(r => r.id === id) || null; },
    where(col, fn) { return coleccion(col).filter(fn); },
    estaVacia() { return COLECCIONES.every(c => db[c].length === 0); },

    insert(col, registro, { alPrincipio = false } = {}) {
      if (!registro.id) registro.id = App.util.uid();
      if (alPrincipio) coleccion(col).unshift(registro); else coleccion(col).push(registro);
      guardar('insert', col, registro);
      return registro;
    },

    update(col, id, cambios) {
      const r = this.get(col, id);
      if (!r) throw new App.util.DomainError('El registro ya no existe.');
      Object.assign(r, cambios);
      guardar('update', col, r);
      return r;
    },

    remove(col, id) {
      const lista = coleccion(col);
      const i = lista.findIndex(r => r.id === id);
      if (i === -1) return null;
      const [quitado] = lista.splice(i, 1);
      guardar('remove', col, quitado);
      return quitado;
    },

    /** Sustituye todos los datos (importar, datos de ejemplo, borrar todo). */
    replaceAll(nuevos) {
      db = normalizar(nuevos);
      return guardar('replaceAll', null, null);
    },

    /** Copia completa para exportar. */
    exportar() {
      return Object.assign({ exportado: App.util.nowISO(), app: 'Satus · Producción', versionApp: App.config.VERSION }, App.util.clone(db));
    },

    normalizar
  };
})(window.App = window.App || {});
