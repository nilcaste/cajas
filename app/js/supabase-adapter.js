/* =============================================================================
   Cajas — adaptador de la nube (local-first)
   =============================================================================
   Desde el 20-10-2026 los DATOS viven en Cloudflare D1, detrás de la API del
   hub (/cajas/api, ver dashboard-hub/functions/cajas/api). Supabase solo
   queda para guardar las FOTOS hasta que se pasen a R2. El nombre del fichero
   se queda para no tocar los imports.
   Cumple EXACTAMENTE la interfaz de `js/datos.js` (síncrona, devuelve copias).
   Las vistas no se enteran de que hay red: leen de una caché en memoria y
   escriben en ella; el viaje a Supabase pasa por detrás.

   ---------------------------------------------------------------------------
   CÓMO FUNCIONA
   ---------------------------------------------------------------------------
   · Caché en memoria con la MISMA forma que el almacén local
     ({ cajas, items, stock }) y espejo en localStorage 'cajas.v1', para que la
     app pinte al instante al abrir y siga funcionando sin cobertura.
   · LECTURAS: siempre de la caché. Nunca esperan a la red.
   · MUTACIONES: se aplican en caché + espejo, emiten 'cambio' y se ENCOLAN.
     La cola se vacía en orden, con reintentos y respaldo en localStorage
     ('cajas.cola'): un cambio hecho en el metro se sube al salir.
   · ARRANQUE: pull completo → reconcilia la caché (y vuelve a aplicar encima
     lo que quede en la cola) → emite 'cambio'.
   · REALTIME: suscripción a las tres tablas; lo que toca uno aparece en la
     pantalla del otro. Al (re)suscribirse se hace otro pull, por si se han
     perdido eventos mientras no había red.

   Conflictos: last-write-wins POR LÍNEA. Con dos usuarios en la misma casa
   basta y sobra; el precio (perder un cambio simultáneo sobre la misma fila)
   es invisible en la práctica y no merece ni versiones ni CRDT.

   Los ids se generan en el CLIENTE (crypto.randomUUID), no en la base: así el
   id que ve la vista al crear una caja es ya el definitivo (el QR se puede
   imprimir sin esperar a la red) y local y remoto comparten identidad.

   ---------------------------------------------------------------------------
   DEPENDENCIAS
   ---------------------------------------------------------------------------
   Ninguna instalada. `@supabase/supabase-js` v2 se trae por ESM desde CDN con
   un import DINÁMICO que sólo se dispara si hay configuración: sin Supabase
   este módulo no pide nada a la red ni retrasa el arranque.

   ---------------------------------------------------------------------------
   AVISOS
   ---------------------------------------------------------------------------
   Además de 'cambio', este adaptador emite 'aviso' en `datos.eventos` con
   { texto } cuando algo merece un toast (p. ej. "Sin conexión, se
   sincronizará"). Quien lo pinta es `app.js`; el adaptador no importa `ui.js`
   a propósito (importarlo cerraría un ciclo con `datos.js`).
   ========================================================================== */

import { PUERTA, SUPABASE, hayNube } from './config.js';
import { plano } from './datos.js';

const ESPEJO = 'cajas.v1';
const COLA = 'cajas.cola';
const FUENTE = 'supabase';
const CDN = 'https://esm.sh/@supabase/supabase-js@2';

/* La API de D1. Hace de "cliente": ejecutar() y pull() hablan con ella. */
const API = '/cajas/api';
/* Sin realtime: mientras la pestaña está a la vista se pregunta cada poco. */
const SONDEO = 15000;

async function errorDe(r) {
  const e = new Error('HTTP ' + r.status);
  e.status = r.status;
  return e;
}

