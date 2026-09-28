# Control de producción — MVP

App web instalable (PWA) para seguir pedidos, tiempos e incidencias del taller.
Pensada primero para iPhone (Safari o instalada en la pantalla de inicio) y
también para escritorio. Sin compilador ni `npm run build`: se publica
subiendo los archivos a GitHub Pages.

Versión: `0.2.0 · 28/09/2026` (visible en Ajustes).

Datos compartidos en **Supabase** (proyecto `elhwoubtuptcfbetvgpd`), con inicio de sesión por email y contraseña. Para probar sin servidor: añade `?modo=local` a la dirección.

---

## 1. Arquitectura y decisiones de diseño

### Capas

```
 DOM (clics, formularios)
   │  data-action / data-form / data-change / data-input
   ▼
 js/app.js ............ Controlador: estado de pantalla, eventos, pintado
   │
   ├─► js/ui/ .......... Vistas: funciones puras datos → HTML (sin lógica de negocio)
   │
   ▼
 js/domain/ ........... Reglas de negocio: validan y COMPRUEBAN PERMISOS
   │                    (pedidos, catálogo, tiempos, incidencias)
   ▼
 js/auth.js ........... Sesión y permisos (RBAC): can(), exigir()
 js/data/repo.js ...... Repositorio: única puerta a los datos (copia en memoria)
   │
   ▼
 js/data/*-adapter.js . Persistencia intercambiable: Supabase (compartido) / local (pruebas)
```

| Decisión | Por qué |
|---|---|
| **Varios archivos `.js` clásicos** que se registran en `window.App`, en lugar de módulos ES o un framework | Funciona abriendo `index.html` con doble clic (los módulos ES no cargan desde `file://`), en GitHub Pages sin compilar, y se puede probar con jsdom. Cada archivo tiene una sola responsabilidad. |
| **Separación estricta vista / negocio / datos** | Las vistas no escriben datos; el dominio no toca el DOM; solo el repositorio habla con el almacenamiento. Añadir una pantalla o cambiar de base de datos no obliga a tocar las otras capas. |
| **Permisos en dos sitios**: interfaz y dominio (y en Fase 3, también en la base de datos) | La interfaz oculta lo que no toca; el dominio lo rechaza aunque alguien se salte la interfaz; la base de datos (RLS) es la garantía final. |
| **Adaptador de datos con contrato** `load()` / `persist(op, colección, registro, db)` | El adaptador local guarda todo en `localStorage`; el de Supabase traduce cada operación a una llamada a su tabla. Cambiar de uno a otro es una línea en `config.js`. |
| **Escrituras optimistas** | La pantalla responde al instante; si el guardado falla aparece un aviso rojo. |
| **Temporizador guardado como hora de inicio**, no como contador | iPhone congela las apps en segundo plano. Al volver, el tiempo sigue siendo correcto aunque el móvil se haya bloqueado. Un único temporizador en marcha por persona. |
| **Hojas inferiores** para formularios y **diálogo propio** de confirmación | Patrón nativo en iPhone y alcanzable con el pulgar. El diálogo sustituye a `confirm()`, que falla en algunas vistas (y no se puede probar automáticamente). |
| **Formularios que no se repintan mientras están abiertos** | Si un guardado falla o la app vuelve de segundo plano, no se pierde lo tecleado. |
| **Identificadores UUID** | Los registros creados en local se podrán subir a Supabase sin renumerar. |
| **Importa el formato anterior** | La copia de la versión de un solo archivo (clientes, productos, pedidos) se convierte sola al importarla. |

### Diseño mobile-first (iOS Safari)

- Barra de pestañas **abajo** en el móvil (al alcance del pulgar) y **arriba** en escritorio (≥ 900 px).
- Zonas táctiles de **44 px** como mínimo; botones grandes para iniciar y parar el temporizador.
- Campos a **16 px**: por debajo, Safari hace zoom al enfocar.
- Teclado adecuado a cada campo: `inputmode="decimal"` (horas, cantidades), `numeric`, `tel`, `email`; `enterkeyhint` en búsquedas.
- Coma o punto decimal indistintamente (`1,5` h).
- Áreas seguras del iPhone (notch y barra de inicio) con `env(safe-area-inset-*)`.
- Tema claro y oscuro automáticos según el sistema.
- La barra del temporizador en marcha se ve en todas las pantallas.

