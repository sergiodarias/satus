/* ==========================================================================
   data/local-adapter.js — Persistencia en el navegador (localStorage)
   --------------------------------------------------------------------------
   Contrato que cumple cualquier adaptador (local, Supabase…):

     load()                          → Promise<db | null>
     persist(op, coleccion, registro, db) → Promise<void>
         op: 'insert' | 'update' | 'remove' | 'replaceAll'

   El adaptador local ignora `op` y guarda la base entera; el de Supabase
   traduce cada `op` a una llamada a la tabla correspondiente.
   ========================================================================== */
(function (App) {
  'use strict';

  const KEY = () => App.config.STORAGE_KEY;

  App.adapters = App.adapters || {};

  App.adapters.local = {
    nombre: 'local',
    descripcion: 'Datos guardados solo en este dispositivo',

    async load() {
      try {
        const raw = window.localStorage.getItem(KEY());
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    async persist(op, coleccion, registro, db) {
      try {
        window.localStorage.setItem(KEY(), JSON.stringify(db));
      } catch (e) {
        throw new Error('No se ha podido guardar en este dispositivo (almacenamiento lleno o bloqueado).');
      }
    }
  };
})(window.App = window.App || {});
