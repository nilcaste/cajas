/* =============================================================================
   Cajas — arranque y router
   =============================================================================
   SPA vanilla, sin build ni dependencias. Router por hash para que la carpeta
   se pueda servir en estático (Cloudflare Pages) sin reglas de reescritura:
   el QR de una caja apunta a  https://…/#/caja/<id>  y abre esa pantalla.

   RUTAS
     #/                     home (pestañas Cajas / Inventario)
     #/caja/:id             contenido de una caja
     #/item/:id             un ítem del catálogo y dónde está
     #/anadir?caja=<id>     añadir ítem (sin ?caja= hay que elegir destino)
     #/crear?nombre=&caja=  alta nueva en el catálogo
     #/editar/:id           editar un ítem (nombre, emoji, foto, tipo)
     #/ajustes/:id          ajustes de una caja
     #/nueva                nueva caja

   Cada vista es un módulo de js/vistas/ que exporta:
     export function render(params) -> Node | Promise<Node>
     export function destruir()      (opcional, para soltar listeners globales)

   `params` mezcla los parámetros de ruta (:id) y los de la query del hash.
   ========================================================================== */

import { PUERTA } from './config.js';
import { datos } from './datos.js';
import { nube } from './supabase-adapter.js';
import { cerrarToast, reducida, toast } from './ui.js';

export const RUTAS = [
  { nombre: 'home',    patron: '/',            modulo: './vistas/home.js' },
  { nombre: 'caja',    patron: '/caja/:id',    modulo: './vistas/caja.js' },
  { nombre: 'item',    patron: '/item/:id',    modulo: './vistas/item.js' },
  { nombre: 'anadir',  patron: '/anadir',      modulo: './vistas/anadir.js',  modal: true },
  { nombre: 'crear',   patron: '/crear',       modulo: './vistas/crear.js',   modal: true },
  { nombre: 'editar',  patron: '/editar/:id',  modulo: './vistas/editar.js',  modal: true },
  { nombre: 'ajustes', patron: '/ajustes/:id', modulo: './vistas/ajustes.js', modal: true },
  { nombre: 'nueva',   patron: '/nueva',       modulo: './vistas/nueva.js',   modal: true }
];

/* La puerta no está en RUTAS a propósito: no se llega a ella por hash, la
   impone el router cuando hay nube y no hay sesión. Así el QR de una caja
   sigue siendo la URL de la caja aunque haya que pasar por aquí. */
const ACCESO = { nombre: 'acceso', patron: '/acceso', modulo: './vistas/acceso.js' };

/* ¿Hay que enseñar la puerta? Sin configuración de Supabase, nunca.
   Mientras Supabase despierta —o si no hay red para cargarlo siquiera— vale
   el recuerdo de este navegador: abrir la app en el trastero sin cobertura
   tiene que enseñar el almacén, no un formulario que no puede funcionar. */
function cerrado() {
  if (!PUERTA) return false;
  if (!nube.activa) return false;
  if (nube.sesion()) return false;
  return !(nube.despertando && nube.recuerdaSesion());
}

const contenedor = document.getElementById('vista');

/* ------------------------------------------------------------ navegación -- */

/* navegar('/caja/caja-01') · navegar('/anadir', { caja: 'caja-01' })
   Con `reemplazar` no deja rastro en el historial (útil al corregir una ruta
   inválida o al volver de un paso de proceso ya consumido). */
export function navegar(ruta, params = null, { reemplazar = false } = {}) {
  let destino = String(ruta || '/');
  if (params) {
    const q = new URLSearchParams();
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') q.set(k, params[k]);
    });
    const cadena = q.toString();
    if (cadena) destino += (destino.includes('?') ? '&' : '?') + cadena;
  }
  const hash = '#' + (destino.startsWith('/') ? destino : '/' + destino);
  const url = location.pathname + location.search + hash;

  if (reemplazar) {
    history.replaceState({ hondura: hondura() }, '', url);
    pintar();
    return;
  }
  if (location.hash === hash) { pintar(); return; }
  history.pushState({ hondura: hondura() + 1 }, '', url);
  pintar();
}

/* Volver: si en esta sesión ya hemos navegado dentro de la app, atrás de
   verdad (conserva el scroll y la pestaña); si se ha entrado directo por QR,
   a la ruta de reserva. */
