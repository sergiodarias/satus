/* ==========================================================================
   config.js — Configuración central de la aplicación
   --------------------------------------------------------------------------
   Todo lo que un día puede cambiar sin tocar la lógica vive aquí:
   versión, usuarios, roles y permisos, ruta de proceso por defecto.
   ========================================================================== */
(function (App) {
  'use strict';

  App.config = {
    // Súbela en cada publicación (y el CACHE de sw.js). Se ve en Ajustes.
    VERSION: '0.3.0 · 28/09/2026',

    MARCA: { nombre: 'SATUS', lema: 'Materiales que crean momentos', instagram: 'satus_mobiliario' },

    // Claves de almacenamiento local (modo sin servidor).
    STORAGE_KEY: 'produccion.v2',
    SESSION_KEY: 'produccion.sesion',

    // 'supabase' → datos compartidos entre todos los móviles (producción).
    // 'local'    → datos solo en este navegador, sin contraseña (pruebas).
    // Atajo: añadir ?modo=local a la dirección fuerza el modo local.
    BACKEND: 'supabase',

    // Proyecto de Supabase. Ambos valores son públicos por diseño: la
    // seguridad la ponen las políticas de supabase/002_permisos.sql.
    // NUNCA poner aquí la clave secreta (sb_secret_… / service_role).
    SUPABASE_URL: 'https://elhwoubtuptcfbetvgpd.supabase.co',
    SUPABASE_KEY: 'sb_publishable_x76dBXDUUKC8RP0J40Fokw_SYUDFuBm',

    // Cada cuánto se traen los cambios de los demás mientras la app está abierta.
    RECARGA_SEGUNDOS: 60,

    // Si no hay datos, carga el ejemplo automáticamente (útil en la vista previa).
    AUTO_DEMO: false,

    // Días sin avanzar a partir de los cuales un pedido se marca como parado.
    STALE_DAYS: 5,

    // Máximo de una imputación manual (minutos). Evita errores de tecleo.
    MAX_MINUTOS_MANUAL: 16 * 60,

    DEFAULT_ROUTE: [
      'Pedido recibido', 'Material pedido al carpintero', 'Material recibido', 'Módulos preparados',
      'Mano de producto base', 'Secado y lijado', 'Mano de producto final (1.ª capa)', 'Secado y lijado',
      'Mano de producto final (2.ª capa)', 'Secado y lijado', 'Poliuretano aplicado', 'Montado y entregado'
    ],

    /* ----------------------------------------------------------------------
       Usuarios preconfigurados (solo modo local).
       Con Supabase, estos datos salen de la tabla `perfiles`.
       ---------------------------------------------------------------------- */
    USUARIOS: [
      { id: 'u-eduardo',  nombre: 'Eduardo Díaz', usuario: 'eduardo',  rol: 'editor' },
      { id: 'u-sergio',   nombre: 'Sergio Díaz',  usuario: 'sergio',   rol: 'editor' },
      { id: 'u-usuario1', nombre: 'Usuario 1',    usuario: 'usuario1', rol: 'operario' },
      { id: 'u-usuario2', nombre: 'Usuario 2',    usuario: 'usuario2', rol: 'operario' },
      { id: 'u-usuario3', nombre: 'Usuario 3',    usuario: 'usuario3', rol: 'operario' }
    ],

    /* ----------------------------------------------------------------------
       Matriz de permisos (RBAC).
       - '*'                → todo.
       - 'accion'           → permitido siempre.
       - 'accion:propio'    → permitido solo sobre registros del propio usuario
                              (registro.usuarioId === usuario actual).
       Las mismas reglas se aplican en la base de datos (supabase/002_permisos.sql).

       Permisos de lectura que el operario NO tiene (ve la orden de
       fabricación, pero no el cliente ni los precios):
         'cliente.ver'  → nombre y datos del cliente, pestaña Clientes
         'catalogo.ver' → pestaña Catálogo (precios, costes)
         'stock.ver'    → avisos de stock bajo
       ---------------------------------------------------------------------- */
    ROLES: {
      editor: {
        etiqueta: 'Editor',
        permisos: ['*']
      },
      operario: {
        etiqueta: 'Operario',
        permisos: [
          'tiempo.registrar',
          'tiempo.borrar:propio',
          'incidencia.crear',
          'incidencia.borrar:propio'
        ]
      }
    }
  };

  try {
    if (new URLSearchParams(window.location.search).get('modo') === 'local') App.config.BACKEND = 'local';
  } catch (e) { /* nada */ }
})(window.App = window.App || {});
