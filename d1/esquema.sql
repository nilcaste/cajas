-- =============================================================================
-- Cajas — esquema de D1 (Cloudflare), sustituye a supabase/esquema.sql
-- =============================================================================
-- Base `cajas` (id e1531d34-ebf9-4d71-93b9-8e168e7fb2cb), enlazada al proyecto
-- Pages `dashboard` como binding CAJAS. La API vive en
-- dashboard-hub/functions/cajas/api/[[ruta]].js.
-- Aplicar:  npx wrangler d1 execute cajas --remote --file d1/esquema.sql
-- Es idempotente.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- Catálogo: cada tipo de cosa se da de alta una vez en la vida.
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  emoji       TEXT,
  suministro  INTEGER NOT NULL DEFAULT 1,
  foto        TEXT,              -- URL de la foto; vacía = manda el emoji
  creado      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Las cajas físicas. `num` es la pegatina: NO es único y NO es el id.
CREATE TABLE IF NOT EXISTS cajas (
  id          TEXT PRIMARY KEY,
  num         TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  ubicacion   TEXT,
  orden       INTEGER,           -- orden dentro de su sitio; nulo = por número
  creado      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Qué hay en cada caja. Sin fila = no hay ninguno (cantidad 0 se borra).
CREATE TABLE IF NOT EXISTS stock (
  item_id     TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  caja_id     TEXT NOT NULL REFERENCES cajas (id) ON DELETE CASCADE,
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0),
  orden       INTEGER,           -- orden dentro de la caja; nulo = el del catálogo
  PRIMARY KEY (item_id, caja_id)
);

CREATE INDEX IF NOT EXISTS stock_caja_idx ON stock (caja_id);
CREATE INDEX IF NOT EXISTS stock_item_idx ON stock (item_id);

-- ------------------------------------------------------------------ fotos --
-- Las fotos viven en R2 (bucket `cajas-fotos`, binding FOTOS). Esta tabla lleva
-- la cuenta de lo que ocupan, para frenar antes del límite gratis de R2.
CREATE TABLE IF NOT EXISTS fotos (
  nombre      TEXT PRIMARY KEY,
  bytes       INTEGER NOT NULL,
  creado      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS fotos_creado_idx ON fotos (creado);