/* Cuántas pantallas llevamos apiladas por encima de la primera. Vive en el
   `history.state` y no en una variable suelta: así sobrevive a una recarga y
   no se desincroniza de la pila de verdad del navegador, que es quien manda
   cuando el usuario da a atrás. */
function hondura() {
  return (history.state && Number(history.state.hondura)) || 0;
}

/* Atrás de verdad si hemos llegado navegando; si se ha entrado directo —un
   QR, una recarga— no hay a dónde volver y se sustituye por la reserva. */
export function volver(reserva = '/') {
  if (hondura() > 0) { history.back(); return; }
  navegar(reserva, null, { reemplazar: true });
}

/* --------------------------------------------------- suscripción a datos --
   `alCambiar(fn)` repinta cuando cualquier vista muta el almacén. La
   suscripción se suelta sola al desmontarse la vista: las vistas no tienen
   que acordarse de limpiar.

   Hay DOS juegos de bajas porque hay dos vistas montadas a la vez: la de
   fondo y la del paso de proceso que la tapa. Cada una suelta las suyas
   cuando le toca, y la de fondo sobrevive al proceso (sigue viva debajo,
   repintándose si el proceso toca sus datos). Durante `render()` el router
   apunta las bajas a la capa que está montando. */
let bajasFondo = [];
let bajasProceso = [];
let bajasActivas = bajasFondo;

export function alCambiar(fn) {
  const baja = datos.suscribir(fn);
  bajasActivas.push(baja);
  return baja;
}

/* Igual, para listeners globales (document / window) de una vista. */
export function alSalir(fn) {
  bajasActivas.push(fn);
  return fn;
}

/* Lo que una vista sólo puede hacer cuando su nodo YA está en el documento:
   enfocar un campo, medir, desplazar. Mientras corre `render()` el árbol
   todavía está suelto —el router lo inserta después, y encima dentro de la
   view transition—, así que un `focus()` allí no enfoca nada y un
   `getBoundingClientRect()` mide ceros. */
let altas = [];

export function alMontar(fn) {
  altas.push(fn);
  return fn;
}

function montar() {
  const pendientes = altas;
  altas = [];
  pendientes.forEach(f => { try { f(); } catch (e) { /* un alta rota no bloquea */ } });
}

function soltar(bajas) {
  bajas.forEach(f => { try { f(); } catch (e) { /* una baja rota no bloquea */ } });
  bajas.length = 0;
}

/* ------------------------------------------------------------ resolución -- */

