// Pasa las fotos de los ítems de Supabase Storage a R2 (una sola vez, 20-10-2026).
// Baja cada foto, la sube por la API del hub (que la guarda en R2 y la cuenta)
// y cambia la URL del ítem. Solo toca ítems cuya foto sigue en supabase.co.
// Uso: node d1/migrar-fotos.mjs [https://d.nil.sx]
const BASE = process.argv[2] || "https://d.nil.sx";
const API = BASE + "/cajas/api";
const H = { "X-Cajas": "1" };

const { items } = await (await fetch(API + "/todo")).json();
const pendientes = items.filter((i) => /supabase\.co\//.test(i.foto || ""));
let hechos = 0;
for (const it of pendientes) {
  const r = await fetch(it.foto);
  if (!r.ok) { console.error(`✗ ${it.nombre}: no baja (${r.status})`); continue; }
  const tipo = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
  const sube = await fetch(API + "/foto", { method: "POST", headers: { ...H, "Content-Type": tipo }, body: await r.arrayBuffer() });
  const { url, error } = await sube.json();
  if (!sube.ok) { console.error(`✗ ${it.nombre}: ${error}`); continue; }
  const fila = { id: it.id, nombre: it.nombre, emoji: it.emoji, suministro: it.suministro, foto: url };
  const cambia = await fetch(API + "/upsert", { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ tabla: "items", fila }) });
  if (!cambia.ok) { console.error(`✗ ${it.nombre}: no se ha guardado la URL`); continue; }
  hechos++;
}
console.log(`${hechos} de ${pendientes.length} fotos pasadas a R2`);
