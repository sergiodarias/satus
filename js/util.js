/* ==========================================================================
   util.js — Utilidades puras (sin estado, sin DOM)
   ========================================================================== */
(function (App) {
  'use strict';

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** Error de negocio: su mensaje se enseña tal cual al usuario. */
  class DomainError extends Error {
    constructor(msg) { super(msg); this.name = 'DomainError'; }
  }

  /** Identificador único. UUID cuando el navegador lo permite (compatible con Supabase). */
  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** Fecha local AAAA-MM-DD (no UTC: evita saltos de día cerca de medianoche). */
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowISO() { return new Date().toISOString(); }

  function formatDate(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function formatDateShort(iso) {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1];
  }

  function formatTime(isoDateTime) {
    if (!isoDateTime) return '';
    const d = new Date(isoDateTime);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** 95 → "1 h 35 min" */
  function formatDuracion(min) {
    min = Math.round(Number(min) || 0);
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  /** Segundos → "01:02:03" (cronómetro). */
  function formatElapsed(seg) {
    seg = Math.max(0, Math.floor(seg));
    return pad(Math.floor(seg / 3600)) + ':' + pad(Math.floor((seg % 3600) / 60)) + ':' + pad(seg % 60);
  }

  function formatNumber(n) {
    n = parseFloat(n);
    if (isNaN(n)) return '0';
    return (Math.round(n * 100) / 100).toLocaleString('es-ES');
  }

  /** Acepta coma o punto decimal: "1,5" → 1.5. Devuelve NaN si no es número. */
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return NaN;
    return Number(String(v).trim().replace(',', '.'));
  }

  function diasEntre(iso1, iso2) {
    if (!iso1 || !iso2) return null;
    const d1 = new Date(String(iso1).slice(0, 10) + 'T00:00:00');
    const d2 = new Date(String(iso2).slice(0, 10) + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
  }

  /** Escapa texto para meterlo en HTML (contenido y atributos). */
  function esc(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function iniciales(nombre) {
    return String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  App.util = {
    DomainError, uid, todayISO, nowISO, formatDate, formatDateShort, formatTime,
    formatDuracion, formatElapsed, formatNumber, parseNum, diasEntre, esc, plural, iniciales, clone
  };
})(window.App = window.App || {});