export function resolver(hash) {
  const bruto = String(hash || '').replace(/^#/, '') || '/';
  const corte = bruto.indexOf('?');
  const camino = (corte >= 0 ? bruto.slice(0, corte) : bruto) || '/';
  const query = corte >= 0 ? bruto.slice(corte + 1) : '';
  const trozos = camino.split('/').filter(Boolean);

  for (const ruta of RUTAS) {
    const partes = ruta.patron.split('/').filter(Boolean);
    if (partes.length !== trozos.length) continue;
    const params = {};
    let vale = true;
    for (let i = 0; i < partes.length; i++) {
      if (partes[i].startsWith(':')) params[partes[i].slice(1)] = decodeURIComponent(trozos[i]);
      else if (partes[i] !== trozos[i]) { vale = false; break; }
    }
    if (!vale) continue;
    new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
    return { ruta, params, coincide: true };
  }
  return { ruta: RUTAS[0], params: {}, coincide: camino === '/' };
}

/* ---------------------------------------------------------------- pintar -- */

const cache = new Map();
let pintando = false;

/* Dos capas montadas a la vez:

     #vista          la pantalla de fondo (home, caja, ítem, acceso)
     #capa-proceso   el paso de proceso que la tapa, si lo hay

   El router NO sustituye la vista al abrir un proceso: la deja montada
   debajo, con su scroll y su estado intactos. En móvil la capa es opaca y se
   ve igual que antes; en escritorio es el velo con la tarjeta centrada, que
   es lo que hacía falta para que la modal no flotara sobre el vacío. */
let moduloFondo = null;
let claveFondo = null;      // qué hay montado abajo, para no repintarlo en balde
let moduloProceso = null;
let capa = null;

async function cargar(ruta) {
  if (!cache.has(ruta.nombre)) cache.set(ruta.nombre, import(ruta.modulo));
  return cache.get(ruta.nombre);
}

/* Dos rutas son "la misma pantalla" si coinciden nombre y entidad. */
function claveDe(ruta, params) {
  return ruta.nombre + ':' + (params.id || '');
}

/* Con qué pantalla se tapa el hueco cuando se entra DIRECTO a un paso de
   proceso (un QR, una recarga, un enlace): la de la caja sobre la que va el
   proceso, o la home si no va sobre ninguna. */
function fondoDe(ruta, params) {
  const cajaId = ruta.nombre === 'ajustes' ? params.id : params.caja;
  if (cajaId && datos.caja(cajaId)) {
    return { ruta: RUTAS.find(r => r.nombre === 'caja'), params: { id: cajaId } };
  }
  return { ruta: RUTAS[0], params: {} };
}

function asegurarCapa() {
  if (capa && capa.isConnected) return capa;
  capa = document.createElement('div');
  capa.id = 'capa-proceso';
  /* Clic en el velo = cerrar, como Esc. Sólo cuenta el velo (el clic que cae
     en la capa misma, no en la tarjeta) y sólo en escritorio: en móvil la
     capa es la pantalla entera y ahí no hay velo que tocar. */
  capa.addEventListener('click', e => {
    if (e.target !== capa) return;
    if (!matchMedia('(min-width: 900px)').matches) return;
    salirDelProceso();
  });
  document.body.appendChild(capa);
  return capa;
}

/* La ruta de la pantalla que hay montada debajo, reconstruida de su clave. */
function rutaDelFondo() {
  if (!claveFondo) return '/';
  const corte = claveFondo.indexOf(':');
  const nombre = claveFondo.slice(0, corte);
  const id = claveFondo.slice(corte + 1);
  if (!id || nombre === 'home') return '/';
  return '/' + nombre + '/' + encodeURIComponent(id);
}

/* Terminar un proceso (has añadido el ítem, has creado la caja). Nunca deja
   el modal en la pila: si el destino es justamente la pantalla que había
   debajo, se retrocede; y si es otra, se SUSTITUYE el paso del proceso. Sin
   esto, el atrás de la caja volvía a abrir el modal del que acababas de
   salir, que es lo que hacía la navegación tan rara. */
export function terminarProceso(destino) {
  if (hondura() > 0 && rutaDelFondo() === destino) { history.back(); return; }
  navegar(destino, null, { reemplazar: true });
}

/* Cerrar un proceso (Esc o velo). Si hemos llegado navegando, atrás de
   verdad; si se ha entrado directo —un QR, una recarga—, a la pantalla que
   ya está debajo, que es la que se está viendo tras el velo. Ir a la home
   sería mandar al usuario a un sitio donde no estaba. */
function salirDelProceso() {
  if (hondura() > 0) { volver(); return; }
  navegar(rutaDelFondo(), null, { reemplazar: true });
}

function desmontarProceso() {
  if (moduloProceso && typeof moduloProceso.destruir === 'function') {
    try { moduloProceso.destruir(); } catch (e) { /* seguimos */ }
  }
  soltar(bajasProceso);
  moduloProceso = null;
}

/* Envuelve el cambio de DOM en una view transition del mismo documento: es lo
   que hace el morph del botón + (view-transition-name: boton-anadir). Si el
   navegador no la trae, o el usuario pide menos movimiento, se pinta seco. */
function aplicar(cambio) {
  if (!document.startViewTransition || reducida()) { cambio(); return Promise.resolve(); }
  const transicion = document.startViewTransition(cambio);
  /* Si el navegador se salta la transición (documento oculto, otra ya en
     curso) `ready` rechaza con InvalidStateError. Es inofensivo —el DOM se
     cambia igual—, pero hay que atender los tres para no dejar rechazos sin
     capturar en la consola. */
  transicion.ready.catch(() => {});
  transicion.updateCallbackDone.catch(() => {});
  return transicion.finished.catch(() => {});
}

export async function pintar() {
  if (pintando) return;
  pintando = true;
  try { await pintarAhora(); }
  finally { pintando = false; }
}

/* Se prepara TODO fuera de la transición (cargar módulos y construir nodos,
   que son asíncronos) y se toca el DOM una sola vez dentro: así abrir o
   cerrar un proceso es una única view transition y el morph del + sobrevive. */
async function pintarAhora() {
  /* Un pintado que se quedó a medias (una vista que reventó al renderizar)
     no le deja sus altas al siguiente: apuntan a un nodo que no llegó. */
  altas = [];

  let { ruta, params, coincide } = resolver(location.hash);
  /* Ruta desconocida: enderezamos la URL sin recargar ni disparar hashchange. */
  if (!coincide) history.replaceState(null, '', location.pathname + location.search + '#/');

  /* La puerta gana a cualquier ruta. La URL NO se toca: al entrar, el mismo
     hash lleva a donde ibas (el QR de la caja sigue vivo detrás). */
  if (cerrado()) { ruta = ACCESO; params = {}; }

  const esProceso = !!ruta.modal;
  const fondo = esProceso ? fondoDe(ruta, params) : { ruta, params };

  /* ---- fondo: sólo se repinta si de verdad cambia de pantalla ---------- */
  const claveNueva = claveDe(fondo.ruta, fondo.params);
  const cambiaElFondo = claveNueva !== claveFondo || !moduloFondo;
  let moduloNuevo = null;
  let nodoFondo = null;

  if (cambiaElFondo) {
    try {
      moduloNuevo = await cargar(fondo.ruta);
    } catch (e) {
      console.error('[cajas] no se pudo cargar la vista', fondo.ruta.nombre, e);
      return;
    }
    /* Se desmonta lo viejo ANTES de construir lo nuevo: si no, `soltar()` se
       llevaría por delante las suscripciones que la nueva acaba de registrar. */
    if (moduloFondo && typeof moduloFondo.destruir === 'function') {
      try { moduloFondo.destruir(); } catch (e) { /* seguimos */ }
    }
    soltar(bajasFondo);
    bajasActivas = bajasFondo;
    try {
      nodoFondo = await moduloNuevo.render(fondo.params);
    } catch (e) {
      console.error('[cajas] la vista', fondo.ruta.nombre, 'ha fallado al pintar', e);
      return;
    }
  }

  /* ---- proceso: se monta, se reemplaza (proceso→proceso) o se cierra --- */
  let moduloNuevoProceso = null;
  let nodoProceso = null;

  if (esProceso) {
    try {
      moduloNuevoProceso = await cargar(ruta);
    } catch (e) {
      console.error('[cajas] no se pudo cargar el proceso', ruta.nombre, e);
      return;
    }
    desmontarProceso();
    bajasActivas = bajasProceso;
    try {
      nodoProceso = await moduloNuevoProceso.render(params);
    } catch (e) {
      console.error('[cajas] el proceso', ruta.nombre, 'ha fallado al pintar', e);
      bajasActivas = bajasFondo;
      return;
    }
    bajasActivas = bajasFondo;
  }

  cerrarToast();
  /* Salir de un proceso: se sueltan sus listeners antes de quitarlo de la
     pantalla, para que no le llegue nada a un nodo que ya se va. */
  if (!esProceso) desmontarProceso();

  await aplicar(() => {
    if (cambiaElFondo) {
      contenedor.replaceChildren(nodoFondo);
      contenedor.className = 'vista vista--' + fondo.ruta.nombre;
      /* El scroll se reinicia sólo cuando cambia la pantalla de fondo; al
         abrir o cerrar un proceso se queda donde estaba, que es el sentido
         de no desmontarla. */
      window.scrollTo(0, 0);
    }

    if (esProceso) {
      const marco = document.createElement('div');
      /* Las mismas clases que llevaría #vista: todo el CSS de .vista--modal
         sigue valiendo sin tocar una línea. */
      marco.className = 'vista vista--' + ruta.nombre + ' vista--modal';
      marco.appendChild(nodoProceso);
      const contenedorCapa = asegurarCapa();
      contenedorCapa.replaceChildren(marco);
      contenedorCapa.scrollTop = 0;
    } else if (capa) {
      capa.remove();
      capa = null;
    }

    document.body.classList.toggle('modal', esProceso);
    document.body.dataset.vista = ruta.nombre;

    /* Con el nodo ya en el documento: aquí es donde enfoca quien lo pidió.
       Dentro del cambio y no después, porque `aplicar` no vuelve hasta que
       la transición TERMINA y para entonces ya son cuatro décimas tarde. */
    montar();
  });

  if (cambiaElFondo) { moduloFondo = moduloNuevo; claveFondo = claveNueva; }
  if (esProceso) moduloProceso = moduloNuevoProceso;

}

/* ------------------------------------------------------------ versión ----- */
/* Una pestaña abierta —o la app en la pantalla de inicio, que iOS mantiene
   viva días— se queda con el JavaScript del día que la abriste, y entonces
   los arreglos "no llegan" aunque estén publicados. Al volver a la app se
   pregunta por el índice (que viaja sin caché) y, si la firma ha cambiado,
   se recarga sola.

   Nunca en mitad de un proceso: recargar mientras rellenas un ítem sería
   peor que la enfermedad. */
const VERSION = new URL(import.meta.url).searchParams.get('v') || '';

async function comprobarVersion() {
  if (!VERSION || document.body.classList.contains('modal')) return;
  try {
    const html = await (await fetch('./', { cache: 'no-store' })).text();
    const firma = html.match(/js\/app\.js\?v=([A-Za-z0-9]+)/);
    if (firma && firma[1] !== VERSION) location.reload();
  } catch (e) { /* sin cobertura: se sigue con lo que hay, que para eso está */ }
}

addEventListener('visibilitychange', () => { if (!document.hidden) comprobarVersion(); });
comprobarVersion();

/* --------------------------------------------------------------- zoom ----- */
/* iOS lleva años ignorando `user-scalable=no`, así que el pellizco se corta
   aquí: Safari avisa con sus propios eventos `gesture*` antes de ampliar.
   El doble toque lo para `touch-action` en el CSS. */
['gesturestart', 'gesturechange', 'gestureend'].forEach(nombre => {
  document.addEventListener(nombre, e => e.preventDefault(), { passive: false });
});

/* ------------------------------------------------------------- teclado ---- */
/* Esc cierra un paso de proceso: en escritorio son tarjetas modales sobre el
   velo y ahí Esc es lo que se espera; en móvil equivale a su X. Vive en el
   router y no en cada vista porque es el router quien sabe que la ruta es
   modal, y así lo hereda cualquier paso que se añada después.

   Dos cesiones de paso: si hay una hoja abierta, Esc es suyo (lo gestiona el
   propio <dialog>); y si estás escribiendo en un buscador con texto, Esc
   limpia el campo, que es lo que hace el navegador. */
addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (!document.body.classList.contains('modal')) return;
  if (document.querySelector('dialog[open]')) return;
  const activo = document.activeElement;
  if (activo && activo.type === 'search' && activo.value) return;
  e.preventDefault();
  salirDelProceso();
});

