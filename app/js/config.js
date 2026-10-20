/* =============================================================================
   Cajas — configuración
   =============================================================================
   Lo ÚNICO que hay que tocar para enchufar Supabase.

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  PEGAR AQUÍ                                                              │
   │                                                                          │
   │  Supabase → tu proyecto → Project Settings → API                         │
   │    · Project URL                          →  url                         │
   │    · API Keys → la PÚBLICA                →  anonKey                     │
   │      (`sb_publishable_…` en los proyectos nuevos; `anon public`, un JWT  │
   │       largo, en los viejos: supabase-js se traga las dos igual)          │
   │                                                                          │
   │  Ambas son públicas por diseño (van en el navegador). Lo que protege     │
   │  los datos es el RLS del esquema: sin sesión, la anon key no lee nada.   │
   │  La `service_role` NO se pega aquí NUNCA.                                │
   └──────────────────────────────────────────────────────────────────────────┘

   Con `url` vacío la app funciona exactamente como hasta hoy: LocalAdapter,
   localStorage, sin red, sin puerta de acceso. Es el estado de reposo.
   ========================================================================== */

export const SUPABASE = {
  url: 'https://jarheyunemohmorqqwjj.supabase.co',
  anonKey: 'sb_publishable_7I77F7y6-pMRH0aZhlAr1A_IEsZe4jb'
};

/* ¿Se pide el correo antes de entrar?
   NO (decisión de Nil, 2026-08-29): cajas se abre escaneando el QR de una
   caja, con las manos ocupadas y a veces desde el móvil de otro; cualquier
   puerta sobra ahí. A cambio, quien tenga la URL entra: las políticas del
   esquema dan permiso a `anon` y el almacén queda abierto a quien la conozca.
   Volver a cerrarlo = poner esto en `true` y devolver las políticas a
   `to authenticated` (supabase/esquema.sql). */
export const PUERTA = false;

/* Hace falta que estén LAS DOS para considerar que hay nube: media
   configuración sólo serviría para romper el arranque. */
export function hayNube() {
  return !!(SUPABASE.url && SUPABASE.anonKey);
}

export default SUPABASE;
