/* ==========================================================================
   data/supabase-adapter.js — Persistencia compartida en Supabase
   --------------------------------------------------------------------------
   Cumple el mismo contrato que local-adapter.js:
     load()                                → Promise<db>
     persist(op, coleccion, registro, db)  → Promise<void>
   y además:
     importar(db)                          → sube una copia (añade/actualiza)

   Detalles:
   - camelCase (app) ⇄ snake_case (Postgres). Solo claves de primer nivel:
     el contenido de las columnas jsonb (etapas, ruta, receta, consumo) no se toca.
   - Solo se envían las columnas que existen en cada tabla (lista COLUMNAS).
   - El precio de los productos vive en una tabla aparte (`precios`) que solo
     pueden leer los editores. Aquí se junta y se separa de forma transparente.
   - Las lecturas se paginan de 1000 en 1000 (límite de Supabase por consulta).
   Requiere supabase-js cargado antes (ver index.html).
   ========================================================================== */
(function (App) {
  'use strict';

  const TABLAS = {
    clientes: 'clientes', productos: 'productos', pedidos: 'pedidos',
    movimientos: 'movimientos_stock', tiempos: 'tiempos', incidencias: 'incidencias'
  };

  const COLUMNAS = {
    clientes: ['id', 'nombre', 'contacto', 'telefono', 'email', 'direccion', 'notas'],
    productos: ['id', 'categoria', 'nombre', 'notas', 'tipo', 'material', 'dimensiones', 'ruta', 'receta', 'unidad', 'stock', 'stockMinimo'],
    pedidos: ['id', 'numero', 'clienteId', 'productoId', 'cantidad', 'fechaPedido', 'fechaEntrega', 'notas', 'etapas', 'consumo', 'materialesDespachados', 'fechaDespacho'],
    movimientos: ['id', 'materialId', 'fecha', 'tipo', 'cantidad', 'nota', 'auto', 'pedidoId', 'usuarioId'],
    tiempos: ['id', 'pedidoId', 'etapaIdx', 'etapaNombre', 'usuarioId', 'modo', 'inicio', 'fin', 'minutos', 'fecha', 'nota'],
    incidencias: ['id', 'tipo', 'gravedad', 'texto', 'pedidoId', 'etapaIdx', 'usuarioId', 'creada', 'resuelta', 'resueltaPor', 'fechaResolucion']
  };
  // Columnas de fecha: una cadena vacía se guarda como null.
  const FECHAS = ['fechaPedido', 'fechaEntrega', 'fechaDespacho', 'fecha', 'inicio', 'fin', 'creada', 'fechaResolucion'];

  const aSnake = k => k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  const aCamel = k => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  function aFila(col, reg) {
    const fila = {};
    COLUMNAS[col].forEach(k => {
      if (reg[k] === undefined) return;
      fila[aSnake(k)] = (reg[k] === '' && FECHAS.includes(k)) ? null : reg[k];
    });
    return fila;
  }
  function deFila(fila) {
    const o = {};
    Object.keys(fila).forEach(k => { o[aCamel(k)] = fila[k]; });
    return o;
  }

  let client = null;
  function sb() {
    if (!client) {
      if (!window.supabase || !window.supabase.createClient) throw new Error('No se ha podido cargar la conexión con Supabase. Comprueba la conexión a internet.');
      client = window.supabase.createClient(App.config.SUPABASE_URL, App.config.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'produccion.auth' }
      });
    }
    return client;
  }

  function mensaje(error) {
    if (!error) return 'Error desconocido';
    const m = error.message || String(error);
    if (/row-level security|permission denied/i.test(m)) return 'Tu perfil no tiene permiso para este cambio.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión con el servidor. Revisa la cobertura y vuelve a intentarlo.';
    if (/duplicate key/i.test(m)) return 'Ese registro ya existe (dato duplicado). Recarga la app.';
    return m;
  }
  function comprobar(res) { if (res && res.error) throw new Error(mensaje(res.error)); return res; }

  async function leerTodo(tabla) {
    const filas = [];
    const PAG = 1000;
    for (let desde = 0; ; desde += PAG) {
      const res = comprobar(await sb().from(tabla).select('*').range(desde, desde + PAG - 1));
      filas.push(...res.data);
      if (res.data.length < PAG) break;
    }
    return filas;
  }

  App.adapters = App.adapters || {};

  App.adapters.supabase = {
    nombre: 'supabase',
    descripcion: 'Datos compartidos en el servidor (Supabase)',
    cliente: sb,
    mensaje,

    async load() {
      const cols = Object.keys(TABLAS);
      const [precios, ...listas] = await Promise.all([leerTodo('precios')].concat(cols.map(c => leerTodo(TABLAS[c]))));
      const db = {};
      cols.forEach((c, i) => { db[c] = listas[i].map(deFila); });
      const porId = {};
      precios.forEach(p => { porId[p.producto_id] = p.precio; });
      db.productos.forEach(p => { p.precio = Object.prototype.hasOwnProperty.call(porId, p.id) ? porId[p.id] : null; });
      return db;
    },

    async persist(op, coleccion, registro) {
      const tabla = TABLAS[coleccion];
      if (op === 'replaceAll') throw new Error('Con datos compartidos no se puede sustituir todo desde la app.');
      if (!tabla) return;
      if (op === 'insert') comprobar(await sb().from(tabla).insert(aFila(coleccion, registro)));
      else if (op === 'update') comprobar(await sb().from(tabla).update(aFila(coleccion, registro)).eq('id', registro.id));
      else if (op === 'remove') comprobar(await sb().from(tabla).delete().eq('id', registro.id));
      // El precio va a su propia tabla (solo editores pueden leerla o escribirla).
      if (coleccion === 'productos' && op !== 'remove' && registro.precio !== undefined && App.auth.can('precio.ver')) {
        comprobar(await sb().from('precios').upsert({ producto_id: registro.id, precio: registro.precio }));
      }
    },

    /**
     * Sube una copia de seguridad: añade lo nuevo y actualiza lo que ya existe
     * (por id). No borra nada. Los tiempos e incidencias de usuarios que no
     * existen en el servidor se omiten. Devuelve { subidos, omitidos }.
     */
    async importar(db) {
      const ids = new Set(App.auth.usuarios().map(u => u.id));
      const valido = id => ids.has(id);
      let subidos = 0, omitidos = 0;
      const prep = {
        clientes: db.clientes,
        productos: db.productos,
        pedidos: db.pedidos.map(p => Object.assign({}, p, {
          etapas: (p.etapas || []).map(e => Object.assign({}, e, { asignadoA: valido(e.asignadoA) ? e.asignadoA : null }))
        })),
        movimientos: db.movimientos.map(m => Object.assign({}, m, { usuarioId: valido(m.usuarioId) ? m.usuarioId : null })),
        tiempos: db.tiempos.filter(t => valido(t.usuarioId) || (omitidos++, false)),
        incidencias: db.incidencias.filter(x => valido(x.usuarioId) || (omitidos++, false))
          .map(x => Object.assign({}, x, { resueltaPor: valido(x.resueltaPor) ? x.resueltaPor : null }))
      };
      for (const col of ['clientes', 'productos', 'pedidos', 'movimientos', 'tiempos', 'incidencias']) {
        const filas = prep[col].map(r => aFila(col, r));
        for (let i = 0; i < filas.length; i += 500) {
          comprobar(await sb().from(TABLAS[col]).upsert(filas.slice(i, i + 500)));
        }
        subidos += filas.length;
      }
      const precios = db.productos.filter(p => p.precio !== null && p.precio !== undefined && p.precio !== '')
        .map(p => ({ producto_id: p.id, precio: Number(p.precio) }));
      if (precios.length) comprobar(await sb().from('precios').upsert(precios));
      return { subidos, omitidos };
    }
  };
})(window.App = window.App || {});
