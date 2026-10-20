/* =============================================================================
   Cajas — capa de datos (adaptador)
   =============================================================================

   Aquí vive TODA la persistencia. Las vistas no tocan localStorage ni conocen
   el formato de almacenamiento: sólo llaman a `datos.*`.

   ---------------------------------------------------------------------------
   QUÉ ADAPTADOR SE USA
   ---------------------------------------------------------------------------
   Lo decide `js/config.js`, al final de este fichero y en un solo sitio:

     · SUPABASE.url vacío  →  LocalAdapter    (localStorage, sin red, semilla
                                               de demostración: el modo de hoy)
     · SUPABASE.url puesto →  SupabaseAdapter (local-first: caché en memoria +
                                               espejo, cola de subida y
                                               realtime; misma interfaz, igual
                                               de síncrona)

   Las vistas importan `datos` y no se enteran de cuál les ha tocado. La
   interfaz pública NO cambia entre los dos.

   El adaptador de Supabase añade dos cosas fuera de contrato que sólo usa
   `app.js`: emite 'aviso' en `datos.eventos` (toasts de sincronización) y
   expone `pendientes()`. Nadie más debería mirarlas.

   ---------------------------------------------------------------------------
   MODELO
   ---------------------------------------------------------------------------
   Item  { id, nombre, emoji, suministro, foto } // catálogo; foto: URL o ''
   Caja  { id, num, nombre, ubicacion }         // `num` es la pegatina: NO es
                                                // único y NO es el id
   Stock { itemId, cajaId, cantidad }           // multi-caja permitido;
                                                // los únicos van con cantidad 1

   `id` es siempre una cadena opaca y estable (las rutas usan el id, nunca el
   num, porque el num se puede editar y repetir).

   ---------------------------------------------------------------------------
   INTERFAZ (contrato de cualquier adaptador)
   ---------------------------------------------------------------------------
   listarCajas()                    -> Caja[]        ordenadas por num asc
   caja(id)                         -> Caja | null
   crearCaja({num, nombre, ubicacion})            -> Caja        (emite cambio)
   actualizarCaja(id, {num?, nombre?, ubicacion?}) -> Caja|null  (emite cambio)
   eliminarCaja(id)                 -> boolean       (emite cambio)
                                       borra la caja y TODAS sus líneas de
                                       stock. Los ítems NO se borran del
                                       catálogo: se quedan sin ubicar.

   listarItems()                    -> Item[]        orden del catálogo
   item(id)                         -> Item | null
   crearItem({nombre, emoji, suministro, foto})    -> Item        (emite cambio)
   actualizarItem(id, {nombre?, emoji?, suministro?, foto?}) -> Item|null (emite cambio)
   eliminarItem(id)                 -> boolean       (emite cambio)
                                       borra el ítem y TODAS sus líneas de
                                       stock: desaparece de todas las cajas.
   buscarItems(texto)               -> Item[]        subcadena, sin acentos ni
                                                     mayúsculas; texto vacío =>
                                                     catálogo entero

   puedeOrdenar()                   -> boolean       ¿la base guarda el orden?
   ordenarCaja(cajaId, itemIds)     -> void          (emite cambio)
   puedeOrdenarCajas()              -> boolean       ¿y el de la retícula?
   ordenarCajas(cajaIds)            -> void          (emite cambio)
                                       fija a mano el orden de las filas
   stockDeCaja(cajaId)              -> [{ item, cantidad }]   orden de entrada
   stockDeItem(itemId)              -> [{ caja, cantidad }]   por num de caja
   ponerStock(itemId, cajaId, cantidad) -> number             (emite cambio)
                                       cantidad <= 0 ELIMINA la relación

   suscribir(fn)                    -> function desuscribir
                                       fn recibe { tipo, ...detalle }
   eventos                          -> EventTarget ('cambio', e.detail)

   Todo devuelve COPIAS: mutar lo devuelto no altera el almacén.
   Todas las lecturas son síncronas (el adaptador de Supabase que venga
   mantendrá esta firma con una caché en memoria; si algún día hiciera falta
   async, se cambia aquí y en las vistas de golpe, no antes).
   ========================================================================== */

import { hayNube } from './config.js';
import { SupabaseAdapter } from './supabase-adapter.js';