const api = {
  async todo() {
    const r = await fetch(API + '/todo', { cache: 'no-store' });
    if (!r.ok) throw await errorDe(r);
    return r.json();
  },
  async enviar(ruta, cuerpo) {
    const r = await fetch(API + '/' + ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cajas': '1' },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) throw await errorDe(r);
  }
};

/* Reintentos de la cola: 1 s, 2 s, 4 s… con techo de 30 s. */
const ESPERA_MIN = 1000;
const ESPERA_MAX = 30000;
/* Un cambio que la base RECHAZA (no es falta de red) se reintenta esto y se
   descarta: si no, una fila imposible bloquearía la cola para siempre. */
const INTENTOS_MAX = 3;

/* ------------------------------------------------------------ utilidades -- */

function copia(o) {
  return o ? { ...o } : null;
}

/* Manda el orden que haya puesto el usuario arrastrando; lo que nunca se ha
   tocado va después, por número, y lo que no tiene número cierra. */
function porNum(a, b) {
  const sinA = a.orden == null, sinB = b.orden == null;
  if (sinA !== sinB) return sinA ? 1 : -1;
  if (!sinA && a.orden !== b.orden) return a.orden - b.orden;
  const va = String(a.num || '').trim();
  const vb = String(b.num || '').trim();
  if (!va !== !vb) return va ? -1 : 1;
  return va.localeCompare(vb, 'es', { numeric: true });
}

/* Ids de cliente. randomUUID pide contexto seguro (https o localhost); si no
   lo hay, se compone un v4 a mano para no dejar la app sin ids. */
function uuid() {
  try {
    if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (globalThis.crypto && crypto.getRandomValues) {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = [...b].map(n => n.toString(16).padStart(2, '0')).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' +
             h.slice(16, 20) + '-' + h.slice(20);
    }
  } catch (e) { /* seguimos a la reserva pobre */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function leerJSON(clave) {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto ? JSON.parse(bruto) : null;
  } catch (e) { return null; }
}

function guardarJSON(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); }
  catch (e) { /* mejor esfuerzo: la sesión sigue viva en memoria */ }
}

/* Un fallo de red se reintenta eternamente; uno de datos (PostgREST responde
   con `code`, o el status es 4xx) es culpa nuestra y no se arregla insistiendo. */
function esDeDatos(error) {
  if (!error) return false;
  if (typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) return true;
  const s = Number(error.status || 0);
  return s >= 400 && s < 500;
}

/* --------------------------------------------------- fila ⇄ objeto de app -- */
/* La base habla snake_case; la app, el modelo de siempre. */

function aCaja(f) {
  return { id: f.id, num: String(f.num == null ? '' : f.num),
           nombre: String(f.nombre == null ? '' : f.nombre),
           ubicacion: String(f.ubicacion == null ? '' : f.ubicacion),
           orden: f.orden == null ? null : Number(f.orden) };
}

function aItem(f) {
  return { id: f.id, nombre: String(f.nombre == null ? '' : f.nombre),
           emoji: String(f.emoji == null ? '🏷️' : f.emoji),
           suministro: !!f.suministro,
           foto: String(f.foto == null ? '' : f.foto) };
}

function aLinea(f) {
  return {
    itemId: f.item_id,
    cajaId: f.caja_id,
    cantidad: Number(f.cantidad) || 0,
    orden: f.orden == null ? null : Number(f.orden)
  };
}

function filaCaja(c) {
  const fila = { id: c.id, num: c.num, nombre: c.nombre, ubicacion: c.ubicacion };
  /* `orden` sólo viaja si la base la tiene: mandarla contra una tabla sin la
     columna haría fallar el upsert entero. */
  if (cajasOrdenables) fila.orden = c.orden == null ? null : c.orden;
  return fila;
}

/* Lo mira `sincronizar` en las filas que baja (ver `ordenSoportado`). */
let cajasOrdenables = false;

function filaItem(i) {
  return { id: i.id, nombre: i.nombre, emoji: i.emoji, suministro: i.suministro,
           foto: i.foto || null };
}

/* ============================================================ CLIENTE ====== */
/* Uno solo para toda la app: lo comparten el adaptador y la puerta de acceso. */

let cliente = null;
let promesaCliente = null;

function conseguirCliente() {
  if (promesaCliente) return promesaCliente;
  promesaCliente = import(/* @vite-ignore */ CDN).then(mod => {
    cliente = mod.createClient(SUPABASE.url, SUPABASE.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        /* Implícito y no PKCE: el enlace del correo tiene que funcionar
           aunque se abra en otro navegador del móvil (Mail abre el suyo). */
        flowType: 'implicit'
      }
    });
    return cliente;
  });
  return promesaCliente;
}

/* ============================================================ SESIÓN ======= */

const RECUERDO = 'cajas.sesion';

let sesionActual = null;
let arrancando = hayNube();   // aún no sabemos si hay sesión
let roto = false;             // no se ha podido ni cargar la librería
const oyentesSesion = new Set();

