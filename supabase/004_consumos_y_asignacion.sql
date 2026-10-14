-- ============================================================================
-- 004_consumos_y_asignacion.sql — Versión 0.4.0 de la app
-- ----------------------------------------------------------------------------
-- Ejecutar una vez, después de 001, 002 y 003. Todo o nada (una transacción).
--
-- 1. Ruta base nueva (16 etapas) en los productos que aún tenían la antigua.
--    Los pedidos ya creados conservan su ruta.
-- 2. Asignación por OF: pedidos.asignados (lista de ids de usuario).
--    El operario solo lee las OF que tiene asignadas, y sus tiempos,
--    material e incidencias.
-- 3. Material consumido por etapa (tabla consumos). El stock y el
--    inventario se llevan en otra app: aquí solo se apunta lo gastado y se
--    pone a 0 al cuadrar el inventario (movimiento 'regularizacion').
-- 4. Funciones de varios pasos:
--      guardar_etapas()          → el operario marca etapas e indica si hubo
--                                  material, solo en sus OF y sin tocar nada más.
--      regularizar_materiales()  → poner a 0 lo gastado (solo editores).
--    Se elimina despachar_materiales() (ya no hay reservas ni despachos).
--
--                         Editor            Operario
--   Pedidos (OF)          todo              leer y marcar etapas, solo sus OF
--   Consumos              todo              leer los de sus OF; crear a su
--                                           nombre en sus OF; borrar los suyos
--                                           si no se han puesto a 0
--   Tiempos               todo              leer los de sus OF y los suyos;
--                                           crear solo en sus OF
--   Incidencias           todo              leer las de sus OF y las suyas;
--                                           crear sin OF o en sus OF
-- ============================================================================

begin;

-- ------------------------------------------------------------ 1. Ruta base --
update public.productos
   set ruta = '["Pedido recibido", "Pedir material al carpintero", "Recibir material del carpintero", "Aplicar puente de unión",
               "Dar 1.ª mano base", "Lijar", "Dar 2.ª mano base completa", "Lijar",
               "Dar 1.ª mano de acabado", "Lijar", "Dar 2.ª mano de acabado", "Lijar",
               "Dar 1.ª mano de poliuretano", "Dar 2.ª mano de poliuretano", "Embalar", "Entregar pedido"]'::jsonb
 where categoria = 'fabricado'
   and ruta = '["Pedido recibido", "Material pedido al carpintero", "Material recibido", "Módulos preparados",
               "Mano de producto base", "Secado y lijado", "Mano de producto final (1.ª capa)", "Secado y lijado",
               "Mano de producto final (2.ª capa)", "Secado y lijado", "Poliuretano aplicado", "Montado y entregado"]'::jsonb;

-- ------------------------------------------------ 2. Asignación por OF -----
alter table public.pedidos
  add column if not exists asignados jsonb not null default '[]'::jsonb
  check (jsonb_typeof(asignados) = 'array');

-- Quien tenía alguna etapa asignada pasa a tener la OF entera.
update public.pedidos p
   set asignados = coalesce((
         select jsonb_agg(distinct e ->> 'asignadoA')
           from jsonb_array_elements(p.etapas) e
          where coalesce(e ->> 'asignadoA', '') <> ''), '[]'::jsonb)
 where p.asignados = '[]'::jsonb;

create index if not exists pedidos_asignados_idx on public.pedidos using gin (asignados);

-- ¿Está el usuario conectado asignado a esta OF?
-- security definer: consulta pedidos sin pasar por sus políticas (evita bucles).
create or replace function public.pedido_asignado(p_pedido text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.pedidos
                  where id = p_pedido and asignados ? auth.uid()::text)
$$;
revoke execute on function public.pedido_asignado(text) from public, anon;
grant execute on function public.pedido_asignado(text) to authenticated;

-- Pedidos: el operario solo lee sus OF (los editores leen todo por "escribir: editores").
drop policy if exists "leer: usuarios del taller" on public.pedidos;
create policy "pedidos: leer asignadas" on public.pedidos for select to authenticated
  using (public.es_usuario() and asignados ? auth.uid()::text);

-- Tiempos: leer los de sus OF y los suyos; crear solo en sus OF.
drop policy if exists "leer: usuarios del taller" on public.tiempos;
create policy "tiempos: leer" on public.tiempos for select to authenticated
  using (public.es_editor() or usuario_id = auth.uid() or public.pedido_asignado(pedido_id));
drop policy if exists "tiempos: crear" on public.tiempos;
create policy "tiempos: crear" on public.tiempos for insert to authenticated
  with check (public.es_editor()
              or (public.es_usuario() and usuario_id = auth.uid() and public.pedido_asignado(pedido_id)));

-- Incidencias: leer las de sus OF y las suyas; crear generales o en sus OF.
drop policy if exists "leer: usuarios del taller" on public.incidencias;
create policy "incidencias: leer" on public.incidencias for select to authenticated
  using (public.es_editor() or usuario_id = auth.uid()
         or (pedido_id is not null and public.pedido_asignado(pedido_id)));
drop policy if exists "incidencias: crear" on public.incidencias;
create policy "incidencias: crear" on public.incidencias for insert to authenticated
  with check (public.es_editor()
              or (public.es_usuario() and usuario_id = auth.uid() and resuelta = false
                  and (pedido_id is null or public.pedido_asignado(pedido_id))));

-- ------------------------------------------------ 3. Material consumido ----
alter table public.movimientos_stock drop constraint if exists movimientos_stock_tipo_check;
alter table public.movimientos_stock add constraint movimientos_stock_tipo_check
  check (tipo in ('entrada', 'salida', 'regularizacion'));