const CLAVE = 'cajas.v1';
const VERSION = 1;

/* ---------------------------------------------------------------- semilla --
   Las 8 cajas y los 14 ítems de las maquetas (maquetas/data.js, que es el
   único juego de datos coherente: sus cantidades suman los "67 ítems" que
   muestra la cabecera de prueba-medkit.html). */
function semilla() {
  const cajas = [
    { id: 'caja-01', num: '01', nombre: 'Baño repuestos',    ubicacion: 'Armario del pasillo' },
    { id: 'caja-02', num: '02', nombre: 'Limpieza',          ubicacion: 'Bajo el fregadero' },
    { id: 'caja-03', num: '03', nombre: 'Cocina repuestos',  ubicacion: 'Alacena, balda alta' },
    { id: 'caja-04', num: '04', nombre: 'Electricidad',      ubicacion: 'Estantería entrada' },
    { id: 'caja-05', num: '05', nombre: 'Herramientas',      ubicacion: 'Suelo del trastero' },
    { id: 'caja-06', num: '06', nombre: 'Deporte',           ubicacion: 'Altillo' },
    { id: 'caja-07', num: '07', nombre: 'Repuestos varios',  ubicacion: 'Estantería fondo' },
    { id: 'caja-08', num: '08', nombre: 'Textil e invierno', ubicacion: 'Armario habitación' }
  ];

  const items = [
    { id: 'estropajos',  nombre: 'Estropajos',          emoji: '🧽',  suministro: true },
    { id: 'cepillos',    nombre: 'Cepillos de dientes', emoji: '🪥',  suministro: true },
    { id: 'desodorante', nombre: 'Desodorante',         emoji: '🧴',  suministro: true },
    { id: 'champu',      nombre: 'Champú',              emoji: '🫧',  suministro: true },
    { id: 'gel',         nombre: 'Gel de ducha',        emoji: '🧼',  suministro: true },
    { id: 'pilas',       nombre: 'Pilas AA',            emoji: '🔋',  suministro: true },
    { id: 'bombillas',   nombre: 'Bombillas LED',       emoji: '💡',  suministro: true },
    { id: 'papel',       nombre: 'Papel de cocina',     emoji: '🧻',  suministro: true },
    { id: 'bolsas',      nombre: 'Bolsas de basura',    emoji: '🗑️',  suministro: true },
    { id: 'velas',       nombre: 'Velas',               emoji: '🕯️',  suministro: true },
    { id: 'plancha',     nombre: 'Plancha',             emoji: '👕',  suministro: false },
    { id: 'taladro',     nombre: 'Taladro',             emoji: '🪛',  suministro: false },
    { id: 'raqueta',     nombre: 'Raqueta de tenis',    emoji: '🎾',  suministro: false },
    { id: 'manta',       nombre: 'Manta nórdica',       emoji: '🛏️',  suministro: false }
  ];

  const stock = [
    // 01 — Baño repuestos
    { itemId: 'cepillos',    cajaId: 'caja-01', cantidad: 4 },
    { itemId: 'desodorante', cajaId: 'caja-01', cantidad: 2 },
    { itemId: 'champu',      cajaId: 'caja-01', cantidad: 3 },
    { itemId: 'gel',         cajaId: 'caja-01', cantidad: 2 },
    // 02 — Limpieza
    { itemId: 'bolsas',      cajaId: 'caja-02', cantidad: 6 },
    { itemId: 'papel',       cajaId: 'caja-02', cantidad: 4 },
    { itemId: 'estropajos',  cajaId: 'caja-02', cantidad: 3 },
    // 03 — Cocina repuestos
    { itemId: 'estropajos',  cajaId: 'caja-03', cantidad: 2 },
    { itemId: 'velas',       cajaId: 'caja-03', cantidad: 5 },
    { itemId: 'papel',       cajaId: 'caja-03', cantidad: 2 },
    // 04 — Electricidad
    { itemId: 'pilas',       cajaId: 'caja-04', cantidad: 8 },
    { itemId: 'bombillas',   cajaId: 'caja-04', cantidad: 5 },
    // 05 — Herramientas
    { itemId: 'taladro',     cajaId: 'caja-05', cantidad: 1 },
    { itemId: 'bombillas',   cajaId: 'caja-05', cantidad: 2 },
    // 06 — Deporte
    { itemId: 'raqueta',     cajaId: 'caja-06', cantidad: 1 },
    // 07 — Repuestos varios (la del QR de ejemplo)
    { itemId: 'estropajos',  cajaId: 'caja-07', cantidad: 2 },
    { itemId: 'pilas',       cajaId: 'caja-07', cantidad: 4 },
    { itemId: 'bombillas',   cajaId: 'caja-07', cantidad: 3 },
    { itemId: 'velas',       cajaId: 'caja-07', cantidad: 2 },
    { itemId: 'plancha',     cajaId: 'caja-07', cantidad: 1 },
    { itemId: 'champu',      cajaId: 'caja-07', cantidad: 1 },
    // 08 — Textil e invierno
    { itemId: 'manta',       cajaId: 'caja-08', cantidad: 1 },
    { itemId: 'velas',       cajaId: 'caja-08', cantidad: 3 }
  ];

  return { version: VERSION, cajas, items, stock };
}

