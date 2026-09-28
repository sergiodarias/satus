/* ==========================================================================
   ui/views/sesion.js — Pantalla de acceso y hoja de ajustes
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc } = App.util;
  const ui = () => App.ui;
  const can = a => App.auth.can(a);

  App.views = App.views || {};

  /** Placa de microcemento con el logotipo en bajorrelieve + lema. */
  function marca(texto) {
    const m = App.config.MARCA;
    return '<div class="acceso-placa"><p class="relieve" aria-label="' + esc(m.nombre) + '">' + esc(m.nombre) + '</p>' +
      '<p class="lema">' + esc(m.lema) + '</p></div>' +
      '<div class="acceso-cabecera"><h1 class="acceso-titulo">Producción</h1><p class="acceso-texto">' + texto + '</p></div>';
  }

  /** Acceso con email y contraseña (datos compartidos en Supabase). */
  function accesoServidor() {
    return '<main class="acceso">' + marca('Entra con tu email y tu contraseña.') +
      '<form class="formulario" data-form="acceso" novalidate>' +
      ui().campo('Email', '<input id="acc-email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">') +
      ui().campo('Contraseña', '<input id="acc-pass" name="password" type="password" autocomplete="current-password" enterkeyhint="go">') +
      '<p class="acceso-error" role="alert"></p>' +
      '<button type="submit" class="btn btn-primario btn-ancho">Entrar</button></form>' +
      '<p class="acceso-pie">Si has olvidado la contraseña, pide a un editor que te ponga una nueva desde Supabase.</p></main>';
  }

  /** Acceso de prueba: elegir usuario, sin contraseña. */
  function accesoLocal() {
    const grupo = (rol, titulo, texto) => {
      const us = App.auth.usuarios().filter(u => u.rol === rol);
      return '<section class="acceso-grupo"><h2 class="acceso-grupo-titulo">' + titulo + '</h2><p class="acceso-grupo-texto">' + texto + '</p>' +
        us.map(u => '<button type="button" class="acceso-usuario" data-action="entrar" data-id="' + esc(u.id) + '">' + ui().avatar(u) +
          '<span class="acceso-nombre">' + esc(u.nombre) + '</span>' + ui().icono('derecha', 'ico-flecha') + '</button>').join('') + '</section>';
    };
    return '<main class="acceso">' + marca('¿Quién está usando la app?') +
      grupo('editor', 'Editores', 'Gestionan pedidos, catálogo, clientes y asignaciones.') +
      grupo('operario', 'Operarios', 'Ven las órdenes de fabricación e imputan tiempos, incidencias y notas.') +
      '<p class="acceso-pie">Modo de prueba: acceso sin contraseña y datos guardados solo en este dispositivo.</p></main>';
  }

  App.views.acceso = function renderAcceso() {
    return App.auth.modoServidor() ? accesoServidor() : accesoLocal();
  };

  App.sheets = App.sheets || {};

  App.sheets.ajustes = function () {
    const u = App.auth.current();
    const servidor = App.auth.modoServidor();
    let c = '<div class="perfil">' + ui().avatar(u, 'avatar-grande') + '<div><p class="perfil-nombre">' + esc(u.nombre) + '</p>' +
      '<p class="perfil-rol">' + esc(App.auth.rolEtiqueta(u)) + ' · ' + (u.rol === 'editor' ? 'control total' : 'órdenes de fabricación, tiempos e incidencias') + '</p></div></div>' +
      '<button type="button" class="btn btn-ancho" data-action="salir">' + (servidor ? 'Cerrar sesión' : 'Cambiar de usuario') + '</button>';

    c += '<h3 class="subtitulo">Datos</h3><p class="ayuda">' + esc(App.repo.adapterDescripcion()) + '.</p>';
    if (servidor) c += '<div class="lista-botones"><button type="button" class="btn btn-ancho" data-action="recargar">Recargar datos ahora</button></div>';
    if (can('datos.importar')) {
      c += '<div class="lista-botones" style="margin-top:8px">' +
        '<button type="button" class="btn btn-ancho" data-action="exportar">Descargar copia de seguridad (JSON)</button>' +
        '<label class="btn btn-ancho btn-archivo">' + (servidor ? 'Subir copia al servidor' : 'Importar copia de seguridad') +
        '<input type="file" id="importar-archivo" accept="application/json,.json" data-change="importar"></label>' +
        (App.repo.permiteSustituirTodo()
          ? '<button type="button" class="btn btn-ancho" data-action="cargar-demo">Cargar datos de ejemplo</button>' +
            '<button type="button" class="btn btn-ancho btn-peligro" data-action="borrar-todo">Borrar todos los datos</button>'
          : '') + '</div>' +
        '<p class="ayuda">' + (servidor
          ? 'Subir una copia añade sus datos al servidor (también la de la versión anterior de la app). No borra nada.'
          : 'Importar acepta también la copia de la versión anterior de la app (clientes, productos y pedidos).') + '</p>';
    }
    const m = App.config.MARCA;
    c += '<h3 class="subtitulo">Acerca de</h3><p class="ayuda"><span class="logotipo logotipo-pequeno">' + esc(m.nombre) + '</span> · ' + esc(m.lema) + '<br>' +
      '<a class="enlace" href="https://www.instagram.com/' + esc(m.instagram) + '/" target="_blank" rel="noopener">@' + esc(m.instagram) + '</a><br>' +
      'Versión <strong class="num" id="version-app">' + esc(App.config.VERSION) + '</strong></p>';
    return { titulo: 'Ajustes', cuerpo: c };
  };
})(window.App = window.App || {});
