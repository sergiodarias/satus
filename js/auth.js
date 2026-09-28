/* ==========================================================================
   auth.js — Sesión y control de acceso (RBAC)
   --------------------------------------------------------------------------
   Dos modos, según App.config.BACKEND:
   - 'supabase': email + contraseña con Supabase Auth. El nombre y el rol
     salen de la tabla `perfiles`. La sesión se recuerda en el dispositivo.
   - 'local': elegir usuario de una lista, sin contraseña (pruebas).
     Atajo: ?como=usuario1 (o eduardo, sergio…) entra directamente.

   can() es igual en los dos modos: lee la matriz ROLES de config.js.
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError } = App.util;
  let actual = null;
  let perfiles = [];   // modo Supabase: [{ id, nombre, rol }]

  const modoServidor = () => App.config.BACKEND === 'supabase';
  const sb = () => App.adapters.supabase.cliente();

  function usuarios() { return modoServidor() ? perfiles : App.config.USUARIOS; }
  function porId(id) { return usuarios().find(u => u.id === id) || null; }
  function porAlias(alias) {
    alias = String(alias || '').toLowerCase();
    return App.config.USUARIOS.find(u => u.usuario === alias || u.id === alias) || null;
  }

  function guardarSesionLocal(id) {
    try {
      if (id) window.localStorage.setItem(App.config.SESSION_KEY, id);
      else window.localStorage.removeItem(App.config.SESSION_KEY);
    } catch (e) { /* sin almacenamiento: la sesión dura lo que la pestaña */ }
  }

  async function cargarPerfiles(uid) {
    const res = await sb().from('perfiles').select('id, nombre, rol').order('nombre');
    if (res.error) throw new DomainError(App.adapters.supabase.mensaje(res.error));
    perfiles = res.data || [];
    actual = perfiles.find(p => p.id === uid) || null;
    return actual;
  }

  function traducirError(error) {
    const m = (error && error.message) || '';
    if (/invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
    if (/email not confirmed/i.test(m)) return 'Este usuario no está confirmado. En Supabase, márcalo como confirmado.';
    if (/fetch|network/i.test(m)) return 'Sin conexión con el servidor. Revisa la cobertura.';
    return m || 'No se ha podido iniciar sesión.';
  }

  App.auth = {
    usuarios,
    porId,
    modoServidor,

    /**
     * Recupera la sesión al abrir la app.
     * Servidor: la sesión guardada por Supabase. Local: la guardada o ?como=.
     */
    async restaurar() {
      if (modoServidor()) {
        const { data } = await sb().auth.getSession();
        if (!data || !data.session) { actual = null; return null; }
        await cargarPerfiles(data.session.user.id);
        if (!actual) await sb().auth.signOut();
        return actual;
      }
      let desdeUrl = null;
      try { desdeUrl = new URLSearchParams(window.location.search).get('como'); } catch (e) { /* nada */ }
      if (desdeUrl && porAlias(desdeUrl)) { this.login(porAlias(desdeUrl).id); return actual; }
      let id = null;
      try { id = window.localStorage.getItem(App.config.SESSION_KEY); } catch (e) { /* nada */ }
      actual = porId(id);
      return actual;
    },

    /** Modo local: entrar como un usuario de la lista. */
    login(id) {
      const u = porId(id);
      if (!u) throw new DomainError('Usuario desconocido.');
      actual = u;
      guardarSesionLocal(u.id);
      return u;
    },

    /** Modo servidor: email y contraseña. */
    async loginEmail(email, password) {
      email = String(email || '').trim();
      if (!email || !password) throw new DomainError('Escribe tu email y tu contraseña.');
      const { data, error } = await sb().auth.signInWithPassword({ email, password });
      if (error) throw new DomainError(traducirError(error));
      await cargarPerfiles(data.user.id);
      if (!actual) {
        await sb().auth.signOut();
        throw new DomainError('Tu usuario existe pero no tiene perfil en el taller. Pide a un editor que te dé de alta.');
      }
      return actual;
    },

    async logout() {
      actual = null;
      if (modoServidor()) { try { await sb().auth.signOut(); } catch (e) { /* nada */ } perfiles = []; }
      else guardarSesionLocal(null);
    },

    current() { return actual; },

    esEditor() { return !!actual && actual.rol === 'editor'; },

    rolEtiqueta(u) { u = u || actual; return u && App.config.ROLES[u.rol] ? App.config.ROLES[u.rol].etiqueta : ''; },

    nombreDe(id) { const u = porId(id); return u ? u.nombre : 'Usuario desconocido'; },

    /**
     * ¿Puede el usuario actual hacer `accion`?
     * `registro` (opcional) se usa para los permisos ':propio'.
     */
    can(accion, registro) {
      if (!actual) return false;
      const rol = App.config.ROLES[actual.rol];
      if (!rol) return false;
      const p = rol.permisos;
      if (p.includes('*') || p.includes(accion)) return true;
      if (p.includes(accion + ':propio')) return !!registro && registro.usuarioId === actual.id;
      return false;
    },

    /** Igual que can(), pero lanza un error legible si no hay permiso. */
    exigir(accion, registro) {
      if (!this.can(accion, registro)) {
        throw new DomainError('Tu perfil (' + this.rolEtiqueta() + ') no tiene permiso para esta acción.');
      }
    }
  };
})(window.App = window.App || {});
