/* ==========================================================================
   ui/views/panel.js — Panel: estado general del taller
   ========================================================================== */
(function (App) {
  'use strict';

  const { esc, formatDate, formatDuracion, diasEntre, todayISO, formatNumber, plural } = App.util;
  const ui = () => App.ui;

  function filaPedido(p, derecha, sub) {
    const t = App.pedidos.titulo(p);
    return '<button type="button" class="fila fila-boton" data-action="ir-pedido" data-id="' + esc(p.id) + '">' +
      '<span class="fila-principal"><span class="fila-titulo">' + esc(t.linea) + '</span>' +
      '<span class="fila-sub">' + sub + '</span></span>' + derecha + '</button>';
  }

  function misTareas(usuario) {
    const tareas = App.pedidos.tareasDe(usuario.id);
    const hoyMin = App.tiempos.sumar(App.tiempos.delUsuarioEnFecha(usuario.id, todayISO()));
    let html = '<section class="seccion"><div class="seccion-cabecera"><h2 class="seccion-titulo">Mi trabajo</h2>' +
      '<span class="seccion-extra">Hoy llevas ' + formatDuracion(hoyMin) + '</span></div>';
    if (!tareas.length) {
      html += '<p class="ayuda">No tienes etapas asignadas ahora mismo. Puedes imputar tiempo en cualquier pedido desde la pestaña Pedidos.</p>';
    } else {
      html += tareas.map(tk => {
        const t = App.pedidos.titulo(tk.pedido);
        const activo = App.tiempos.enMarcha(usuario.id);
        const esteEnMarcha = activo && activo.pedidoId === tk.pedido.id && activo.etapaIdx === tk.etapaIdx;
        return '<div class="tarea">' +
          '<button type="button" class="tarea-info" data-action="abrir-etapa" data-id="' + esc(tk.pedido.id) + '" data-idx="' + tk.etapaIdx + '">' +
          '<span class="fila-titulo">' + esc(tk.etapa.nombre) + '</span>' +
          '<span class="fila-sub">' + esc(t.linea) + (tk.esActual ? '' : ' · <em>aún no le toca</em>') + '</span></button>' +
          (esteEnMarcha
            ? '<button type="button" class="btn btn-parar" data-action="parar-tiempo">' + ui().icono('stop') + 'Parar</button>'
            : '<button type="button" class="btn btn-primario" data-action="iniciar-tiempo" data-id="' + esc(tk.pedido.id) + '" data-idx="' + tk.etapaIdx + '">' + ui().icono('play') + 'Iniciar</button>') +
          '</div>';
      }).join('');
    }
    return html + '</section>';
  }

  App.views = App.views || {};

  App.views.panel = function renderPanel() {
    const u = App.auth.current();
    const hoy = todayISO();
    const activos = App.pedidos.activos();
    const terminados = App.pedidos.terminados();
    const stale = App.config.STALE_DAYS;

    const conDias = activos.map(p => ({ p, est: App.pedidos.estado(p), dias: diasEntre(App.pedidos.estado(p).fechaUltimoAvance, hoy) }));
    const parados = conDias.filter(x => x.dias !== null && x.dias >= stale).length;
    const duraciones = terminados.map(p => diasEntre(p.fechaPedido, App.pedidos.estado(p).fechaFin)).filter(d => d !== null);
    const media = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null;
    const mes = hoy.slice(0, 7);
    const esteMes = terminados.filter(p => String(App.pedidos.estado(p).fechaFin || '').slice(0, 7) === mes).length;
    const abiertas = App.incidencias.abiertas().length;
    const horasSemana = App.tiempos.ultimosDias(7);

    let html = '';
    if (u.rol === 'operario') html += misTareas(u);

    html += '<div class="kpis">' +
      ui().kpi(activos.length, 'Pedidos en curso') +
      ui().kpi(esteMes, 'Terminados este mes') +
      ui().kpi(media !== null ? media + ' d' : '—', 'Tiempo medio por pedido') +
      ui().kpi(parados, 'Sin avanzar ≥ ' + stale + ' días', parados ? 'aviso' : '') +
      ui().kpi(abiertas, 'Incidencias abiertas', abiertas ? 'alerta' : '') +
      ui().kpi(formatDuracion(horasSemana), 'Imputado últimos 7 días') +
      '</div>';

    const bajos = App.auth.can('stock.ver') ? App.catalogo.materialesBajos() : [];
    if (bajos.length) {
      html += '<section class="seccion"><h2 class="seccion-titulo">Materiales con stock bajo</h2>' + bajos.map(m =>
        '<button type="button" class="fila fila-boton" data-action="ir-material" data-id="' + esc(m.id) + '"><span class="fila-principal">' +
        '<span class="fila-titulo">' + esc(m.nombre) + '</span>' +
        '<span class="fila-sub">' + (m.stockMinimo !== null && m.stockMinimo !== undefined ? 'Mínimo ' + formatNumber(m.stockMinimo) + ' ' + esc(m.unidad) : 'Sin mínimo definido') + '</span></span>' +
        ui().chip(formatNumber(App.catalogo.materialDisponible(m)) + ' ' + esc(m.unidad) + ' disp.', 'alerta') + '</button>').join('') + '</section>';
    }

    if (!App.repo.all('pedidos').length) {
      return html + ui().vacio('Todavía no hay pedidos. En cuanto se cree el primero, aquí verás el estado del taller.',
        App.auth.can('pedido.crear') ? '<button type="button" class="btn btn-primario" data-action="nuevo-pedido">' + ui().icono('plus') + 'Nuevo pedido</button>' : '');
    }

    // Cuellos de botella: pedidos activos por etapa actual.
    const porEtapa = {};
    conDias.forEach(x => { porEtapa[x.est.actualNombre] = (porEtapa[x.est.actualNombre] || 0) + 1; });
    const etapas = Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = etapas.length ? etapas[0][1] : 1;
    html += '<section class="seccion"><h2 class="seccion-titulo">Dónde están los pedidos en curso</h2>' + (etapas.length
      ? '<div class="barras">' + etapas.map(([nombre, n]) =>
        '<div class="barra"><span class="barra-etiqueta">' + esc(nombre) + '</span><span class="barra-pista"><span class="barra-relleno" style="width:' + Math.round(n / max * 100) + '%"></span></span><span class="barra-valor">' + n + '</span></div>').join('') + '</div>'
      : '<p class="ayuda">No hay pedidos en curso.</p>') + '</section>';

    conDias.sort((a, b) => (b.dias || 0) - (a.dias || 0));
    html += '<section class="seccion"><h2 class="seccion-titulo">Obra en curso</h2>' + (conDias.length ? conDias.map(x => {
      const parado = x.dias !== null && x.dias >= stale;
      const retraso = App.pedidos.retrasado(x.p);
      return filaPedido(x.p,
        '<span class="fila-chips">' + (retraso ? ui().chip('Fuera de plazo', 'alerta') : '') + ui().chip(x.dias === null ? '—' : plural(x.dias, 'día', 'días') + ' sin avanzar', parado ? 'aviso' : '') + '</span>',
        esc(x.est.actualNombre));
    }).join('') : '<p class="ayuda">No hay pedidos en curso.</p>') + '</section>';

    const recientes = terminados.sort((a, b) => String(App.pedidos.estado(b).fechaFin).localeCompare(String(App.pedidos.estado(a).fechaFin))).slice(0, 5);
    html += '<section class="seccion"><h2 class="seccion-titulo">Terminados recientemente</h2>' + (recientes.length ? recientes.map(p => {
      const est = App.pedidos.estado(p);
      const d = diasEntre(p.fechaPedido, est.fechaFin);
      return filaPedido(p, ui().chip(d !== null ? d + ' d' : '—'), 'Entregado el ' + formatDate(est.fechaFin) + ' · ' + formatDuracion(App.tiempos.sumar(App.tiempos.dePedido(p.id))) + ' imputados');
    }).join('') : '<p class="ayuda">Todavía no hay pedidos terminados.</p>') + '</section>';

    return html;
  };
})(window.App = window.App || {});