---

## 2. Estructura de archivos

```
index.html                  Esqueleto de la página y orden de carga de scripts
manifest.json  sw.js         App instalable y funcionamiento sin conexión
icons/                      Iconos de la pantalla de inicio
css/styles.css              Estilos (tokens de color al principio)
js/
  config.js                 Versión, usuarios, roles y permisos, ruta por defecto
  util.js                   Fechas, formatos, números con coma, escape de HTML
  auth.js                   Sesión y permisos
  demo.js                   Datos de ejemplo
  data/
    repo.js                 Repositorio + conversión de copias antiguas
    local-adapter.js        Guardado en este dispositivo (modo de pruebas)
    supabase-adapter.js     Datos compartidos en Supabase (modo normal)
  domain/
    catalogo.js             Clientes, productos, materiales, stock
    pedidos.js              Pedidos, etapas, asignaciones, reservas y despacho
    tiempos.js              Temporizador e imputación manual
    incidencias.js          Incidencias y notas de campo
  ui/
    components.js           Iconos, chips, hoja inferior, diálogo, avisos
    views/                  panel, pedidos, incidencias, catalogo, clientes, sesion
  app.js                    Arranque, estado de pantalla y eventos
supabase/                   SQL: 001 tablas, 002 permisos, 003 perfiles de usuario
tests/pruebas.js            Batería de pruebas con clics reales
```

---

## 3. Perfiles y permisos

| Rol | Quién |
|---|---|
| **Editor** | Eduardo Díaz, Sergio Díaz |
| **Operario** | usuario1, usuario2, usuario3 |

El operario ve la **orden de fabricación** (número OF, producto, cantidad, fechas,
notas, ruta, materiales y avance), **nunca el cliente ni los precios**.

| Acción | Editor | Operario |
|---|:---:|:---:|
| Ver órdenes de fabricación y su avance | ✓ | ✓ |
| Ver clientes (nombre y contacto) | ✓ | — |
| Ver precios, costes, catálogo y stock | ✓ | — |
| Crear, editar y eliminar pedidos | ✓ | — |
| Marcar etapas, asignarlas a personas, despachar materiales | ✓ | — |
| Productos (con ruta y receta), materiales, ajustes de stock, clientes | ✓ | — |
| Imputar tiempo (temporizador o manual) | ✓ (también a nombre de otro) | ✓ solo a su nombre |
| Borrar registros de tiempo | ✓ todos | ✓ solo los suyos |
| Reportar incidencias y notas de campo | ✓ | ✓ |
| Resolver / reabrir incidencias | ✓ | — |
| Borrar incidencias | ✓ todas | ✓ solo las suyas |
| Copias de seguridad | ✓ | — |

Se aplica en tres sitios: la interfaz (el operario solo tiene las pestañas Panel,
Pedidos e Incidencias), la lógica de negocio y la base de datos. En Supabase el
operario **no puede leer** las tablas `clientes`, `precios` ni `movimientos_stock`
aunque manipule la app; por eso el precio vive en una tabla aparte.

Para cambiar permisos: `ROLES` en `js/config.js` **y** `supabase/002_permisos.sql`.

---

## 4. Cómo alternar entre perfil Editor y Operario

**Con datos compartidos (normal):** cada persona entra con su email y contraseña.
Para ver la app como operario, cierra sesión (avatar → **Cerrar sesión**) y entra
con la cuenta de un operario. Truco: abre la app en una ventana privada del
navegador con otra cuenta para tener las dos vistas a la vez.

**Modo de pruebas (sin servidor ni contraseña):** añade `?modo=local` a la dirección.
- Avatar → **Cambiar de usuario** → elige a cualquiera de los 5.
- O entra directo: `?modo=local&como=eduardo`, `?modo=local&como=usuario1`…
- Como editor, **Ajustes → Cargar datos de ejemplo**. `usuario1` y `usuario2` ya
  tienen etapas asignadas, así que verán «Mi trabajo» en el Panel.

