/* ==========================================================================
   sw.js — Service worker
   Red primero para los archivos propios (se ven los cambios al publicar),
   caché de respaldo sin conexión, y caché primero para las tipografías.
   SUBE EL NÚMERO DE CACHE EN CADA PUBLICACIÓN (y VERSION en js/config.js).
   ========================================================================== */
const CACHE = 'produccion-v2';

const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/styles.css',
  './js/config.js', './js/util.js',
  './js/data/local-adapter.js', './js/data/supabase-adapter.js', './js/data/repo.js',
  './js/auth.js',
  './js/domain/catalogo.js', './js/domain/pedidos.js', './js/domain/tiempos.js', './js/domain/incidencias.js',
  './js/demo.js',
  './js/ui/components.js',
  './js/ui/views/panel.js', './js/ui/views/pedidos.js', './js/ui/views/incidencias.js',
  './js/ui/views/catalogo.js', './js/ui/views/clientes.js', './js/ui/views/sesion.js',
  './js/app.js',
  './icons/icon-192.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Tipografías y la librería de Supabase (versión fija): caché primero.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
      return res;
    })));
    return;
  }

  // Solo archivos de este mismo sitio. Las llamadas a Supabase van directas a la red.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req).then(r => r ||
      (req.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504 }))))
  );
});
