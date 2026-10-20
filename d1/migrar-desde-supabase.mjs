// Copia items, cajas y stock de Supabase a D1 (una sola vez, 20-10-2026).
// Uso: node d1/migrar-desde-supabase.mjs > /tmp/cajas.sql
//      npx wrangler d1 execute cajas --remote --file /tmp/cajas.sql
// Vacía D1 antes de copiar, así que se puede repetir.
import { SUPABASE } from "../app/js/config.js";

const h = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` };
async function tabla(nombre) {
  const r = await fetch(`${SUPABASE.url}/rest/v1/${nombre}?select=*&order=${nombre === "stock" ? "item_id" : "creado"}.asc`, { headers: h });
  if (!r.ok) throw new Error(`${nombre}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "1" : "0") : `'${String(v).replace(/'/g, "''")}'`);
const insert = (t, cols, filas) => filas.map((f) => `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map((c) => q(f[c])).join(", ")});`);

const [items, cajas, stock] = await Promise.all([tabla("items"), tabla("cajas"), tabla("stock")]);
const sql = [
  "DELETE FROM stock;", "DELETE FROM cajas;", "DELETE FROM items;",
  ...insert("items", ["id", "nombre", "emoji", "suministro", "foto", "creado"], items),
  ...insert("cajas", ["id", "num", "nombre", "ubicacion", "orden", "creado"], cajas),
  ...insert("stock", ["item_id", "caja_id", "cantidad", "orden"], stock),
];
process.stdout.write(sql.join("\n") + "\n");
console.error(`items ${items.length}, cajas ${cajas.length}, stock ${stock.length}`);