function avisarSesion() {
  oyentesSesion.forEach(fn => { try { fn(sesionActual); } catch (e) { /* uno roto no para al resto */ } });
}

/* Marca de "este navegador tenía sesión". No es una credencial (la de verdad
   la guarda Supabase); sirve para no enseñar la puerta mientras la librería
   despierta, ni cuando no hay red para cargarla. */
function recordarSesion(hay) {
  try {
    if (hay) localStorage.setItem(RECUERDO, '1');
    else localStorage.removeItem(RECUERDO);
  } catch (e) { /* sin almacenamiento */ }
}

async function arrancarSesion() {
  /* Sin puerta no hay sesión que averiguar: el adaptador ya se conectó a la
     API al nacer. Supabase solo se carga si hace falta subir una foto. */
  if (!PUERTA) return null;
  const cli = await conseguirCliente();
  const { data } = await cli.auth.getSession();
  sesionActual = (data && data.session) || null;
  recordarSesion(!!sesionActual);

  cli.auth.onAuthStateChange((evento, sesion) => {
    const habia = !!sesionActual;
    sesionActual = sesion || null;
    recordarSesion(!!sesionActual);
    if (sesionActual) { if (adaptador) adaptador.conectar(api); }
    /* Sin puerta el adaptador vive conectado como `anon`: cerrar sesión no
       lo desengancha, porque nunca dependió de tener una. */
    else if (habia && PUERTA && adaptador) adaptador.desconectar();
    avisarSesion();
  });

  if (sesionActual && adaptador) adaptador.conectar(api);
  return sesionActual;
}

function intentarArranque() {
  return arrancarSesion().then(
    sesion => { arrancando = false; roto = false; return sesion; },
    e => {
      console.error('[cajas] no se ha podido arrancar Supabase', e);
      arrancando = false;
      roto = true;
      /* Sin librería no hay cliente: se deja el hueco abierto para volver a
         intentarlo cuando haya cobertura. Mientras tanto la app trabaja
         contra el espejo y la cola. */
      promesaCliente = null;
      addEventListener('online', () => {
        arrancando = true;
        intentarArranque().then(avisarSesion, avisarSesion);
      }, { once: true });
      return null;
    }
  );
}

export const nube = {
  /* ¿Hay configuración? Es lo que decide TODO: adaptador, puerta y pie. */
  activa: hayNube(),

  /* Resuelve cuando ya se sabe si hay sesión o no. `app.js` la espera antes
     de dar por cerrada la puerta, para no enseñársela a quien ya está dentro. */
  listo: hayNube() ? intentarArranque() : Promise.resolve(null),

  sesion() { return sesionActual; },

  /* ¿Estamos todavía averiguándolo, o nos hemos quedado sin librería? */
  get despertando() { return arrancando || roto; },

  recuerdaSesion() {
    try { return localStorage.getItem(RECUERDO) === '1'; } catch (e) { return false; }
  },

  correo() {
    return (sesionActual && sesionActual.user && sesionActual.user.email) || '';
  },

  /* Enlace mágico. `shouldCreateUser: false` para que un correo que no sea uno
     de los dos de casa reciba un error en vez de un alta silenciosa. */
  async enviarEnlace(correo) {
    const cli = await conseguirCliente();
    const { error } = await cli.auth.signInWithOtp({
      email: String(correo || '').trim(),
      options: {
        emailRedirectTo: location.origin + location.pathname,
        shouldCreateUser: false
      }
    });
    if (error) throw error;
    return true;
  },

  /* Sube una foto ya reducida al bucket público `fotos` y devuelve su URL.
     El nombre lo pone el reloj más un pellizco de azar: no hace falta que
     signifique nada, sólo que no choque con otro. */
  async subirFoto(blob) {
    const cli = await conseguirCliente();
    const tipo = blob.type || 'image/jpeg';
    /* La extensión sale del tipo: las fotos son JPEG y los recortes, WebP
       (o PNG si el navegador no sabe escribir WebP). */
    const extension = { 'image/png': '.png', 'image/webp': '.webp' }[tipo] || '.jpg';
    const nombre = Date.now().toString(36) + '-' +
                   Math.random().toString(36).slice(2, 8) + extension;
    const { error } = await cli.storage.from('fotos').upload(nombre, blob, {
      contentType: tipo,
      cacheControl: '31536000'
    });
    if (error) throw error;
    const { data } = cli.storage.from('fotos').getPublicUrl(nombre);
    return data.publicUrl;
  },

  async salir() {
    const cli = await conseguirCliente();
    await cli.auth.signOut();
  },

  alCambiarSesion(fn) {
    oyentesSesion.add(fn);
    return () => oyentesSesion.delete(fn);
  }
};