create table if not exists public.consumos (
  id                 text primary key default gen_random_uuid()::text,
  pedido_id          text not null references public.pedidos (id) on delete cascade,
  etapa_idx          integer not null check (etapa_idx >= 0),
  etapa_nombre       text not null,
  material_id        text not null references public.productos (id) on delete restrict,
  cantidad           numeric not null check (cantidad > 0),
  fecha              date not null default current_date,
  usuario_id         uuid not null references public.perfiles (id),
  nota               text not null default '',
  -- Puesta a 0 en la que se contó (null = gasto pendiente).
  regularizacion_id  text references public.movimientos_stock (id) on delete set null,
  creado             timestamptz not null default now()
);
create index if not exists consumos_pedido_idx on public.consumos (pedido_id, etapa_idx);
create index if not exists consumos_pendientes_idx on public.consumos (material_id) where regularizacion_id is null;

alter table public.consumos enable row level security;

create policy "consumos: leer" on public.consumos for select to authenticated
  using (public.es_editor() or public.pedido_asignado(pedido_id));
create policy "consumos: crear" on public.consumos for insert to authenticated
  with check (public.es_editor()
              or (public.es_usuario() and usuario_id = auth.uid() and regularizacion_id is null
                  and public.pedido_asignado(pedido_id)));
create policy "consumos: editar" on public.consumos for update to authenticated
  using (public.es_editor()) with check (public.es_editor());
create policy "consumos: borrar" on public.consumos for delete to authenticated
  using (public.es_editor() or (usuario_id = auth.uid() and regularizacion_id is null));

-- ------------------------------------------ 4. Operaciones de varios pasos --

-- El operario no escribe en pedidos directamente. Con esta función puede
-- cambiar, en sus OF, solo completada, fecha y consumoMaterial de cada etapa.
-- El resto de cada etapa (nombre, …) se conserva tal cual estaba.
create or replace function public.guardar_etapas(p_pedido text, p_etapas jsonb)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_viejas jsonb;
  v_nuevas jsonb;
begin
  if not public.es_usuario() then
    raise exception 'Tu perfil no tiene permiso para este cambio.' using errcode = '42501';
  end if;

  select etapas into v_viejas from public.pedidos
   where id = p_pedido and (public.es_editor() or asignados ? auth.uid()::text)
   for update;
  if not found then
    raise exception 'Esa OF no existe o no está asignada a ti.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_etapas) <> 'array' or jsonb_array_length(p_etapas) <> jsonb_array_length(v_viejas) then
    raise exception 'La ruta de la OF ha cambiado. Recarga la app.';
  end if;

  select jsonb_agg(
           vieja || jsonb_build_object(
             'completada',      coalesce(nueva -> 'completada', 'false'::jsonb),
             'fecha',           coalesce(nueva -> 'fecha', 'null'::jsonb),
             'consumoMaterial', coalesce(nueva -> 'consumoMaterial', 'null'::jsonb))
           order by i)
    into v_nuevas
    from jsonb_array_elements(v_viejas) with ordinality as v (vieja, i)
    join jsonb_array_elements(p_etapas) with ordinality as n (nueva, j) on j = i
   where (nueva ->> 'nombre') is not distinct from (vieja ->> 'nombre');

  if jsonb_array_length(coalesce(v_nuevas, '[]'::jsonb)) <> jsonb_array_length(v_viejas) then
    raise exception 'La ruta de la OF ha cambiado. Recarga la app.';
  end if;

  update public.pedidos set etapas = v_nuevas where id = p_pedido;
end;
$$;
revoke execute on function public.guardar_etapas(text, jsonb) from public, anon;
grant execute on function public.guardar_etapas(text, jsonb) to authenticated;

-- Poner a 0 lo gastado (todo o nada). p_regs:
--   [{"movimientoId": "…", "materialId": "…", "consumoIds": ["…", …]}, …]
-- Por cada material: un movimiento 'regularizacion' con la suma de esos
-- consumos (calculada aquí, no la que mande la app) y los consumos marcados.
create or replace function public.regularizar_materiales(p_regs jsonb, p_nota text default '')
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  v_reg   jsonb;
  v_ids   text[];
  v_total numeric;
  v_n     integer;
begin
  if not public.es_editor() then
    raise exception 'Solo los editores pueden poner materiales a 0.' using errcode = '42501';
  end if;

  for v_reg in select * from jsonb_array_elements(p_regs) loop
    v_ids := array(select jsonb_array_elements_text(v_reg -> 'consumoIds'));

    select count(*), coalesce(sum(cantidad), 0) into v_n, v_total
      from public.consumos
     where id = any (v_ids) and material_id = v_reg ->> 'materialId' and regularizacion_id is null;
    if v_n <> coalesce(array_length(v_ids, 1), 0) or v_n = 0 then
      raise exception 'Alguien ha cambiado el material gastado mientras tanto. Recarga la app y vuelve a intentarlo.';
    end if;

    insert into public.movimientos_stock (id, material_id, tipo, cantidad, nota, auto, usuario_id)
    values (v_reg ->> 'movimientoId', v_reg ->> 'materialId', 'regularizacion', v_total,
            coalesce(nullif(trim(p_nota), ''), 'Inventario cuadrado en la otra app'), false, auth.uid());

    update public.consumos set regularizacion_id = v_reg ->> 'movimientoId' where id = any (v_ids);
  end loop;
end;
$$;
revoke execute on function public.regularizar_materiales(jsonb, text) from public, anon;
grant execute on function public.regularizar_materiales(jsonb, text) to authenticated;

-- Ya no hay reservas ni despachos de material.
drop function if exists public.despachar_materiales(text);

commit;

-- Comprobar:
-- select numero, asignados from public.pedidos order by numero;
-- select nombre, jsonb_array_length(ruta) from public.productos where categoria = 'fabricado';
