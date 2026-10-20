/* Cajas — datos de mentira compartidos por todas las maquetas.
   Sin persistencia: cada recarga vuelve al estado inicial. */

const CATALOGO = [
  // Suministros (cantidad con stepper)
  { id: 'estropajos',  nombre: 'Estropajos',           emoji: '🧽', suministro: true },
  { id: 'cepillos',    nombre: 'Cepillos de dientes',  emoji: '🪥', suministro: true },
  { id: 'desodorante', nombre: 'Desodorante',          emoji: '🧴', suministro: true },
  { id: 'champu',      nombre: 'Champú',               emoji: '🫧', suministro: true },
  { id: 'gel',         nombre: 'Gel de ducha',         emoji: '🧼', suministro: true },
  { id: 'pilas',       nombre: 'Pilas AA',             emoji: '🔋', suministro: true },
  { id: 'bombillas',   nombre: 'Bombillas LED',        emoji: '💡', suministro: true },
  { id: 'papel',       nombre: 'Papel de cocina',      emoji: '🧻', suministro: true },
  { id: 'bolsas',      nombre: 'Bolsas de basura',     emoji: '🗑️', suministro: true },
  { id: 'velas',       nombre: 'Velas',                emoji: '🕯️', suministro: true },
  // Únicos (está o no está)
  { id: 'plancha',     nombre: 'Plancha',              emoji: '👕', suministro: false },
  { id: 'taladro',     nombre: 'Taladro',              emoji: '🪛', suministro: false },
  { id: 'raqueta',     nombre: 'Raqueta de tenis',     emoji: '🎾', suministro: false },
  { id: 'manta',       nombre: 'Manta nórdica',        emoji: '🛏️', suministro: false }
];

const CAJAS = [
  { num: '01', nombre: 'Baño repuestos',     ubicacion: 'Armario del pasillo' },
  { num: '02', nombre: 'Limpieza',           ubicacion: 'Bajo el fregadero' },
  { num: '03', nombre: 'Cocina repuestos',   ubicacion: 'Alacena, balda alta' },
  { num: '04', nombre: 'Electricidad',       ubicacion: 'Estantería entrada' },
  { num: '05', nombre: 'Herramientas',       ubicacion: 'Suelo del trastero' },
  { num: '06', nombre: 'Deporte',            ubicacion: 'Altillo' },
  { num: '07', nombre: 'Repuestos varios',   ubicacion: 'Estantería fondo' },
  { num: '08', nombre: 'Textil e invierno',  ubicacion: 'Armario habitación' }
];

/* stock: caja ↔ objeto ↔ cantidad.
   Los únicos van siempre con cantidad 1 (implícita). */
const STOCK = [
  // Caja 01 — Baño repuestos
  { caja: '01', objeto: 'cepillos',    cantidad: 4 },
  { caja: '01', objeto: 'desodorante', cantidad: 2 },
  { caja: '01', objeto: 'champu',      cantidad: 3 },
  { caja: '01', objeto: 'gel',         cantidad: 2 },
  // Caja 02 — Limpieza
  { caja: '02', objeto: 'bolsas',      cantidad: 6 },
  { caja: '02', objeto: 'papel',       cantidad: 4 },
  { caja: '02', objeto: 'estropajos',  cantidad: 3 },
  // Caja 03 — Cocina repuestos
  { caja: '03', objeto: 'estropajos',  cantidad: 2 },
  { caja: '03', objeto: 'velas',       cantidad: 5 },
  { caja: '03', objeto: 'papel',       cantidad: 2 },
  // Caja 04 — Electricidad
  { caja: '04', objeto: 'pilas',       cantidad: 8 },
  { caja: '04', objeto: 'bombillas',   cantidad: 5 },
  // Caja 05 — Herramientas
  { caja: '05', objeto: 'taladro',     cantidad: 1 },
  { caja: '05', objeto: 'bombillas',   cantidad: 2 },
  // Caja 06 — Deporte
  { caja: '06', objeto: 'raqueta',     cantidad: 1 },
  // Caja 07 — Repuestos varios (la que abre el QR)
  { caja: '07', objeto: 'estropajos',  cantidad: 2 },
  { caja: '07', objeto: 'pilas',       cantidad: 4 },
  { caja: '07', objeto: 'bombillas',   cantidad: 3 },
  { caja: '07', objeto: 'velas',       cantidad: 2 },
  { caja: '07', objeto: 'plancha',     cantidad: 1 },
  { caja: '07', objeto: 'champu',      cantidad: 1 },
  // Caja 08 — Textil e invierno
  { caja: '08', objeto: 'manta',       cantidad: 1 },
  { caja: '08', objeto: 'velas',       cantidad: 3 }
];

