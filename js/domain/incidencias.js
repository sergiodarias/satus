/* ==========================================================================
   domain/incidencias.js — Incidencias y notas de campo
   --------------------------------------------------------------------------
   Registro: { id, tipo: 'incidencia'|'nota', gravedad: 'baja'|'media'|'alta',
               texto, pedidoId|null, etapaIdx|null, usuarioId, creada (ISO),
               resuelta, resueltaPor, fechaResolucion }
   Cualquier usuario puede crear. Solo los editores resuelven o reabren.
   El autor (o un editor) puede borrar.
   ========================================================================== */
(function (App) {
  'use strict';

  const { DomainError, nowISO } = App.util;
  const repo = () => App.repo;
  const auth = () => App.auth;

  const GRAVEDADES = { baja: 'Baja', media: 'Media', alta: 'Alta' };
  const TIPOS = { incidencia: 'Incidencia', nota: 'Nota de campo' };

  function ordenar(lista) {
    const peso = { alta: 0, media: 1, baja: 2 };
    return lista.slice().sort((a, b) =>
      (a.resuelta - b.resuelta) ||
      ((a.tipo === 'nota') - (b.tipo === 'nota')) ||
      ((peso[a.gravedad] ?? 3) - (peso[b.gravedad] ?? 3)) ||
      String(b.creada).localeCompare(String(a.creada)));
  }

  function todas() { return ordenar(repo().all('incidencias')); }
  function abiertas() { return todas().filter(x => x.tipo === 'incidencia' && !x.resuelta); }
  function dePedido(pedidoId) { return todas().filter(x => x.pedidoId === pedidoId); }
  function deEtapa(pedidoId, idx) { return todas().filter(x => x.pedidoId === pedidoId && x.etapaIdx === idx); }

  function crear(datos) {
    auth().exigir('incidencia.crear');
    const texto = (datos.texto || '').trim();
    if (!texto) throw new DomainError('Describe qué ha pasado.');
    const tipo = TIPOS[datos.tipo] ? datos.tipo : 'incidencia';
    let pedidoId = datos.pedidoId || null, etapaIdx = null;
    if (pedidoId) {
      const p = repo().get('pedidos', pedidoId);
      if (!p) throw new DomainError('El pedido ya no existe.');
      if (datos.etapaIdx !== '' && datos.etapaIdx !== null && datos.etapaIdx !== undefined) {
        etapaIdx = Number(datos.etapaIdx);
        if (!p.etapas[etapaIdx]) throw new DomainError('Etapa no encontrada.');
      }
    }
    return repo().insert('incidencias', {
      tipo, gravedad: tipo === 'incidencia' ? (GRAVEDADES[datos.gravedad] ? datos.gravedad : 'media') : null,
      texto, pedidoId, etapaIdx, usuarioId: auth().current().id, creada: nowISO(),
      resuelta: false, resueltaPor: null, fechaResolucion: null
    }, { alPrincipio: true });
  }

  function resolver(id) {
    auth().exigir('incidencia.resolver');
    return repo().update('incidencias', id, { resuelta: true, resueltaPor: auth().current().id, fechaResolucion: nowISO() });
  }

  function reabrir(id) {
    auth().exigir('incidencia.resolver');
    return repo().update('incidencias', id, { resuelta: false, resueltaPor: null, fechaResolucion: null });
  }

  function eliminar(id) {
    const x = repo().get('incidencias', id);
    if (!x) return;
    auth().exigir('incidencia.borrar', x);
    repo().remove('incidencias', id);
  }

  App.incidencias = { GRAVEDADES, TIPOS, todas, abiertas, dePedido, deEtapa, crear, resolver, reabrir, eliminar };
})(window.App = window.App || {});
