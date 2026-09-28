-- ============================================================================
-- 001_esquema.sql — Tablas de la app de producción (Supabase / Postgres)
-- ----------------------------------------------------------------------------
-- Ejecutar en Supabase → SQL Editor, en orden: 001, 002, 003.
-- Nombres en snake_case; la app los traduce a camelCase (supabase-adapter.js).
-- Los id son texto con un UUID por defecto: así se pueden importar tal cual
-- los id de la versión local de la app.
-- ============================================================================

create extension if not exists pgcrypto;

-- Perfil de cada usuario: nombre visible y rol. El id es el de auth.users.
create table public.perfiles (
  id      uuid primary key references auth.users (id) on delete cascade,
  nombre  text not null,
  rol     text not null check (rol in ('editor', 'operario')),
  creado  timestamptz not null default now()
);

create table public.clientes (
  id         text primary key default gen_random_uuid()::text,
  nombre     text not null check (length(trim(nombre)) > 0),
  contacto   text not null default '',
  telefono   text not null default '',
  email      text not null default '',
  direccion  text not null default '',
  notas      text not null default '',
  creado     timestamptz not null default now()
);

-- Productos fabricados y materiales comparten tabla (columna categoria).
create table public.productos (
  id            text primary key default gen_random_uuid()::text,
  categoria     text not null check (categoria in ('fabricado', 'material')),
  nombre        text not null check (length(trim(nombre)) > 0),
  notas         text not null default '',
  -- Solo fabricados
  tipo          text not null default '',
  material      text not null default '',
  dimensiones   text not null default '',
  ruta          jsonb not null default '[]'::jsonb,   -- ["Pedido recibido", …]
  receta        jsonb not null default '[]'::jsonb,   -- [{"materialId": "…", "cantidad": 2}]
  -- Solo materiales
  unidad        text not null default 'ud',
  stock         numeric not null default 0,
  stock_minimo  numeric,
  creado        timestamptz not null default now()
);

-- Precio de venta (fabricados) o coste por unidad (materiales).
-- Tabla aparte para que los operarios no puedan leerlo (ver 002_permisos.sql).
create table public.precios (
  producto_id  text primary key references public.productos (id) on delete cascade,
  precio       numeric
);

create table public.pedidos (
  id                      text primary key default gen_random_uuid()::text,
  numero                  integer not null unique check (numero > 0),   -- orden de fabricación OF-0001
  cliente_id              text not null references public.clientes (id) on delete restrict,
  producto_id             text not null references public.productos (id) on delete restrict,
  cantidad                integer not null check (cantidad > 0),
  fecha_pedido            date not null default current_date,
  fecha_entrega           date,
  notas                   text not null default '',
  -- [{"nombre": "…", "completada": true, "fecha": "2026-09-28", "asignadoA": "<uuid>|null"}]
  etapas                  jsonb not null,
  -- Materiales reservados: [{"materialId": "…", "cantidad": 4}]
  consumo                 jsonb not null default '[]'::jsonb,
  materiales_despachados  boolean not null default false,
  fecha_despacho          date,
  creado                  timestamptz not null default now()
);
create index pedidos_cliente_idx on public.pedidos (cliente_id);

create table public.movimientos_stock (
  id           text primary key default gen_random_uuid()::text,
  material_id  text not null references public.productos (id) on delete cascade,
  fecha        date not null default current_date,
  tipo         text not null check (tipo in ('entrada', 'salida')),
  cantidad     numeric not null check (cantidad > 0),
  nota         text not null default '',
  auto         boolean not null default false,
  pedido_id    text references public.pedidos (id) on delete set null,
  usuario_id   uuid references public.perfiles (id) on delete set null
);
create index movimientos_material_idx on public.movimientos_stock (material_id, fecha desc);

create table public.tiempos (
  id            text primary key default gen_random_uuid()::text,
  pedido_id     text not null references public.pedidos (id) on delete cascade,
  etapa_idx     integer not null check (etapa_idx >= 0),
  etapa_nombre  text not null,
  usuario_id    uuid not null references public.perfiles (id),
  modo          text not null check (modo in ('timer', 'manual')),
  inicio        timestamptz,
  fin           timestamptz,
  minutos       integer not null default 0 check (minutos >= 0),
  fecha         date not null default current_date,
  nota          text not null default '',
  check (modo = 'manual' or inicio is not null),
  check (fin is null or inicio is null or fin >= inicio)
);
create index tiempos_pedido_idx on public.tiempos (pedido_id, etapa_idx);
create index tiempos_usuario_fecha_idx on public.tiempos (usuario_id, fecha);
-- Un único temporizador en marcha por persona.
create unique index tiempos_un_temporizador_por_usuario
  on public.tiempos (usuario_id) where modo = 'timer' and fin is null;

create table public.incidencias (
  id                text primary key default gen_random_uuid()::text,
  tipo              text not null check (tipo in ('incidencia', 'nota')),
  gravedad          text check (gravedad in ('baja', 'media', 'alta')),
  texto             text not null check (length(trim(texto)) > 0),
  pedido_id         text references public.pedidos (id) on delete cascade,
  etapa_idx         integer check (etapa_idx >= 0),
  usuario_id        uuid not null references public.perfiles (id),
  creada            timestamptz not null default now(),
  resuelta          boolean not null default false,
  resuelta_por      uuid references public.perfiles (id),
  fecha_resolucion  timestamptz,
  check (tipo = 'nota' or gravedad is not null)
);
create index incidencias_pedido_idx on public.incidencias (pedido_id);
create index incidencias_abiertas_idx on public.incidencias (resuelta, creada desc);
