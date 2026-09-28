/* ==========================================================================
   domain/tiempos.js — Imputación de tiempos por etapa
   --------------------------------------------------------------------------
   Registro: { id, pedidoId, etapaIdx, etapaNombre, usuarioId, modo,
               inicio, fin, minutos, fecha, nota }
     modo 'timer'  → temporizador. En marcha mientras fin === null.
     modo 'manual' → minutos tecleados a mano.

   El temporizador guarda la hora de inicio, no un contador: si el móvil
   cierra la app o se apaga, al volver sigue marcando el tiempo correcto.
   Cada usuario solo puede tener un temporizador en marcha.
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, parseNum, todayISO, nowISO } = App.util;
  const repo = () => App.repo;
  const auth = () => App.auth;

  /* ------------------------------- Lecturas ------------------------------- */

  function enMarcha(usuarioId) {
    return repo().all('tiempos').find(t => t.modo === 'timer' && !t.fin && t.usuarioId === usuarioId) || null;
  }

  /** Minutos de un registro; si está en marcha, cuenta hasta ahora. */
  function minutosDe(t, ahora) {
    if (t.modo === 'timer' && !t.fin) return Math.max(0, ((ahora || Date.now()) - Date.parse(t.inicio)) / 60000);
    return Number(t.minutos) || 0;
  }

  function sumar(lista) { return lista.reduce((s, t) => s + minutosDe(t), 0); }

  function dePedido(pedidoId) { return repo().where('tiempos', t => t.pedidoId === pedidoId); }

  function deEtapa(pedidoId, etapaIdx) {
    return repo().where('tiempos', t => t.pedidoId === pedidoId && t.etapaIdx === etapaIdx)
      .sort((a, b) => String(b.inicio || b.fecha).localeCompare(String(a.inicio || a.fecha)));
  }

  /** { etapaIdx: minutos } para un pedido. */
  function porEtapa(pedidoId) {
    const out = {};
    dePedido(pedidoId).forEach(t => { out[t.etapaIdx] = (out[t.etapaIdx] || 0) + minutosDe(t); });
    return out;
  }

  function delUsuarioEnFecha(usuarioId, fechaISO) {
    return repo().where('tiempos', t => t.usuarioId === usuarioId && t.fecha === fechaISO);
  }

  /** Minutos imputados en los últimos `dias` días (incluido hoy). */
  function ultimosDias(dias) {
    const desde = new Date(); desde.setDate(desde.getDate() - (dias - 1));
    const desdeISO = todayISO(desde);
    return sumar(repo().where('tiempos', t => t.fecha >= desdeISO));
  }

  /* ------------------------------ Escrituras ------------------------------ */

  function validarEtapa(pedidoId, etapaIdx) {
    const p = repo().get('pedidos', pedidoId);
    if (!p) throw new DomainError('El pedido ya no existe.');
    const e = p.etapas[etapaIdx];
    if (!e) throw new DomainError('Etapa no encontrada.');
    return { pedido: p, etapa: e };
  }

  /** Para el temporizador del usuario actual (si lo hay). Devuelve el registro cerrado. */
  function detener() {
    const u = auth().current();
    const t = u && enMarcha(u.id);
    if (!t) return null;
    auth().exigir('tiempo.registrar');
    const fin = new Date();
    const minutos = Math.max(1, Math.round((fin - Date.parse(t.inicio)) / 60000));
    return repo().update('tiempos', t.id, { fin: fin.toISOString(), minutos });
  }

  /**
   * Arranca un temporizador en una etapa. Si ya había otro en marcha,
   * lo para y lo guarda. Devuelve { nuevo, detenido }.
   */
  function iniciar(pedidoId, etapaIdx) {
    auth().exigir('tiempo.registrar');
    const { etapa } = validarEtapa(pedidoId, etapaIdx);
    const u = auth().current();
    const previo = enMarcha(u.id);
    if (previo && previo.pedidoId === pedidoId && previo.etapaIdx === etapaIdx) {
      throw new DomainError('Ya tienes el temporizador en marcha en esta etapa.');
    }
    const detenido = previo ? detener() : null;
    const nuevo = repo().insert('tiempos', {
      pedidoId, etapaIdx, etapaNombre: etapa.nombre, usuarioId: u.id, modo: 'timer',
      inicio: nowISO(), fin: null, minutos: 0, fecha: todayISO(), nota: ''
    });
    return { nuevo, detenido };
  }

  /** Imputación manual. datos: { pedidoId, etapaIdx, horas, minutos, fecha, nota, usuarioId? } */
  function registrarManual(datos) {
    auth().exigir('tiempo.registrar');
    const etapaIdx = Number(datos.etapaIdx);
    const { etapa } = validarEtapa(datos.pedidoId, etapaIdx);
    const h = datos.horas === '' || datos.horas === undefined ? 0 : parseNum(datos.horas);
    const m = datos.minutos === '' || datos.minutos === undefined ? 0 : parseNum(datos.minutos);
    if (isNaN(h) || isNaN(m) || h < 0 || m < 0) throw new DomainError('Horas y minutos tienen que ser números positivos.');
    const total = Math.round(h * 60 + m);
    if (total <= 0) throw new DomainError('Indica cuánto tiempo has dedicado.');
    if (total > App.config.MAX_MINUTOS_MANUAL) throw new DomainError('Una sola imputación no puede pasar de ' + (App.config.MAX_MINUTOS_MANUAL / 60) + ' horas. Divídela en varias.');
    const fecha = datos.fecha || todayISO();
    if (fecha > todayISO()) throw new DomainError('No se puede imputar tiempo en una fecha futura.');

    let usuarioId = auth().current().id;
    if (datos.usuarioId && datos.usuarioId !== usuarioId) {
      auth().exigir('tiempo.registrarOtros');
      if (!auth().porId(datos.usuarioId)) throw new DomainError('Usuario desconocido.');
      usuarioId = datos.usuarioId;
    }
    return repo().insert('tiempos', {
      pedidoId: datos.pedidoId, etapaIdx, etapaNombre: etapa.nombre, usuarioId, modo: 'manual',
      inicio: null, fin: null, minutos: total, fecha, nota: (datos.nota || '').trim()
    });
  }

  function eliminar(id) {
    const t = repo().get('tiempos', id);
    if (!t) return;
    auth().exigir('tiempo.borrar', t);
    repo().remove('tiempos', id);
  }

  App.tiempos = {
    enMarcha, minutosDe, sumar, dePedido, deEtapa, porEtapa, delUsuarioEnFecha, ultimosDias,
    iniciar, detener, registrarManual, eliminar
  };
})(window.App = window.App || {});
