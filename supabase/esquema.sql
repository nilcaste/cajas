-- =============================================================================
-- Cajas — esquema de Supabase
-- =============================================================================
-- Para pegar TAL CUAL en el SQL Editor del proyecto (Supabase → SQL Editor →
-- New query → pegar → Run). Es idempotente: se puede volver a ejecutar sin
-- romper nada.
--
-- -----------------------------------------------------------------------------
-- PASOS MANUALES (checklist de Nil, en este orden)
-- -----------------------------------------------------------------------------
-- 1. Crear el proyecto en https://supabase.com/dashboard
--      · Region: eu-west (Irlanda) o eu-central — lo más cerca de casa.
--      · Guarda la contraseña de la base de datos donde guardas las cosas.
--
-- 2. SQL Editor → pegar este fichero entero → Run.
--      Debe terminar sin errores y con las tres tablas creadas.
--
-- 3. Authentication → Providers → Email
--      · "Confirm email"           ON  (el enlace mágico ES la confirmación)
--      · "Enable email provider"   ON
--      · Si aparece "Email OTP" / "Magic Link", déjalo activado.
--
-- 4. Authentication → URL Configuration
--      · Site URL: la URL real de la app (p. ej. https://cajas.pages.dev).
--      · Redirect URLs: añade además http://localhost:4751/ para poder
--        entrar en local. Sin esto el enlace del correo rebota.
--
-- 5. Crear los DOS usuarios (Authentication → Users → Add user →
--    "Create new user", marcando "Auto Confirm User"):
--      · el correo de Nil
--      · el correo de su pareja
--    OJO: la puerta de la app pide el enlace con `shouldCreateUser: false`
--    (no da de alta a nadie por su cuenta, ni siquiera con los signups
--    abiertos), así que los dos usuarios TIENEN que existir antes de que
--    nadie pueda entrar. Se crean aquí, en el panel.
--
-- 6. YA CON LOS DOS USUARIOS DENTRO: cerrar la puerta.
--      Authentication → Sign In / Providers (o Settings) →
--      "Allow new users to sign up"  →  OFF
--    A partir de ahí, cualquier correo que no sea uno de esos dos recibe un
--    error al pedir el enlace: la app es privada de verdad.
--
-- 7. Project Settings → API → copiar
--      · Project URL          →  app/js/config.js  →  SUPABASE.url
--      · la clave PÚBLICA     →  app/js/config.js  →  SUPABASE.anonKey
--        (`sb_publishable_…` en los proyectos nuevos, o la `anon public` de
--         siempre en los viejos: supabase-js acepta las dos igual)
--    (la `service_role` / `sb_secret_…` NO se copia al navegador NUNCA)
--
-- 8. Recargar la app: aparecerá la pantalla de acceso. Pide el enlace,
--    ábrelo y ya estás dentro. El primero que entre verá el almacén vacío:
--    las cajas de prueba del modo local NO se suben solas (a propósito).
-- =============================================================================


-- ------------------------------------------------------------------ tablas --

-- Catálogo: cada tipo de cosa se da de alta una vez en la vida.
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  emoji       text,
  suministro  boolean not null default true,
  -- URL pública de la foto en el bucket `fotos`. Vacía = manda el emoji.
  foto        text,
  creado      timestamptz default now()
);

-- Para bases que ya existían antes de que hubiera fotos.
alter table public.items add column if not exists foto text;

-- Las cajas físicas. `num` es la pegatina: NO es único y NO es el id.
create table if not exists public.cajas (
  id          uuid primary key default gen_random_uuid(),
  num         text not null,
  nombre      text not null,
  ubicacion   text,
  creado      timestamptz default now()
);

-- Qué hay en cada caja. Sin fila = no hay ninguno (cantidad 0 se borra).
create table if not exists public.stock (
  item_id     uuid not null references public.items (id) on delete cascade,
  caja_id     uuid not null references public.cajas (id) on delete cascade,
  cantidad    int  not null check (cantidad > 0),
  primary key (item_id, caja_id)
);

-- El orden en que se ven los ítems DENTRO de una caja: lo pone el usuario
-- arrastrando. Nulo = todavía no lo ha tocado, y entonces manda el orden del
-- catálogo.
alter table public.stock add column if not exists orden int;

-- Y el orden en que se ven las CAJAS dentro de su sitio, también arrastrando.
-- Nulo = sin tocar, y entonces manda el número de la pegatina.
alter table public.cajas add column if not exists orden int;

-- Búsquedas por caja y por ítem (las dos direcciones que usa la app).
create index if not exists stock_caja_idx on public.stock (caja_id);
create index if not exists stock_item_idx on public.stock (item_id);


-- --------------------------------------------------------------------- RLS --
-- La app NO tiene puerta (decisión de Nil, 2026-08-29: se abre escaneando el
-- QR de una caja y no puede pedir nada). Por eso la política incluye `anon`:
-- quien tenga la URL puede leer y escribir. Es un inventario de casa en una
-- URL que no está indexada, pero conviene tenerlo presente.

alter table public.items enable row level security;
alter table public.cajas enable row level security;
alter table public.stock enable row level security;

drop policy if exists "casa entera" on public.items;
create policy "casa entera" on public.items
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "casa entera" on public.cajas;
create policy "casa entera" on public.cajas
  for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "casa entera" on public.stock;
create policy "casa entera" on public.stock
  for all
  to anon, authenticated
  using (true)
  with check (true);


-- ---------------------------------------------------------------- realtime --
-- Para que lo que toque uno aparezca en la pantalla del otro sin recargar.
-- `add table` falla si la tabla ya está en la publicación: por eso va dentro
-- de un bloque que se traga ese error concreto y sigue.

do $$
begin
  begin
    alter publication supabase_realtime add table public.items;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.cajas;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.stock;
  exception when duplicate_object then null;
  end;
end
$$;

-- `stock` no tiene columna de identidad propia (su clave es compuesta): sin
-- esto, los DELETE llegan por realtime sin decir QUÉ fila se ha borrado.
alter table public.stock replica identity full;


-- ------------------------------------------------------------------ fotos --
-- Un bucket público para las fotos de los ítems: la app las pinta con un
-- <img src>, así que tienen que poder leerse sin cabecera de autorización.
-- Escribir también es de todos, como el resto (ver el bloque de RLS).

insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos casa entera" on storage.objects;
create policy "fotos casa entera" on storage.objects
  for all
  to anon, authenticated
  using (bucket_id = 'fotos')
  with check (bucket_id = 'fotos');


-- ------------------------------------------------------------ comprobación --
-- Debe devolver tres filas con rowsecurity = true.
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('items', 'cajas', 'stock')
 order by tablename;
