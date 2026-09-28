-- ============================================================================
-- 002_permisos.sql — Seguridad por fila (RLS): la misma matriz que js/config.js
-- ----------------------------------------------------------------------------
--                        Editor            Operario
--   Pedidos (órdenes),   leer y escribir   solo leer
--   productos, rutas
--   Clientes, precios,   leer y escribir   NADA (ni leer)
--   movimientos de stock
--   Tiempos              todo              crear/editar/borrar solo los suyos
--   Incidencias y notas  todo              crear las suyas; borrar las suyas;
--                                          no puede resolverlas
--   Perfiles (roles)     editar            no (nadie puede subirse de rol)
--
-- La base de datos es quien manda: aunque alguien manipule la app,
-- estas reglas se cumplen igual.
-- ============================================================================

-- Rol del usuario conectado ('editor' | 'operario' | null si no tiene perfil).
-- security definer: lee perfiles sin depender de las políticas de perfiles.
create or replace function public.mi_rol()
returns text
language sql stable security definer
set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_editor()
returns boolean language sql stable
as $$ select coalesce(public.mi_rol() = 'editor', false) $$;

create or replace function public.es_usuario()
returns boolean language sql stable
as $$ select public.mi_rol() is not null $$;

alter table public.perfiles          enable row level security;
alter table public.clientes          enable row level security;
alter table public.productos         enable row level security;
alter table public.precios           enable row level security;
alter table public.pedidos           enable row level security;
alter table public.movimientos_stock enable row level security;
alter table public.tiempos           enable row level security;
alter table public.incidencias       enable row level security;

-- ---------------------------------------------------------------- Lectura --
-- Lo que necesita una orden de fabricación: cualquier usuario con perfil.
-- Sin perfil (o sin sesión), nada.
create policy "leer: usuarios del taller" on public.perfiles          for select to authenticated using (public.es_usuario());
create policy "leer: usuarios del taller" on public.productos         for select to authenticated using (public.es_usuario());
create policy "leer: usuarios del taller" on public.pedidos           for select to authenticated using (public.es_usuario());
create policy "leer: usuarios del taller" on public.tiempos           for select to authenticated using (public.es_usuario());
create policy "leer: usuarios del taller" on public.incidencias       for select to authenticated using (public.es_usuario());
-- Clientes, precios y movimientos de stock: solo editores (lo cubre la política "escribir: editores", que es FOR ALL).

-- ------------------------------------------------ Escritura: solo editores --
create policy "escribir: editores" on public.perfiles          for all to authenticated using (public.es_editor()) with check (public.es_editor());
create policy "escribir: editores" on public.clientes          for all to authenticated using (public.es_editor()) with check (public.es_editor());
create policy "escribir: editores" on public.productos         for all to authenticated using (public.es_editor()) with check (public.es_editor());
create policy "escribir: editores" on public.precios           for all to authenticated using (public.es_editor()) with check (public.es_editor());
create policy "escribir: editores" on public.pedidos           for all to authenticated using (public.es_editor()) with check (public.es_editor());
create policy "escribir: editores" on public.movimientos_stock for all to authenticated using (public.es_editor()) with check (public.es_editor());

-- ----------------------------------------------------------------- Tiempos --
-- El editor todo; el operario solo filas con su propio usuario_id.
create policy "tiempos: crear" on public.tiempos for insert to authenticated
  with check (public.es_editor() or (public.es_usuario() and usuario_id = auth.uid()));
create policy "tiempos: editar" on public.tiempos for update to authenticated
  using (public.es_editor() or usuario_id = auth.uid())
  with check (public.es_editor() or usuario_id = auth.uid());
create policy "tiempos: borrar" on public.tiempos for delete to authenticated
  using (public.es_editor() or usuario_id = auth.uid());

-- ------------------------------------------------------------- Incidencias --
-- Todos crean (a su nombre y sin resolver). Solo editores resuelven/editan.
create policy "incidencias: crear" on public.incidencias for insert to authenticated
  with check (public.es_editor() or (public.es_usuario() and usuario_id = auth.uid() and resuelta = false));
create policy "incidencias: editar" on public.incidencias for update to authenticated
  using (public.es_editor()) with check (public.es_editor());
create policy "incidencias: borrar" on public.incidencias for delete to authenticated
  using (public.es_editor() or usuario_id = auth.uid());

-- ------------------------------------------ Operaciones de varios pasos -----
-- Despachar materiales toca pedido + stock + movimientos: se hace de una vez
-- (todo o nada) en la base de datos. Se ejecuta con los permisos de quien
-- llama, así que solo funciona para editores.
create or replace function public.despachar_materiales(p_pedido text)
returns void
language plpgsql security invoker
set search_path = public
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_linea  jsonb;
begin
  if not public.es_editor() then
    raise exception 'Solo los editores pueden despachar materiales' using errcode = '42501';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'El pedido ya no existe'; end if;
  if v_pedido.materiales_despachados then raise exception 'Los materiales ya están despachados'; end if;

  for v_linea in select * from jsonb_array_elements(v_pedido.consumo) loop
    update public.productos
       set stock = stock - (v_linea ->> 'cantidad')::numeric
     where id = v_linea ->> 'materialId' and categoria = 'material';
    insert into public.movimientos_stock (material_id, tipo, cantidad, nota, auto, pedido_id, usuario_id)
    values (v_linea ->> 'materialId', 'salida', (v_linea ->> 'cantidad')::numeric,
            'Despacho de materiales — inicio de fabricación', true, p_pedido, auth.uid());
  end loop;

  update public.pedidos
     set materiales_despachados = true, fecha_despacho = current_date
   where id = p_pedido;
end;
$$;

revoke execute on function public.despachar_materiales(text) from public, anon;
grant execute on function public.despachar_materiales(text) to authenticated;