/* ---------------------------------------------------------------- arranque - */

/* `hashchange` cubre los atrás del navegador de toda la vida y `popstate`
   los que provoca `history.back()` sin cambiar el hash. */
addEventListener('hashchange', pintar);
addEventListener('popstate', pintar);

/* ¿Venimos de pulsar el enlace del correo? Supabase deja los tokens en el
   hash (o un `code` en la query) y los recoge al crear el cliente. Si
   pintáramos antes, el router "enderezaría" ese hash y se los llevaría por
   delante: la sesión no llegaría a existir. */
function volviendoDelCorreo() {
  return /access_token=|refresh_token=|error_description=|[?&]code=/
    .test(String(location.hash) + String(location.search));
}

/* Ya recogidos los tokens: la URL vuelve a ser la de la app. */
function limpiarURL() {
  if (volviendoDelCorreo() || !location.hash) {
    history.replaceState(null, '', location.pathname + '#/');
  }
}

function arrancar() {
  /* replaceState y no location.replace: así no se dispara un hashchange que
     pintaría dos veces al arrancar. */
  if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/');

  /* Sin Supabase, exactamente lo de siempre: pintar y ya. */
  if (!nube.activa) { pintar(); return; }

  /* Los toasts de sincronización los pinta el router: el adaptador no conoce
     `ui.js` (importarlo cerraría un ciclo con `datos.js`). */
  datos.eventos.addEventListener('aviso', e => {
    const texto = e.detail && e.detail.texto;
    if (texto) toast(texto);
  });

  let pintado = false;
  let puerta = cerrado();

  const revisar = () => {
    limpiarURL();
    const ahora = cerrado();
    if (pintado && ahora === puerta) return;   // nada que cambiar en pantalla
    puerta = ahora;
    pintado = true;
    pintar();
  };

  nube.alCambiarSesion(revisar);
  nube.listo.then(revisar, revisar);

  /* Mientras Supabase despierta se pinta ya con lo que hay en el espejo.
     Excepción: si venimos del correo hay que dejar la URL quieta hasta que
     Supabase saque los tokens del hash. */
  if (!volviendoDelCorreo()) { pintado = true; pintar(); }
}

arrancar();

/* Atajo de desarrollo: window.cajas.datos en la consola. */
window.cajas = { datos, nube, navegar, pintar, resolver };
