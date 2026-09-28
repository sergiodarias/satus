-- ============================================================================
-- 003_usuarios.sql — Dar de alta los perfiles del taller
-- ----------------------------------------------------------------------------
-- 1. En Supabase → Authentication → Users → "Add user", crear cada usuario
--    con su email y contraseña (marcar "Auto Confirm User").
-- 2. Cambiar los emails de abajo por los reales y ejecutar este archivo.
--    Quien no tenga fila en `perfiles` no ve ningún dato aunque inicie sesión.
-- ============================================================================

insert into public.perfiles (id, nombre, rol)
select u.id, v.nombre, v.rol
from (values
  ('eduardo@ejemplo.com',  'Eduardo Díaz', 'editor'),
  ('sergio@ejemplo.com',   'Sergio Díaz',  'editor'),
  ('usuario1@ejemplo.com', 'Usuario 1',    'operario'),
  ('usuario2@ejemplo.com', 'Usuario 2',    'operario'),
  ('usuario3@ejemplo.com', 'Usuario 3',    'operario')
) as v (email, nombre, rol)
join auth.users u on lower(u.email) = lower(v.email)
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol;

-- Comprobar:
-- select p.nombre, p.rol, u.email from public.perfiles p join auth.users u on u.id = p.id order by p.rol, p.nombre;