/* Objetos usados hace poco, para el bloque "Recientes" de añadir. */
const RECIENTES = ['estropajos', 'pilas', 'papel', 'bombillas', 'bolsas', 'gel'];

/* ---------- Helpers ---------- */

const Datos = {
  objeto(id) {
    return CATALOGO.find(o => o.id === id);
  },
  caja(num) {
    return CAJAS.find(c => c.num === num);
  },
  /* Contenido de una caja: [{objeto, cantidad}] en el orden del catálogo */
  contenido(num) {
    return STOCK
      .filter(s => s.caja === num)
      .map(s => ({ objeto: Datos.objeto(s.objeto), cantidad: s.cantidad }))
      .filter(f => f.objeto);
  },
  /* Nº de objetos distintos en una caja */
  numObjetos(num) {
    return STOCK.filter(s => s.caja === num).length;
  },
  /* Dónde está un objeto: [{caja, cantidad}] */
  ubicaciones(id) {
    return STOCK
      .filter(s => s.objeto === id)
      .map(s => ({ caja: Datos.caja(s.caja), cantidad: s.cantidad }))
      .filter(u => u.caja)
      .sort((a, b) => a.caja.num.localeCompare(b.caja.num));
  },
  /* Total de unidades de un objeto en todo el almacén */
  total(id) {
    return STOCK.filter(s => s.objeto === id).reduce((n, s) => n + s.cantidad, 0);
  },
  /* Añade cantidad a una caja (crea la línea si no existía). Devuelve la nueva cantidad. */
  anadir(numCaja, idObjeto, cantidad = 1) {
    const linea = STOCK.find(s => s.caja === numCaja && s.objeto === idObjeto);
    if (linea) {
      linea.cantidad += cantidad;
      return linea.cantidad;
    }
    STOCK.push({ caja: numCaja, objeto: idObjeto, cantidad });
    return cantidad;
  },
  /* Fija la cantidad; con 0 quita la línea de la caja. */
  fijar(numCaja, idObjeto, cantidad) {
    const i = STOCK.findIndex(s => s.caja === numCaja && s.objeto === idObjeto);
    if (i === -1) return;
    if (cantidad <= 0) STOCK.splice(i, 1);
    else STOCK[i].cantidad = cantidad;
  },
  quitar(numCaja, idObjeto) {
    Datos.fijar(numCaja, idObjeto, 0);
  },
  /* Alta mínima en el catálogo. */
  crearObjeto(nombre, suministro, emoji) {
    const id = 'nuevo-' + Math.random().toString(36).slice(2, 8);
    const obj = { id, nombre, emoji: emoji || '📦', suministro: !!suministro, nuevo: true };
    CATALOGO.push(obj);
    return obj;
  },
  crearCaja(nombre, ubicacion) {
    const ultimo = CAJAS.reduce((m, c) => Math.max(m, parseInt(c.num, 10)), 0);
    const caja = { num: String(ultimo + 1).padStart(2, '0'), nombre, ubicacion };
    CAJAS.push(caja);
    return caja;
  },
  /* Búsqueda tolerante a acentos y mayúsculas */
  buscar(texto) {
    const q = Datos.normaliza(texto);
    if (!q) return [];
    return CATALOGO.filter(o => Datos.normaliza(o.nombre).includes(q));
  },
  normaliza(t) {
    return (t || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
};