Los datos del modo de pruebas se quedan en ese navegador y no tocan el servidor.

---

## 5. Probar en local

- **Rápido:** doble clic en `index.html` y añade `?modo=local` a la dirección.
- **Como en producción** (con service worker): `python3 -m http.server 8000` y abrir
  `http://localhost:8000`.
- **Pruebas automáticas** (84 comprobaciones con clics reales, por perfil, en modo local y con un Supabase simulado):

  ```
  npm install jsdom
  node tests/pruebas.js
  ```

  Pásalas antes de cada publicación. No comprueban el aspecto visual: eso se mira
  con el móvil en la mano.

---

## 6. Publicar en GitHub Pages

1. Subir todo el contenido de esta carpeta a la raíz del repositorio (menos `tests/` si no quieres; no hace daño).
2. Settings → Pages → Deploy from a branch → `main` / `(root)`.
3. En cada versión nueva: subir `VERSION` en `js/config.js` **y** `CACHE` en `sw.js`.
4. En el iPhone, abrir la URL en Safari → Compartir → **Añadir a pantalla de inicio**.

---

## 7. Cómo añadir una funcionalidad

Ejemplo: una pestaña «Entregas».

1. Si hay datos nuevos: añadir la colección a `COLECCIONES` en `js/data/repo.js`.
2. Reglas de negocio en `js/domain/entregas.js` (validar + `App.auth.exigir('entrega.crear')`).
3. Permiso en `ROLES` de `js/config.js`.
4. Vista en `js/ui/views/entregas.js` → `App.views.entregas = () => '…html…'`.
5. Pestaña en `PESTANAS` de `js/app.js` y sus acciones en `ACCIONES` / `FORMULARIOS`.
6. Script en `index.html` y en la lista de `sw.js`.
7. Pruebas en `tests/pruebas.js`.
8. En Supabase: tabla + políticas nuevas en un `004_….sql`, y la tabla en `TABLAS` y `COLUMNAS` de `supabase-adapter.js`.

---

## 8. Puesta en marcha con Supabase

1. **SQL Editor → New query:** pegar y ejecutar `supabase/001_esquema.sql`; después, en
   otra consulta, `supabase/002_permisos.sql`.
2. **Authentication → Sign In / Providers:** Email activado, «Confirm email» desactivado,
   «Allow new users to sign up» desactivado.
3. **Authentication → Users → Add user:** crear los 5 usuarios con email y contraseña,
   marcando «Auto Confirm User».
4. Editar los emails de `supabase/003_usuarios.sql` y ejecutarlo. Comprobar con la
   consulta del final de ese archivo que salen los 5 con su rol.
5. Subir la carpeta a GitHub y activar Pages (sección 6). Entrar con Eduardo o Sergio.
6. Traer los datos de la versión anterior: **Ajustes → Subir copia al servidor** con el
   JSON exportado. Añade y actualiza por identificador; no borra nada.

La app vuelve a leer del servidor al volver a primer plano, cada 60 segundos mientras
está abierta y con **Ajustes → Recargar datos ahora**. No recarga mientras hay un
formulario abierto, para no perder lo que se está escribiendo.

El SQL está probado contra Postgres 16 simulando cada perfil (40 comprobaciones).

---

## 9. Límites conocidos de este MVP

- Guardar necesita conexión. Sin cobertura la app abre, pero los cambios fallan
  (sale un aviso rojo). Una cola para guardar al recuperar señal queda para después.
- Los cambios de los demás llegan al recargar (máximo 60 s), no al instante.
- Despachar materiales hace varias escrituras seguidas desde la app. La base de datos
  ya tiene `despachar_materiales()` para hacerlo de una vez; conectarla es el siguiente
  paso.
- El operario puede leer el stock de los materiales a nivel de base de datos (la app
  no se lo enseña). Si hace falta ocultarlo también, se mueve a otra tabla como el precio.
- La ruta de un pedido se copia del producto al crearlo; editar la ruta de un pedido
  concreto queda para una iteración posterior.
- Las copias de seguridad no se pueden descargar desde la vista previa en claude.ai
  (sí desde GitHub Pages o en local). La vista previa funciona siempre en modo local.
