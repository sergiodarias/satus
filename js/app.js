/* ==========================================================================
   app.js — Arranque, estado de interfaz, pintado y eventos
   --------------------------------------------------------------------------
   Flujo:  evento del DOM → acción (aquí) → dominio (App.pedidos, …)
           → repositorio (App.repo) → adaptador (local/Supabase)
           → pintar() vuelve a dibujar la pantalla.

   Eventos por delegación: un solo escuchador por tipo en `document` y
   atributos data-* en el HTML:
     data-action="nombre"   → clic         → ACCIONES[nombre]
     data-form="nombre"     → envío        → FORMULARIOS[nombre]
     data-change="nombre"   → cambio       → CAMBIOS[nombre]
     data-input="nombre"    → tecleo       → ENTRADAS[nombre]
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, DomainError, parseNum } = App.util;
  const ui = App.ui;

  /* ---------------------------- Estado de interfaz ------------------------- */
  // Solo lo que describe la pantalla. Los datos viven en App.repo.
  ui.state = {
    pestana: 'panel',
    filtroPedidos: 'activos',
    busquedaPedidos: '',
    pedidoAbierto: null,
    vistaCatalogo: 'productos',
    productoAbierto: null,
    busquedaClientes: '',
    filtroIncidencias: 'abiertas',
    errorGuardado: null,
    cargando: null
  };
  const S = ui.state;

  const PESTANAS = [
    { id: 'panel', etiqueta: 'Panel', icono: 'panel' },
    { id: 'pedidos', etiqueta: 'Pedidos', icono: 'pedidos' },
    { id: 'incidencias', etiqueta: 'Incidencias', icono: 'incidencias' },
    { id: 'catalogo', etiqueta: 'Catálogo', icono: 'catalogo', permiso: 'catalogo.ver' },
    { id: 'clientes', etiqueta: 'Clientes', icono: 'clientes', permiso: 'cliente.ver' }
  ];
  /** Pestañas que el usuario actual puede ver. */
  function pestanasVisibles() { return PESTANAS.filter(p => !p.permiso || App.auth.can(p.permiso)); }

  /* -------------------------------- Pintado -------------------------------- */

  function pintar() {
    const app = document.getElementById('app');
    if (S.cargando) {
      app.innerHTML = '<p class="cargando">' + esc(S.cargando) + '</p>';
      return;
    }
    const u = App.auth.current();
    if (!u) {
      app.innerHTML = App.views.acceso();
      ui.cerrarHoja();
      return;
    }
    const abiertas = App.incidencias.abiertas().length;
    const enCurso = App.pedidos.activos().length;
    const contadores = { pedidos: enCurso, incidencias: abiertas };
    const visibles = pestanasVisibles();
    if (!visibles.some(p => p.id === S.pestana)) S.pestana = 'panel';

    app.innerHTML =
      '<header class="cabecera"><div class="cabecera-interior">' +
      '<div class="marca"><span class="marca-sello" aria-hidden="true"></span><span class="marca-nombre">Control de producción</span></div>' +
      '<button type="button" class="usuario-chip" data-action="ajustes" aria-label="Ajustes y usuario">' + ui.avatar(u) +
      '<span class="usuario-textos"><span class="usuario-nombre">' + esc(u.nombre) + '</span><span class="usuario-rol">' + esc(App.auth.rolEtiqueta(u)) + '</span></span></button>' +
      '</div>' + bannerTemporizador(u) + '</header>' +
      (S.errorGuardado ? '<div class="banner-error" role="alert">' + esc(S.errorGuardado) + ' <button type="button" class="enlace" data-action="cerrar-error">Entendido</button></div>' : '') +
      '<nav class="pestanas" aria-label="Secciones"><div class="pestanas-interior" style="grid-template-columns:repeat(' + visibles.length + ',1fr)">' + visibles.map(p =>
        '<button type="button" class="pestana' + (S.pestana === p.id ? ' activa' : '') + '" data-action="pestana" data-valor="' + p.id + '"' + (S.pestana === p.id ? ' aria-current="page"' : '') + '>' +
        ui.icono(p.icono) + '<span class="pestana-texto">' + p.etiqueta + '</span>' +
        (contadores[p.id] ? '<span class="pestana-contador' + (p.id === 'incidencias' ? ' contador-alerta' : '') + '">' + contadores[p.id] + '</span>' : '') +
        '</button>').join('') + '</div></nav>' +
      '<main class="contenido" id="contenido">' + App.views[S.pestana]() + '</main>';

    ui.pintarHoja();
    tic();
  }

  function bannerTemporizador(u) {
    const t = App.tiempos.enMarcha(u.id);
    if (!t) return '';
    const p = App.repo.get('pedidos', t.pedidoId);
    const linea = p ? App.pedidos.titulo(p).linea : 'Pedido eliminado';
    return '<div class="banner-tiempo" role="status"><div class="banner-tiempo-interior">' +
      '<button type="button" class="banner-tiempo-info" data-action="abrir-etapa" data-id="' + esc(t.pedidoId) + '" data-idx="' + t.etapaIdx + '">' +
      '<span class="punto-vivo" aria-hidden="true"></span><span class="banner-tiempo-textos"><span class="banner-tiempo-etapa">' + esc(t.etapaNombre) + '</span>' +
      '<span class="banner-tiempo-pedido">' + esc(linea) + '</span></span>' +
      '<span class="banner-tiempo-reloj num" data-desde="' + esc(t.inicio) + '">00:00:00</span></button>' +
      '<button type="button" class="btn btn-parar" data-action="parar-tiempo">' + ui.icono('stop') + 'Parar</button></div></div>';
  }

  /** Actualiza los cronómetros visibles sin volver a pintar la pantalla. */
  function tic() {
    const els = document.querySelectorAll('[data-desde]');
    const ahora = Date.now();
    els.forEach(el => { el.textContent = App.util.formatElapsed((ahora - Date.parse(el.getAttribute('data-desde'))) / 1000); });
    return els.length;
  }
  let intervalo = null;
  function arrancarReloj() {
    if (intervalo) return;
    intervalo = setInterval(tic, 1000);
  }

  /** Ejecuta una acción de negocio: captura errores legibles y repinta. */
  function ejecutar(fn, mensajeOk) {
    try {
      const r = fn();
      if (mensajeOk) ui.toast(typeof mensajeOk === 'function' ? mensajeOk(r) : mensajeOk, 'ok');
      pintar();
      return r;
    } catch (e) {
      // Error de negocio: nada ha cambiado, así que no se repinta (se conserva lo tecleado).
      if (e instanceof DomainError) { ui.toast(e.message, 'error'); return undefined; }
      console.error(e);
      ui.toast('Algo ha fallado: ' + e.message, 'error');
      return undefined;
    }
  }

  function scrollA(id) {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  /* -------------------------------- Acciones ------------------------------- */

  const ACCIONES = {
    // Navegación
    'pestana': d => { S.pestana = d.valor; pintar(); window.scrollTo(0, 0); },
    'ir-pedido': d => { ui.cerrarHoja(); S.pestana = 'pedidos'; S.filtroPedidos = 'todos'; S.busquedaPedidos = ''; S.pedidoAbierto = d.id; pintar(); scrollA('pedido-' + d.id); },
    'ir-material': d => { S.pestana = 'catalogo'; S.vistaCatalogo = 'materiales'; S.productoAbierto = d.id; pintar(); scrollA('producto-' + d.id); },
    'filtro-pedidos': d => { S.filtroPedidos = d.valor; pintar(); },
    'filtro-incidencias': d => { S.filtroIncidencias = d.valor; pintar(); },
    'vista-catalogo': d => { S.vistaCatalogo = d.valor; S.productoAbierto = null; pintar(); },
    'alternar-pedido': d => { S.pedidoAbierto = S.pedidoAbierto === d.id ? null : d.id; pintar(); },
    'alternar-producto': d => { S.productoAbierto = S.productoAbierto === d.id ? null : d.id; pintar(); },
    'cerrar-hoja': () => ui.cerrarHoja(),
    'cerrar-error': () => { S.errorGuardado = null; pintar(); },
    'dialogo-si': () => ui.cerrarDialogo(true),
    'dialogo-no': () => ui.cerrarDialogo(false),

    // Sesión
    'entrar': d => { App.auth.login(d.id); S.pestana = 'panel'; pintar(); window.scrollTo(0, 0); },
    'recargar': () => recargar(true),
    'ajustes': () => ui.abrirHoja('ajustes'),
    'salir': async () => {
      ui.cerrarHoja();
      await App.auth.logout();
      if (App.auth.modoServidor()) App.repo.vaciar();
      S.pedidoAbierto = null; S.productoAbierto = null; S.pestana = 'panel';
      pintar();
    },

    // Pedidos
    'nuevo-pedido': () => ui.abrirHoja('pedido', {}),
    'editar-pedido': d => ui.abrirHoja('pedido', { id: d.id }),
    'alternar-etapa': d => ejecutar(() => App.pedidos.alternarEtapa(d.id, Number(d.idx))),
    'abrir-etapa': d => ui.abrirHoja('etapa', { pedidoId: d.id, idx: Number(d.idx) }),
    'despachar': async d => {
      const faltan = App.pedidos.faltantesAlDespachar(d.id);
      const ok = await ui.confirmar(faltan.length
        ? { titulo: 'Stock real insuficiente', texto: 'Faltaría: ' + faltan.join(', ') + '. ¿Despachar igualmente?', ok: 'Despachar igualmente', peligro: true }
        : { titulo: '¿Despachar materiales?', texto: 'Se descontarán del stock real. Hazlo cuando empiece la fabricación.', ok: 'Despachar' });
      if (ok) ejecutar(() => App.pedidos.despachar(d.id), 'Materiales despachados');
    },
    'eliminar-pedido': async d => {
      const ok = await ui.confirmar({ titulo: '¿Eliminar este pedido?', texto: 'También se borran sus tiempos e incidencias. Si ya se despacharon materiales, vuelven al stock. No se puede deshacer.', ok: 'Eliminar', peligro: true });
      if (ok) ejecutar(() => { App.pedidos.eliminar(d.id); S.pedidoAbierto = null; }, 'Pedido eliminado');
    },

    // Tiempos
    'iniciar-tiempo': d => ejecutar(() => App.tiempos.iniciar(d.id, Number(d.idx)),
      r => r.detenido ? 'Temporizador anterior guardado (' + App.util.formatDuracion(r.detenido.minutos) + '). Nuevo en marcha.' : 'Temporizador en marcha'),
    'parar-tiempo': () => ejecutar(() => App.tiempos.detener(), r => r ? 'Guardado: ' + App.util.formatDuracion(r.minutos) + ' en «' + r.etapaNombre + '»' : 'No había temporizador en marcha'),
    'borrar-tiempo': async d => {
      const ok = await ui.confirmar({ titulo: '¿Borrar este registro de tiempo?', ok: 'Borrar', peligro: true });
      if (ok) ejecutar(() => App.tiempos.eliminar(d.id), 'Registro borrado');
    },

    // Incidencias
    'nueva-incidencia': d => ui.abrirHoja('incidencia', { pedidoId: d.pedido || '', etapaIdx: d.idx === undefined ? '' : d.idx }),
    'resolver-incidencia': d => ejecutar(() => App.incidencias.resolver(d.id), 'Marcada como resuelta'),
    'reabrir-incidencia': d => ejecutar(() => App.incidencias.reabrir(d.id), 'Reabierta'),
    'borrar-incidencia': async d => {
      const ok = await ui.confirmar({ titulo: '¿Borrar este registro?', ok: 'Borrar', peligro: true });
      if (ok) ejecutar(() => App.incidencias.eliminar(d.id), 'Borrado');
    },

    // Catálogo
    'nuevo-producto': () => ui.abrirHoja('producto', {}),
    'editar-producto': d => ui.abrirHoja('producto', { id: d.id }),
    'nuevo-material': () => ui.abrirHoja('material', {}),
    'editar-material': d => ui.abrirHoja('material', { id: d.id }),
    'eliminar-producto': async d => {
      const p = App.repo.get('productos', d.id);
      const ok = await ui.confirmar({ titulo: '¿Eliminar «' + (p ? p.nombre : '') + '»?', ok: 'Eliminar', peligro: true });
      if (ok) ejecutar(() => { App.catalogo.eliminarProducto(d.id); S.productoAbierto = null; }, 'Eliminado');
    },
    'ruta-anadir': () => {
      const ol = document.getElementById('editor-ruta');
      ol.insertAdjacentHTML('beforeend', App.views.filaRuta(''));
      const inputs = ol.querySelectorAll('input');
      inputs[inputs.length - 1].focus();
    },
    'ruta-quitar': (d, el) => el.closest('li').remove(),
    'ruta-subir': (d, el) => { const li = el.closest('li'); if (li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); },
    'ruta-bajar': (d, el) => { const li = el.closest('li'); if (li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); },
    'ruta-plantilla': async () => {
      const ok = await ui.confirmar({ titulo: '¿Usar la plantilla habitual?', texto: 'Sustituye las etapas escritas por las 12 etapas estándar.', ok: 'Sustituir' });
      if (ok) document.getElementById('editor-ruta').innerHTML = App.config.DEFAULT_ROUTE.map(App.views.filaRuta).join('');
    },
    'receta-anadir': () => {
      const mats = App.catalogo.materiales();
      document.getElementById('editor-receta').insertAdjacentHTML('beforeend', App.views.filaReceta({ materialId: mats[0] ? mats[0].id : '', cantidad: '' }));
    },
    'receta-quitar': (d, el) => el.closest('li').remove(),

    // Clientes
    'nuevo-cliente': () => ui.abrirHoja('cliente', {}),
    'editar-cliente': d => ui.abrirHoja('cliente', { id: d.id }),
    'eliminar-cliente': async d => {
      const ok = await ui.confirmar({ titulo: '¿Eliminar este cliente?', ok: 'Eliminar', peligro: true });
      if (ok) ejecutar(() => App.catalogo.eliminarCliente(d.id), 'Cliente eliminado');
    },

    // Datos
    'exportar': () => {
      if (!App.auth.can('datos.importar')) return;
      const blob = new Blob([JSON.stringify(App.repo.exportar(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'produccion-' + App.util.todayISO() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    'cargar-demo': async () => {
      if (!App.repo.permiteSustituirTodo()) return;
      const vacia = App.repo.estaVacia();
      const ok = vacia || await ui.confirmar({ titulo: '¿Cargar datos de ejemplo?', texto: 'Sustituyen a todos los datos actuales de este dispositivo.', ok: 'Cargar ejemplo', peligro: true });
      if (ok) { App.repo.replaceAll(App.demo()); ui.cerrarHoja(); S.pedidoAbierto = null; pintar(); ui.toast('Datos de ejemplo cargados', 'ok'); }
    },
    'borrar-todo': async () => {
      if (!App.repo.permiteSustituirTodo()) return;
      const ok = await ui.confirmar({ titulo: '¿Borrar todos los datos?', texto: 'Se eliminan pedidos, clientes, catálogo, tiempos e incidencias de este dispositivo. Descarga antes una copia si la necesitas.', ok: 'Borrar todo', peligro: true });
      if (ok) { App.repo.replaceAll(null); ui.cerrarHoja(); pintar(); ui.toast('Datos borrados', 'ok'); }
    }
  };

  /* ------------------------------ Formularios ------------------------------ */

  function datos(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v : ''; });
    return o;
  }

  const FORMULARIOS = {
    'acceso': async (form) => {
      const d = datos(form);
      const aviso = form.querySelector('.acceso-error');
      const boton = form.querySelector('button[type="submit"]');
      aviso.textContent = ''; boton.disabled = true; boton.textContent = 'Entrando…';
      try {
        await App.auth.loginEmail(d.email, d.password);
        await cargarDatos();
      } catch (e) {
        boton.disabled = false; boton.textContent = 'Entrar';
        aviso.textContent = e.message || String(e);
        return;
      }
      S.pestana = 'panel';
      pintar();
    },
    'pedido': async (form) => {
      const d = datos(form);
      const id = form.dataset.id;
      if (!id) {
        const faltan = App.pedidos.faltantesAlReservar(d.productoId, parseNum(d.cantidad) || 0);
        if (faltan.length) {
          const ok = await ui.confirmar({ titulo: 'Material insuficiente', texto: 'Faltaría: ' + faltan.join(', ') + '. ¿Reservar igualmente?', ok: 'Crear pedido' });
          if (!ok) return;
        }
      }
      const r = ejecutar(() => id ? App.pedidos.editar(id, d) : App.pedidos.crear(d), id ? 'Pedido actualizado' : 'Pedido creado');
      if (r) { ui.cerrarHoja(); S.pedidoAbierto = r.id; if (!id) { S.pestana = 'pedidos'; S.filtroPedidos = 'activos'; } pintar(); scrollA('pedido-' + r.id); }
    },
    'tiempo-manual': (form) => {
      const d = datos(form);
      d.pedidoId = form.dataset.pedido; d.etapaIdx = form.dataset.idx;
      const r = ejecutar(() => App.tiempos.registrarManual(d), r => 'Añadido: ' + App.util.formatDuracion(r.minutos));
      // La hoja se ha vuelto a pintar: vaciar el formulario nuevo, no el viejo.
      if (r) { const f = document.querySelector('form[data-form="tiempo-manual"]'); if (f) f.reset(); }
    },
    'incidencia': (form) => {
      const r = ejecutar(() => App.incidencias.crear(datos(form)), x => x.tipo === 'nota' ? 'Nota guardada' : 'Incidencia registrada');
      if (r) { ui.cerrarHoja(); pintar(); }
    },
    'producto': (form) => {
      const fd = new FormData(form);
      const d = datos(form);
      d.ruta = fd.getAll('ruta');
      const mats = fd.getAll('recetaMaterial'), cants = fd.getAll('recetaCantidad');
      d.receta = mats.map((m, i) => ({ materialId: m, cantidad: cants[i] }));
      const r = ejecutar(() => App.catalogo.guardarProducto(d, form.dataset.id || null), 'Producto guardado');
      if (r) { ui.cerrarHoja(); S.vistaCatalogo = 'productos'; S.productoAbierto = r.id; pintar(); }
    },
    'material': (form) => {
      const r = ejecutar(() => App.catalogo.guardarMaterial(datos(form), form.dataset.id || null), 'Material guardado');
      if (r) { ui.cerrarHoja(); S.vistaCatalogo = 'materiales'; S.productoAbierto = r.id; pintar(); }
    },
    'ajuste-stock': (form) => {
      const d = datos(form);
      ejecutar(() => App.catalogo.ajustarStock(form.dataset.id, d.tipo, d.cantidad, d.nota), 'Stock actualizado');    },
    'cliente': (form) => {
      const r = ejecutar(() => App.catalogo.guardarCliente(datos(form), form.dataset.id || null), 'Cliente guardado');
      if (r) { ui.cerrarHoja(); pintar(); }
    }
  };

  /* ------------------------ Cambios y tecleo en campos --------------------- */

  const CAMBIOS = {
    'vista-ruta': (el) => {
      const ruta = App.catalogo.rutaDe(App.repo.get('productos', el.value));
      const t = document.getElementById('pf-ruta');
      if (t) t.textContent = 'Ruta de ' + ruta.length + ' etapas: ' + ruta.join(' → ');
    },
    'pedido-incidencia': (el) => {
      const sel = document.getElementById('inc-etapa');
      const p = App.repo.get('pedidos', el.value);
      sel.innerHTML = App.views.opcionesEtapa(el.value, p ? App.pedidos.estado(p).actualIdx : '');
      sel.disabled = !el.value;
    },
    'tipo-incidencia': (el) => {
      const g = document.getElementById('campo-gravedad');
      if (g) g.hidden = el.value === 'nota';
    },
    'asignar-etapa': (el) => ejecutar(() => App.pedidos.asignarEtapa(el.dataset.id, Number(el.dataset.idx), el.value),
      () => el.value ? 'Asignada a ' + App.auth.nombreDe(el.value) : 'Sin asignar'),
    'importar': (el) => {
      const f = el.files && el.files[0];
      if (!f) return;
      const lector = new FileReader();
      lector.onload = async () => {
        let json;
        try { json = JSON.parse(lector.result); } catch (e) { ui.toast('El archivo no es un JSON válido.', 'error'); return; }
        if (!json || (!Array.isArray(json.pedidos) && !Array.isArray(json.clientes) && !Array.isArray(json.productos))) {
          ui.toast('El archivo no parece una copia de esta app.', 'error'); return;
        }
        const n = (json.pedidos || []).length;
        const sustituye = App.repo.permiteSustituirTodo();
        const ok = await ui.confirmar({
          titulo: '¿Importar esta copia?',
          texto: 'Contiene ' + n + ' pedidos. ' + (sustituye ? 'Sustituye a todos los datos actuales de este dispositivo.' : 'Se añaden al servidor; lo que ya exista con el mismo identificador se actualiza. No se borra nada.'),
          ok: 'Importar', peligro: sustituye
        });
        if (!ok) return;
        try {
          S.cargando = 'Importando la copia…'; ui.cerrarHoja(); pintar();
          const r = await App.repo.importar(json);
          S.cargando = null; pintar();
          ui.toast('Copia importada' + (r && r.omitidos ? ' (' + r.omitidos + ' registros de usuarios desconocidos omitidos)' : ''), 'ok');
        } catch (e) {
          S.cargando = null; pintar();
          ui.toast('No se ha podido importar: ' + e.message, 'error');
        }
      };
      lector.readAsText(f);
      el.value = '';
    }
  };

  const ENTRADAS = {
    'buscar-pedidos': (el) => { S.busquedaPedidos = el.value; document.getElementById('lista-pedidos').innerHTML = App.views.pedidosLista(); },
    'buscar-clientes': (el) => { S.busquedaClientes = el.value; document.getElementById('lista-clientes').innerHTML = App.views.clientesLista(); }
  };

  /* ------------------------------ Delegación ------------------------------- */

  function escuchar() {
    document.addEventListener('click', e => {
      const t = e.target;
      if (!t || t === document.documentElement || t === document.body) return;
      const el = t.closest('[data-action]');
      if (!el) return;
      const fn = ACCIONES[el.dataset.action];
      if (!fn) return;
      if (el.tagName === 'A') e.preventDefault();
      fn(el.dataset, el, e);
    });
    document.addEventListener('submit', e => {
      const form = e.target.closest('form[data-form]');
      if (!form) return;
      e.preventDefault();
      const fn = FORMULARIOS[form.dataset.form];
      if (fn) fn(form);
    });
    document.addEventListener('change', e => {
      const el = e.target.closest('[data-change]');
      if (el && CAMBIOS[el.dataset.change]) CAMBIOS[el.dataset.change](el);
    });
    document.addEventListener('input', e => {
      const el = e.target.closest('[data-input]');
      if (el && ENTRADAS[el.dataset.input]) ENTRADAS[el.dataset.input](el);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('#dialog-root .dialogo')) ui.cerrarDialogo(false);
      else if (ui.hoja()) ui.cerrarHoja();
    });
    // Al volver a la app (iPhone la congela en segundo plano): refrescar relojes y datos.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !App.auth.current()) return;
      pintar();
      recargar(false);
    });
  }

  /* -------------------------------- Arranque ------------------------------- */

  /** Lee los datos del adaptador activo (tras iniciar sesión en modo servidor). */
  async function cargarDatos() {
    const adapter = App.adapters[App.config.BACKEND] || App.adapters.local;
    S.cargando = 'Cargando datos del taller…'; pintar();
    try {
      await App.repo.init(adapter);
      if (App.config.AUTO_DEMO && App.repo.estaVacia() && App.repo.permiteSustituirTodo()) App.repo.replaceAll(App.demo());
    } finally {
      S.cargando = null;
    }
  }

  /**
   * Trae los cambios que han hecho los demás (solo modo servidor).
   * No interrumpe: si hay un formulario abierto o cambios guardándose, espera.
   */
  let recargando = false;
  async function recargar(avisar) {
    if (!App.auth.modoServidor() || !App.auth.current() || recargando) return;
    if (!avisar && ui.hoja() && App.sheets[ui.hoja().nombre] && App.sheets[ui.hoja().nombre].estatica) return;
    recargando = true;
    try {
      const hecho = await App.repo.recargar();
      if (hecho) { pintar(); if (avisar) ui.toast('Datos actualizados', 'ok'); }
    } catch (e) {
      if (avisar) ui.toast(e.message || 'No se han podido traer los datos.', 'error');
    } finally { recargando = false; }
  }

  async function iniciar() {
    App.repo.onError(err => { S.errorGuardado = 'No se ha podido guardar el último cambio: ' + (err && err.message ? err.message : err) + ' Pulsa «Recargar» en Ajustes para ver el estado real.'; pintar(); });
    escuchar();
    S.cargando = 'Abriendo…'; pintar();
    try {
      if (App.auth.modoServidor()) {
        const u = await App.auth.restaurar();
        if (u) await cargarDatos();
      } else {
        await cargarDatos();
        await App.auth.restaurar();
      }
    } catch (e) {
      console.error(e);
      S.errorGuardado = 'No se han podido cargar los datos: ' + (e.message || e);
    }
    S.cargando = null;
    pintar();
    arrancarReloj();
    if (App.auth.modoServidor()) {
      setInterval(() => { if (document.visibilityState === 'visible') recargar(false); }, App.config.RECARGA_SEGUNDOS * 1000);
    }

    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
    }
  }

  App.app = { iniciar, pintar, tic, recargar, ACCIONES, FORMULARIOS, CAMBIOS, ENTRADAS };

  if (!window.__NO_AUTOSTART__) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
  }
})(window.App = window.App || {});