/* ------------------------------------------------------------- utilidades -- */

/* Minúsculas sin acentos MANTENIENDO la longitud, para que los índices de una
   coincidencia sirvan también sobre el texto original (resaltado en <b>). */
export function plano(texto) {
  return [...String(texto == null ? '' : texto).toLowerCase()]
    .map(c => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || c)
    .join('');
}

function nuevoId(prefijo) {
  return prefijo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function copia(o) {
  return o ? { ...o } : null;
}

/* Manda el orden que haya puesto el usuario arrastrando la retícula; lo que
   nunca ha tocado va después, por número; y las cajas sin número —lo que está
   suelto en su sitio, ver `sinClasificar`— cierran el grupo. */
function porNum(a, b) {
  const sinA = a.orden == null, sinB = b.orden == null;
  if (sinA !== sinB) return sinA ? 1 : -1;
  if (!sinA && a.orden !== b.orden) return a.orden - b.orden;
  const va = String(a.num || '').trim();
  const vb = String(b.num || '').trim();
  if (!va !== !vb) return va ? -1 : 1;
  return va.localeCompare(vb, 'es', { numeric: true });
}

/* ------------------------------------------------------------- sitios ----- */
/* Un SITIO es el mueble donde están las cajas: el armario negro, el trastero.
   No es una entidad nueva ni un nivel de navegación — es el `ubicacion` que
   las cajas ya tenían, usado para agrupar la retícula.

   Y dentro de un sitio puede haber cosas que no están en ninguna caja (el
   papel higiénico del armario). Eso es una caja SIN NÚMERO: mismo contenedor,
   mismo stock, mismo QR; lo único que le falta es la pegatina, que es
   justamente lo que la distingue. Así no hay tabla nueva ni migración. */

export function sinClasificar(caja) {
  return !!caja && !String(caja.num || '').trim();
}

export function sitio(caja) {
  return caja ? String(caja.ubicacion || '').trim() : '';
}

/* Cómo se llama una caja en una lista: "01 · Baño", o "Sin clasificar". */
export function rotulo(caja) {
  if (!caja) return '';
  if (sinClasificar(caja)) return 'Sin clasificar';
  return caja.num + (caja.nombre ? ' · ' + caja.nombre : '');
}

/* Los sitios que existen hoy, por orden alfabético y sin repetir. Salen de
   las cajas: no se dan de alta en ningún sitio, se escriben al crear una. */
export function listarSitios() {
  const vistos = new Map();
  datos.listarCajas().forEach(c => {
    const s = sitio(c);
    if (s && !vistos.has(plano(s))) vistos.set(plano(s), s);
  });
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/* ============================================================ LocalAdapter ==
   Implementación actual: localStorage bajo la clave 'cajas.v1'.
   Si el navegador no deja escribir (Safari privado, cuota, iframe), la app
   sigue funcionando en memoria durante la sesión: nunca se rompe por esto. */
function LocalAdapter() {
  const eventos = new EventTarget();
  let estado = cargar();

  function cargar() {
    let bruto = null;
    try {
      bruto = localStorage.getItem(CLAVE);
    } catch (e) { /* sin almacenamiento: seguimos en memoria */ }

    if (bruto) {
      try {
        const d = JSON.parse(bruto);
        if (d && Array.isArray(d.cajas) && Array.isArray(d.items) && Array.isArray(d.stock)) {
          return d;
        }
      } catch (e) { /* JSON corrupto: volvemos a sembrar */ }
    }
    const fresco = semilla();
    guardar(fresco);
    return fresco;
  }

  function guardar(d) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(d || estado));
    } catch (e) { /* mejor esfuerzo: la sesión sigue viva en memoria */ }
  }

  function emitir(tipo, detalle) {
    guardar();
    eventos.dispatchEvent(new CustomEvent('cambio', { detail: { tipo, ...detalle } }));
  }

  /* ------------------------------------------------------------- cajas -- */
  function listarCajas() {
    return estado.cajas.slice().sort(porNum).map(copia);
  }

  function caja(id) {
    return copia(estado.cajas.find(c => c.id === id));
  }

  /* `num` sin pasar (o null) = ponle el siguiente. `num: ''` es una decisión:
     una caja sin número, o sea lo que está sin clasificar en su sitio. */
  function crearCaja({ num, nombre = '', ubicacion = '' } = {}) {
    const nueva = {
      id: nuevoId('caja'),
      num: num === undefined || num === null ? siguienteNum() : String(num).trim(),
      nombre: String(nombre || ''),
      ubicacion: String(ubicacion || ''),
      orden: null
    };
    estado.cajas.push(nueva);
    emitir('caja-creada', { cajaId: nueva.id });
    return copia(nueva);
  }

  /* Sugerencia de número para la caja siguiente (la pantalla "Nueva caja"
     la muestra ya rellenada; el usuario manda y puede repetir). */
  function siguienteNum() {
    const mayor = estado.cajas.reduce((m, c) => Math.max(m, parseInt(c.num, 10) || 0), 0);
    return String(mayor + 1).padStart(2, '0');
  }

  function actualizarCaja(id, cambios = {}) {
    const c = estado.cajas.find(x => x.id === id);
    if (!c) return null;
    if (cambios.num !== undefined) c.num = String(cambios.num);
    if (cambios.nombre !== undefined) c.nombre = String(cambios.nombre);
    if (cambios.ubicacion !== undefined) c.ubicacion = String(cambios.ubicacion);
    emitir('caja-actualizada', { cajaId: id });
    return copia(c);
  }

  /* La caja se va y se lleva su stock por delante, pero NO el catálogo: los
     ítems que sólo estaban aquí se quedan sin ubicar, que es lo que ha
     pasado de verdad (siguen existiendo, ya no sabes dónde). */
  function eliminarCaja(id) {
    const i = estado.cajas.findIndex(c => c.id === id);
    if (i < 0) return false;
    estado.cajas.splice(i, 1);
    estado.stock = estado.stock.filter(s => s.cajaId !== id);
    emitir('caja-eliminada', { cajaId: id });
    return true;
  }

  /* ------------------------------------------------------------- ítems -- */
  function listarItems() {
    return estado.items.map(copia);
  }

  function item(id) {
    return copia(estado.items.find(i => i.id === id));
  }

  function crearItem({ nombre = '', emoji = '🏷️', suministro = false, foto = '' } = {}) {
    const nuevo = {
      id: nuevoId('item'),
      nombre: String(nombre || ''),
      emoji: String(emoji || '🏷️'),
      suministro: !!suministro,
      foto: String(foto || '')
    };
    estado.items.push(nuevo);
    emitir('item-creado', { itemId: nuevo.id });
    return copia(nuevo);
  }

  /* Cambiar el ítem en sí (no dónde está): nombre, emoji, tipo o foto.
     `foto: ''` quita la foto y devuelve el mando al emoji. */
  function actualizarItem(id, cambios = {}) {
    const it = estado.items.find(x => x.id === id);
    if (!it) return null;
    if (cambios.nombre !== undefined) it.nombre = String(cambios.nombre);
    if (cambios.emoji !== undefined) it.emoji = String(cambios.emoji || '🏷️');
    if (cambios.suministro !== undefined) it.suministro = !!cambios.suministro;
    if (cambios.foto !== undefined) it.foto = String(cambios.foto || '');
    emitir('item-actualizada', { itemId: id });
    return copia(it);
  }

  /* Baja del catálogo: el ítem desaparece de todas las cajas a la vez. */
  function eliminarItem(id) {
    const i = estado.items.findIndex(x => x.id === id);
    if (i < 0) return false;
    estado.items.splice(i, 1);
    estado.stock = estado.stock.filter(s => s.itemId !== id);
    emitir('item-eliminado', { itemId: id });
    return true;
  }

  function buscarItems(texto) {
    const q = plano(String(texto || '').trim());
    if (!q) return listarItems();
    return estado.items.filter(i => plano(i.nombre).includes(q)).map(copia);
  }

  /* ------------------------------------------------------------- stock -- */
  /* El orden que haya puesto el usuario manda; lo que aún no ha tocado va
     detrás, en el orden del catálogo. */
  function porOrden(a, b) {
    const oa = a.orden, ob = b.orden;
    if (oa == null && ob == null) return 0;
    if (oa == null) return 1;
    if (ob == null) return -1;
    return oa - ob;
  }

  function stockDeCaja(cajaId) {
    return estado.stock
      .filter(s => s.cajaId === cajaId)
      .slice()
      .sort(porOrden)
      .map(s => ({ item: item(s.itemId), cantidad: s.cantidad }))
      .filter(l => l.item);
  }

  function puedeOrdenar() { return true; }
  function puedeOrdenarCajas() { return true; }

  /* Los ids que llegan son los de UN grupo (un sitio): el índice es relativo
     a él, y la home agrupa después de ordenar. */
  function ordenarCajas(cajaIds) {
    cajaIds.forEach((id, i) => {
      const c = estado.cajas.find(x => x.id === id);
      if (c) c.orden = i;
    });
    emitir('orden', {});
  }

  function ordenarCaja(cajaId, itemIds) {
    itemIds.forEach((itemId, i) => {
      const linea = estado.stock.find(s => s.cajaId === cajaId && s.itemId === itemId);
      if (linea) linea.orden = i;
    });
    emitir('orden', { cajaId });
  }

  function stockDeItem(itemId) {
    return estado.stock
      .filter(s => s.itemId === itemId)
      .map(s => ({ caja: caja(s.cajaId), cantidad: s.cantidad }))
      .filter(l => l.caja)
      .sort((a, b) => porNum(a.caja, b.caja));
  }

  /* cantidad <= 0 quita la relación. Devuelve la cantidad resultante (0 si se
     ha quitado). Los ítems únicos se guardan igual, siempre con cantidad 1. */
  function ponerStock(itemId, cajaId, cantidad) {
    const n = Math.max(0, Math.round(Number(cantidad) || 0));
    const i = estado.stock.findIndex(s => s.itemId === itemId && s.cajaId === cajaId);
    if (n === 0) {
      if (i >= 0) estado.stock.splice(i, 1);
      emitir('stock', { itemId, cajaId, cantidad: 0 });
      return 0;
    }
    if (i >= 0) estado.stock[i].cantidad = n;
    else estado.stock.push({ itemId, cajaId, cantidad: n });
    emitir('stock', { itemId, cajaId, cantidad: n });
    return n;
  }

  /* ---------------------------------------------------------- eventos --- */
  function suscribir(fn) {
    const manejador = e => fn(e.detail);
    eventos.addEventListener('cambio', manejador);
    return () => eventos.removeEventListener('cambio', manejador);
  }

  /* Sólo para desarrollo: vuelve a la semilla. */
  function reiniciar() {
    estado = semilla();
    emitir('reiniciado', {});
  }

  return {
    listarCajas, caja, crearCaja, actualizarCaja, eliminarCaja, siguienteNum,
    listarItems, item, crearItem, actualizarItem, eliminarItem, buscarItems,
    stockDeCaja, stockDeItem, ponerStock, ordenarCaja, puedeOrdenar,
    ordenarCajas, puedeOrdenarCajas,
    suscribir, eventos, reiniciar
  };
}

/* ------------------------------------------------------------- elección ----
   La única decisión de este fichero, y la única línea que hay que mirar si
   algún día el almacén no es el que se esperaba. Sin configuración de
   Supabase no se toca la red ni se instancia nada de la nube. */
export const datos = hayNube() ? SupabaseAdapter() : LocalAdapter();

export default datos;