/* ====================================================== SupabaseAdapter ==== */

let adaptador = null;   // el vivo, para que la sesión pueda avisarle

export function SupabaseAdapter() {
  const eventos = new EventTarget();

  let estado = leerEspejo();
  let cola = leerCola();
  let cli = null;              // cliente CON sesión; null = trabajamos offline
  let sondeo = null;
  let procesando = false;
  let reintento = null;
  let esperaActual = ESPERA_MIN;
  let avisado = false;         // el toast de "sin conexión" sale una vez

  /* ------------------------------------------------------------ espejo -- */
  /* Se marca con `fuente` para no confundirlo con el almacén del modo local:
     si el espejo trae los datos de prueba de LocalAdapter, se ignora (que la
     semilla de demostración no se cuele como si fuera el almacén compartido). */
  function leerEspejo() {
    const d = leerJSON(ESPEJO);
    if (d && d.fuente === FUENTE &&
        Array.isArray(d.cajas) && Array.isArray(d.items) && Array.isArray(d.stock)) {
      return { cajas: d.cajas, items: d.items, stock: d.stock };
    }
    return { cajas: [], items: [], stock: [] };
  }

  function guardarEspejo() {
    guardarJSON(ESPEJO, { version: 1, fuente: FUENTE, ...estado });
  }

  function leerCola() {
    const c = leerJSON(COLA);
    return Array.isArray(c) ? c : [];
  }

  function guardarCola() {
    guardarJSON(COLA, cola);
  }

  function emitir(tipo, detalle) {
    guardarEspejo();
    eventos.dispatchEvent(new CustomEvent('cambio', { detail: { tipo, ...detalle } }));
  }

  function avisar(texto) {
    eventos.dispatchEvent(new CustomEvent('aviso', { detail: { texto } }));
  }

  /* ============================================================ LECTURAS ==
     Calcadas de LocalAdapter: misma firma, mismo orden, mismas copias. Si
     alguna vez cambia el contrato, cambia en los DOS sitios. */

  function listarCajas() {
    return estado.cajas.slice().sort(porNum).map(copia);
  }

  function caja(id) {
    return copia(estado.cajas.find(c => c.id === id));
  }

  function listarItems() {
    return estado.items.map(copia);
  }

  function item(id) {
    return copia(estado.items.find(i => i.id === id));
  }

  function buscarItems(texto) {
    const q = plano(String(texto || '').trim());
    if (!q) return listarItems();
    return estado.items.filter(i => plano(i.nombre).includes(q)).map(copia);
  }

  /* El orden que haya puesto el usuario manda; lo que aún no ha tocado va
     detrás, en el orden del catálogo. */
  function porOrden(a, b) {
    const oa = a.orden, ob = b.orden;
    if (oa == null && ob == null) return 0;
    if (oa == null) return 1;
    if (ob == null) return -1;
    return oa - ob;
  }

  /* La columna `orden` es reciente. En vez de una bandera que haya que
     recordar cambiar, se mira lo que devuelve la base: si las filas traen
     `orden`, la caja se puede reordenar; si no, el gesto ni se ofrece. En
     cuanto la columna exista, la app se entera sola en la primera sincronía. */
  let ordenSoportado = false;
  function puedeOrdenar() { return ordenSoportado; }
  function puedeOrdenarCajas() { return cajasOrdenables; }

  /* Reordenar la retícula. Los ids que llegan son los de UN grupo (un sitio),
     así que el índice es relativo a él: la home agrupa después de ordenar y
     dentro de cada grupo el orden relativo se conserva. */
  function ordenarCajas(cajaIds) {
    if (!cajasOrdenables) return;
    cajaIds.forEach((id, i) => {
      const c = estado.cajas.find(x => x.id === id);
      if (!c || c.orden === i) return;
      c.orden = i;
      encolar({ clave: 'cajas:' + id, tabla: 'cajas', tipo: 'upsert', fila: filaCaja(c) });
    });
    emitir('orden', {});
  }

  function ordenarCaja(cajaId, itemIds) {
    if (!ordenSoportado) return;
    itemIds.forEach((itemId, i) => {
      const linea = estado.stock.find(s => s.cajaId === cajaId && s.itemId === itemId);
      if (!linea || linea.orden === i) return;
      linea.orden = i;
      encolar({
        clave: 'stock:' + itemId + ':' + cajaId, tabla: 'stock', tipo: 'upsert',
        fila: { item_id: itemId, caja_id: cajaId, cantidad: linea.cantidad, orden: i }
      });
    });
    emitir('orden', { cajaId });
  }

  function stockDeCaja(cajaId) {
    return estado.stock
      .filter(s => s.cajaId === cajaId)
      .slice()
      .sort(porOrden)
      .map(s => ({ item: item(s.itemId), cantidad: s.cantidad }))
      .filter(l => l.item);
  }

  function stockDeItem(itemId) {
    return estado.stock
      .filter(s => s.itemId === itemId)
      .map(s => ({ caja: caja(s.cajaId), cantidad: s.cantidad }))
      .filter(l => l.caja)
      .sort((a, b) => porNum(a.caja, b.caja));
  }

  function siguienteNum() {
    const mayor = estado.cajas.reduce((m, c) => Math.max(m, parseInt(c.num, 10) || 0), 0);
    return String(mayor + 1).padStart(2, '0');
  }

  /* =========================================================== ESCRITURAS ==
     Optimistas: caché + espejo + 'cambio' YA, y la red cuando pueda. */

  function crearCaja({ num, nombre = '', ubicacion = '' } = {}) {
    const nueva = {
      id: uuid(),
      num: num === undefined || num === null ? siguienteNum() : String(num).trim(),
      nombre: String(nombre || ''),
      ubicacion: String(ubicacion || ''),
      orden: null
    };
    estado.cajas.push(nueva);
    encolar({ clave: 'cajas:' + nueva.id, tabla: 'cajas', tipo: 'upsert', fila: filaCaja(nueva) });
    emitir('caja-creada', { cajaId: nueva.id });
    return copia(nueva);
  }

  function actualizarCaja(id, cambios = {}) {
    const c = estado.cajas.find(x => x.id === id);
    if (!c) return null;
    if (cambios.num !== undefined) c.num = String(cambios.num);
    if (cambios.nombre !== undefined) c.nombre = String(cambios.nombre);
    if (cambios.ubicacion !== undefined) c.ubicacion = String(cambios.ubicacion);
    encolar({ clave: 'cajas:' + c.id, tabla: 'cajas', tipo: 'upsert', fila: filaCaja(c) });
    emitir('caja-actualizada', { cajaId: id });
    return copia(c);
  }

  /* La caja se lleva su stock (la FK es `on delete cascade`), pero NO el
     catálogo: sus ítems se quedan sin ubicar. */
  function eliminarCaja(id) {
    const i = estado.cajas.findIndex(c => c.id === id);
    if (i < 0) return false;
    estado.cajas.splice(i, 1);
    estado.stock = estado.stock.filter(s => s.cajaId !== id);
    olvidarStockDe('caja_id', id);
    encolar({ clave: 'cajas:' + id, tabla: 'cajas', tipo: 'borrar', fila: { id } });
    emitir('caja-eliminada', { cajaId: id });
    return true;
  }

  function crearItem({ nombre = '', emoji = '🏷️', suministro = false, foto = '' } = {}) {
    const nuevo = {
      id: uuid(),
      nombre: String(nombre || ''),
      emoji: String(emoji || '🏷️'),
      suministro: !!suministro,
      foto: String(foto || '')
    };
    estado.items.push(nuevo);
    encolar({ clave: 'items:' + nuevo.id, tabla: 'items', tipo: 'upsert', fila: filaItem(nuevo) });
    emitir('item-creado', { itemId: nuevo.id });
    return copia(nuevo);
  }

  /* Cambiar el ítem en sí (no dónde está). `foto: ''` vuelve al emoji. */
  function actualizarItem(id, cambios = {}) {
    const it = estado.items.find(x => x.id === id);
    if (!it) return null;
    if (cambios.nombre !== undefined) it.nombre = String(cambios.nombre);
    if (cambios.emoji !== undefined) it.emoji = String(cambios.emoji || '🏷️');
    if (cambios.suministro !== undefined) it.suministro = !!cambios.suministro;
    if (cambios.foto !== undefined) it.foto = String(cambios.foto || '');
    encolar({ clave: 'items:' + it.id, tabla: 'items', tipo: 'upsert', fila: filaItem(it) });
    emitir('item-actualizada', { itemId: id });
    return copia(it);
  }

  /* Baja del catálogo: desaparece de todas las cajas de golpe (en la base lo
     hace el `on delete cascade` de stock, aquí lo hacemos a mano). */
  function eliminarItem(id) {
    const i = estado.items.findIndex(x => x.id === id);
    if (i < 0) return false;
    estado.items.splice(i, 1);
    estado.stock = estado.stock.filter(s => s.itemId !== id);
    olvidarStockDe('item_id', id);
    encolar({ clave: 'items:' + id, tabla: 'items', tipo: 'borrar', fila: { id } });
    emitir('item-eliminado', { itemId: id });
    return true;
  }

  /* Las líneas de stock que esperaban en la cola sobran: el cascade se las va
     a llevar igual, y si el padre no llegó a existir (creado y borrado sin
     cobertura) intentarlas sólo daría un error de clave ajena. Se van ANTES
     de encolar el borrado, para no tocar el que acabamos de poner. */
  function olvidarStockDe(campo, id) {
    const antes = cola.length;
    cola = cola.filter(o => !(o.tabla === 'stock' && o.fila[campo] === id));
    if (cola.length !== antes) guardarCola();
  }

  function ponerStock(itemId, cajaId, cantidad) {
    const n = Math.max(0, Math.round(Number(cantidad) || 0));
    const i = estado.stock.findIndex(s => s.itemId === itemId && s.cajaId === cajaId);
    const clave = 'stock:' + itemId + ':' + cajaId;

    if (n === 0) {
      if (i >= 0) estado.stock.splice(i, 1);
      encolar({ clave, tabla: 'stock', tipo: 'borrar', fila: { item_id: itemId, caja_id: cajaId } });
      emitir('stock', { itemId, cajaId, cantidad: 0 });
      return 0;
    }
    if (i >= 0) estado.stock[i].cantidad = n;
    else estado.stock.push({ itemId, cajaId, cantidad: n, orden: null });
    /* El orden viaja con la fila (si no, tocar el stepper lo borraría), pero
       SOLO si lo hay: una base sin la columna rechazaría la fila entera. */
    const orden = i >= 0 ? estado.stock[i].orden : null;
    const fila = { item_id: itemId, caja_id: cajaId, cantidad: n };
    if (orden != null) fila.orden = orden;
    encolar({ clave, tabla: 'stock', tipo: 'upsert', fila });
    emitir('stock', { itemId, cajaId, cantidad: n });
    return n;
  }

  /* ================================================================ COLA ===
     Orden FIFO. Un cambio nuevo sobre la MISMA fila sustituye al que esperaba
     en su sitio (no se pierde el orden): mantener pulsado el stepper genera
     una operación cada 140 ms y no tiene sentido subirlas todas. */

  function encolar(op) {
    const i = cola.findIndex(o => o.clave === op.clave);
    if (i >= 0) cola[i] = { ...op, intentos: 0 };
    else cola.push({ ...op, intentos: 0 });
    guardarCola();
    procesarCola();
  }

  /* Los borrados son idempotentes: borrar lo que ya no está no es un error
     en la API, así que un reintento de más nunca hace daño. */
  async function ejecutar(op) {
    await cli.enviar(op.tipo === 'borrar' ? 'borrar' : 'upsert', { tabla: op.tabla, fila: op.fila });
  }

  async function procesarCola() {
    if (procesando || !cli || !cola.length) return;
    procesando = true;
    try {
      while (cola.length && cli) {
        const op = cola[0];
        try {
          await ejecutar(op);
        } catch (e) {
          op.intentos = (op.intentos || 0) + 1;
          if (esDeDatos(e) && op.intentos >= INTENTOS_MAX) {
            console.error('[cajas] cambio descartado, la base lo rechaza', op, e);
            cola.shift();
            guardarCola();
            avisar('Un cambio no se ha podido guardar');
            continue;
          }
          guardarCola();
          programarReintento();
          if (!avisado) { avisado = true; avisar('Sin conexión, se sincronizará'); }
          return;
        }
        cola.shift();
        guardarCola();
      }
      /* Cola vacía: se ha recuperado. Silencio, que ya se ve en pantalla. */
      esperaActual = ESPERA_MIN;
      avisado = false;
    } finally {
      procesando = false;
    }
  }

  function programarReintento() {
    if (reintento) return;
    reintento = setTimeout(() => {
      reintento = null;
      procesarCola();
    }, esperaActual);
    esperaActual = Math.min(esperaActual * 2, ESPERA_MAX);
  }

  /* ================================================================ PULL === */

  async function pull() {
    if (!cli) return;
    const datosNube = await cli.todo();
    const rc = { data: datosNube.cajas }, ri = { data: datosNube.items }, rs = { data: datosNube.stock };

    const cajas = (rc.data || []).map(aCaja);
    const items = (ri.data || []).map(aItem);
    const orden = new Map(items.map((it, n) => [it.id, n]));
    /* `stock` no tiene columna de orden propia: lo ordenamos por la posición
       del ítem en el catálogo, que da un "orden de entrada" estable. */
    const stock = (rs.data || []).map(aLinea)
      .sort((a, b) => (orden.get(a.itemId) ?? 1e9) - (orden.get(b.itemId) ?? 1e9));

    /* D1 tiene las dos columnas de orden desde el principio. */
    ordenSoportado = true;
    cajasOrdenables = true;

    const antes = JSON.stringify(estado);
    estado = { cajas, items, stock };
    /* Lo que aún no ha subido manda sobre lo que acabamos de bajar: si no, un
       cambio hecho sin cobertura desaparecería de la pantalla al reconciliar. */
    aplicarCola();
    /* Con sondeo, casi siempre no ha cambiado nada: repintar igualmente
       rehace todas las <img> y se ve como un parpadeo. */
    if (JSON.stringify(estado) === antes) return;
    emitir('sincronizado', {});
  }

  function aplicarCola() {
    cola.forEach(op => {
      if (op.tabla === 'stock') {
        const l = aLinea(op.fila);
        const i = estado.stock.findIndex(s => s.itemId === l.itemId && s.cajaId === l.cajaId);
        if (op.tipo === 'borrar') { if (i >= 0) estado.stock.splice(i, 1); return; }
        if (i >= 0) estado.stock[i] = l; else estado.stock.push(l);
        return;
      }

      const esCaja = op.tabla === 'cajas';
      const lista = esCaja ? estado.cajas : estado.items;
      const i = lista.findIndex(x => x.id === op.fila.id);

      if (op.tipo === 'borrar') {
        if (i >= 0) lista.splice(i, 1);
        estado.stock = esCaja
          ? estado.stock.filter(s => s.cajaId !== op.fila.id)
          : estado.stock.filter(s => s.itemId !== op.fila.id);
        return;
      }

      const fila = esCaja ? aCaja(op.fila) : aItem(op.fila);
      if (i >= 0) lista[i] = fila; else lista.push(fila);
    });
  }

  async function pullDefendido() {
    try {
      await pull();
    } catch (e) {
      console.warn('[cajas] no se ha podido sincronizar todavía', e);
      if (!avisado) { avisado = true; avisar('Sin conexión, se sincronizará'); }
      programarReintento();
    }
  }

  /* ============================================================ REALTIME ===
     Un cambio remoto se aplica sobre la caché y se emite: la home se repinta
     sola. Last-write-wins: lo último que llega, manda. */

  /* Realtime NOS DEVUELVE nuestros propios cambios: escribes 4 unidades y la
     base te cuenta que ahora hay 4 unidades. Si eso se emite como cambio, la
     pantalla se repinta entera por algo que ya sabía — y con ella se rehacen
     todas las <img>, que es justo lo que se ve como un parpadeo al tocar el
     stepper. Por eso cada rama compara antes de tocar el espejo: sólo se
     emite si de verdad ha cambiado algo. */
  function igual(a, b) {
    return a && b && JSON.stringify(a) === JSON.stringify(b);
  }

  function aplicarRemoto(tabla, msg) {
    const nuevo = msg.new && Object.keys(msg.new).length ? msg.new : null;
    const viejo = msg.old && Object.keys(msg.old).length ? msg.old : null;
    let cambio = false;

    if (tabla === 'cajas' || tabla === 'items') {
      const esCaja = tabla === 'cajas';
      const lista = esCaja ? estado.cajas : estado.items;

      if (msg.eventType === 'DELETE') {
        if (!viejo || !viejo.id) return;
        const i = lista.findIndex(x => x.id === viejo.id);
        if (i >= 0) { lista.splice(i, 1); cambio = true; }
        /* El cascade de la base también manda eventos por cada línea de
           stock, pero limpiamos aquí igualmente: el espejo no se puede
           quedar con líneas colgando si alguno de esos eventos se pierde.
           Y ojo, esto va FUERA del `if (i >= 0)`: puede que la fila ya no
           estuviera en la caché y sus líneas sí. */
        const antes = estado.stock.length;
        estado.stock = esCaja
          ? estado.stock.filter(s => s.cajaId !== viejo.id)
          : estado.stock.filter(s => s.itemId !== viejo.id);
        if (estado.stock.length !== antes) cambio = true;
      } else {
        if (!nuevo) return;
        const fila = esCaja ? aCaja(nuevo) : aItem(nuevo);
        const i = lista.findIndex(x => x.id === fila.id);
        if (i >= 0) {
          if (igual(lista[i], fila)) return;   /* el eco de lo nuestro */
          lista[i] = fila;
        } else {
          lista.push(fila);
        }
        cambio = true;
      }
    } else {
      const f = msg.eventType === 'DELETE' ? viejo : nuevo;
      if (!f || !f.item_id || !f.caja_id) return;   // sin replica identity full
      const l = aLinea(f);
      const i = estado.stock.findIndex(s => s.itemId === l.itemId && s.cajaId === l.cajaId);
      if (msg.eventType === 'DELETE') {
        if (i < 0) return;
        estado.stock.splice(i, 1);
      } else if (i >= 0) {
        if (igual(estado.stock[i], l)) return;   /* el eco de lo nuestro */
        estado.stock[i] = l;
      } else {
        estado.stock.push(l);
      }
      cambio = true;
    }

    if (!cambio) return;
    emitir('remoto', { tabla });
  }

  /* D1 no avisa de los cambios: lo que toca el otro aparece en el siguiente
     sondeo (o al volver a la pestaña). Con la cola pendiente no se sondea,
     para no pisar en pantalla lo que aún no ha subido. */
  function escuchar() {
    if (sondeo || !cli) return;
    sondeo = setInterval(() => {
      if (!document.hidden && !cola.length) pullDefendido();
    }, SONDEO);
  }

  /* ======================================================= CONEXIÓN ======== */

  function conectar(clienteConSesion) {
    cli = clienteConSesion;
    pullDefendido();
    escuchar();
    procesarCola();
  }

  function desconectar() {
    clearInterval(sondeo);
    sondeo = null;
    cli = null;
    clearTimeout(reintento);
    reintento = null;
    /* La caché es de la casa, no del navegador: al salir se limpia. Lo que
       quede en la cola sobrevive y sube cuando alguien vuelva a entrar. */
    estado = { cajas: [], items: [], stock: [] };
    emitir('desconectado', {});
  }

  /* La vuelta de la cobertura y la vuelta a la pestaña son los dos momentos
     en que merece la pena reintentar sin esperar al temporizador. */
  addEventListener('online', () => { procesarCola(); pullDefendido(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { procesarCola(); if (cli) pullDefendido(); }
  });

  /* --------------------------------------------------------- eventos ----- */
  function suscribir(fn) {
    const manejador = e => fn(e.detail);
    eventos.addEventListener('cambio', manejador);
    return () => eventos.removeEventListener('cambio', manejador);
  }

  /* En local `reiniciar()` vuelve a la semilla. Aquí eso sería borrar el
     almacén compartido: lo que hace es volver a bajarlo todo. */
  function reiniciar() {
    pullDefendido();
  }

  adaptador = {
    listarCajas, caja, crearCaja, actualizarCaja, eliminarCaja, siguienteNum,
    listarItems, item, crearItem, actualizarItem, eliminarItem, buscarItems,
    stockDeCaja, stockDeItem, ponerStock, ordenarCaja, puedeOrdenar,
    ordenarCajas, puedeOrdenarCajas,
    suscribir, eventos, reiniciar,
    /* fuera de contrato, para la sesión y para depurar */
    conectar, desconectar,
    pendientes: () => cola.length
  };
  /* Sin puerta, a la API desde el primer momento. */
  if (!PUERTA) conectar(api);
  return adaptador;
}

export default SupabaseAdapter;
