/* =============================================================================
   Cajas — helpers de interfaz compartidos
   =============================================================================
   Todo lo que las maquetas repetían en cada página, extraído una sola vez:
   iconos del sistema, toast con deshacer, hoja (dialog), escape de HTML,
   resaltado de coincidencias, autorepetición de steppers y las animaciones
   de entrada/salida de filas.

   Regla de Nil: los iconos son SOLO para la UI. Los ítems van siempre con
   emoji (y algún día con foto), nunca con icono.
   ========================================================================== */

import { plano } from './datos.js';

export { plano };

/* ------------------------------------------------------------------ texto -- */

export function esc(t) {
  return (t == null ? '' : String(t))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* La subcadena que coincide va en <b>. Insensible a mayúsculas y acentos:
   `plano()` conserva la longitud, así que los índices valen sobre el original. */
export function resaltar(nombre, filtro) {
  const texto = String(nombre == null ? '' : nombre);
  const f = plano(String(filtro || '').trim());
  if (!f) return esc(texto);
  const i = plano(texto).indexOf(f);
  if (i < 0) return esc(texto);
  return esc(texto.slice(0, i)) +
    '<b>' + esc(texto.slice(i, i + f.length)) + '</b>' +
    esc(texto.slice(i + f.length));
}

/* Crea un nodo a partir de HTML. `nodo` devuelve el primer elemento;
   `nodos` devuelve un fragmento con todos. */
export function nodo(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function nodos(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content;
}

/* --------------------------------------------------------------- iconos ---- */
/* Trazo del sistema: 2.4 general, 2.6 en FAB/CTA, 2.2 en iconos de detalle.
   Todos sobre lienzo 24×24, sin relleno, con las puntas redondeadas. */

function envolver(contenido, tam, grosor, union) {
  return '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="' + grosor + '" stroke-linecap="round"' +
    (union ? ' stroke-linejoin="round"' : '') + ' aria-hidden="true">' + contenido + '</svg>';
}

const TRAZOS = {
  mas:          { d: '<path d="M12 4.5v15M4.5 12h15"/>', grosor: 2.4, tam: 24 },
  menos:        { d: '<path d="M4.5 12h15"/>', grosor: 2.4, tam: 24 },
  lupa:         { d: '<circle cx="11" cy="11" r="7"/><path d="m20.2 20.2-3.6-3.6"/>', grosor: 2.4, tam: 20 },
  volver:       { d: '<path d="M14.5 5.5 8 12l6.5 6.5"/>', grosor: 2.4, tam: 25, union: true },
  cerrar:       { d: '<path d="M6 6l12 12M18 6 6 18"/>', grosor: 2.4, tam: 24 },
  ajustes:      { d: '<path d="M12.0 1.8 L14.0 2.0 L14.8 5.2 L16.1 5.8 L19.2 4.8 L20.5 6.3 L18.8 9.2 L19.3 10.6 L22.2 12.0 L22.0 14.0 L18.8 14.8 L18.2 16.1 L19.2 19.2 L17.7 20.5 L14.8 18.8 L13.4 19.3 L12.0 22.2 L10.0 22.0 L9.2 18.8 L7.9 18.2 L4.8 19.2 L3.5 17.7 L5.2 14.8 L4.7 13.4 L1.8 12.0 L2.0 10.0 L5.2 9.2 L5.8 7.9 L4.8 4.8 L6.3 3.5 L9.2 5.2 L10.6 4.7 Z"/><circle cx="12" cy="12" r="3.3"/>', grosor: 2.2, tam: 23, union: true },
  sacar:        { d: '<path d="M5.4 8.6h13.2v9.9c0 .9-.7 1.6-1.6 1.6H7c-.9 0-1.6-.7-1.6-1.6z"/><path d="M4 8.6 6.4 4.6h11.2l2.4 4"/><path d="M12 16.4V10.6"/><path d="M9.6 13 12 10.6l2.4 2.4"/>', grosor: 2.2, tam: 22, union: true },
  lapiz:        { d: '<path d="M4.5 16.6 15.8 5.3a2.1 2.1 0 0 1 3 3L7.4 19.5l-3.9.9z"/><path d="M13.9 7.2l2.9 2.9"/>', grosor: 2.2, tam: 22, union: true },
  papelera:     { d: '<path d="M4.5 7h15"/><path d="M9.5 7V5.4c0-.8.6-1.4 1.4-1.4h2.2c.8 0 1.4.6 1.4 1.4V7"/><path d="M6.8 7l.7 11.2c.06 1 .9 1.8 1.9 1.8h5.2c1 0 1.84-.8 1.9-1.8L17.2 7"/><path d="M10.2 11v5.4M13.8 11v5.4"/>', grosor: 2.4, tam: 18, union: true },
  check:        { d: '<path d="M4.5 12.5 10 18 19.5 7"/>', grosor: 2.6, tam: 18, union: true },
  chevron:      { d: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>', grosor: 2.2, tam: 20, union: true },
  chevronAbajo: { d: '<path d="m6 9.5 6 6 6-6"/>', grosor: 2.2, tam: 18, union: true },
  cajaMas:      { d: '<rect x="3.4" y="6.4" width="17.2" height="13.2" rx="3"/><path d="M3.4 10.6h17.2"/><path d="M12 13.2v3.8M10.1 15.1h3.8"/>', grosor: 2.4, tam: 24, union: true },
  emoji:        { d: '<circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01"/><path d="M8.3 14.3q3.7 3.2 7.4 0"/>', grosor: 2.2, tam: 22, union: true },
  camara:       { d: '<path d="M4 8.2c0-1 .8-1.7 1.7-1.7h1.4c.6 0 1.1-.3 1.4-.8l.6-.9c.3-.5.9-.8 1.4-.8h3c.6 0 1.1.3 1.4.8l.6.9c.3.5.9.8 1.4.8h1.4c1 0 1.7.8 1.7 1.7v9c0 1-.8 1.7-1.7 1.7H5.7c-1 0-1.7-.8-1.7-1.7z"/><circle cx="12" cy="12.5" r="3.4"/>', grosor: 2.2, tam: 22, union: true },
  rejilla:      { d: '<rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2.2"/><rect x="13" y="3.5" width="7.5" height="7.5" rx="2.2"/><rect x="3.5" y="13" width="7.5" height="7.5" rx="2.2"/><rect x="13" y="13" width="7.5" height="7.5" rx="2.2"/>', grosor: 2, tam: 21, union: true },
  listado:      { d: '<rect x="3.5" y="4" width="17" height="6.5" rx="2.2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2.2"/>', grosor: 2, tam: 21, union: true },
  qr:           { d: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><path d="M13.5 13.5h3v3h-3zM17 17h3v3h-3z"/>', grosor: 2, tam: 22, union: true }
};

/* icono('mas') · icono('mas', 20, 2.6) para FAB y CTA */
export function icono(nombre, tam, grosor) {
  const t = TRAZOS[nombre];
  if (!t) return '';
  return envolver(t.d, tam || t.tam, grosor || t.grosor, t.union);
}

export const ICONOS = TRAZOS;

/* ----------------------------------------------------------- movimiento ---- */

export function reducida() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* El "pop" de la cifra del stepper. */
export function pop(cifra) {
  if (!cifra || reducida()) return;
  cifra.classList.remove('cifra--pop');
  void cifra.offsetWidth;
  cifra.classList.add('cifra--pop');
}

/* Mantener pulsado repite: primer disparo inmediato, espera 450 ms, luego
   140 ms. El click sintético del teclado (detail 0) no pasa por pointerdown,
   así que se atiende aparte. Devuelve una función para desengancharlo.

   La soltada NO se escucha sólo en el botón: si el dedo se desliza fuera, la
   pestaña se oculta o la ventana pierde el foco, ese `pointerup` no llega
   nunca al botón y la repetición se queda corriendo sola (un toque suelto
   acababa sumando decenas). Se escucha también en la ventana, y se suelta al
   parar para no dejar oyentes vivos. */
const FIN = ['pointerup', 'pointercancel', 'blur'];

export function repetible(boton, accion) {
  let espera = null;
  let repite = null;
  let pulsado = false;

  function parar() {
    clearTimeout(espera);
    clearInterval(repite);
    espera = repite = null;
    if (!pulsado) return;
    pulsado = false;
    FIN.forEach(ev => removeEventListener(ev, parar));
    document.removeEventListener('visibilitychange', siOculta);
  }
  function siOculta() {
    if (document.hidden) parar();
  }
  function abajo(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    parar();                       /* por si quedara algo vivo de antes */
    /* En un documento oculto no hay dedo que mantener: un paso y ya. Si no,
       una soltada que no llega deja la repetición corriendo a ciegas. */
    if (document.hidden) { accion(); return; }
    pulsado = true;
    FIN.forEach(ev => addEventListener(ev, parar));
    document.addEventListener('visibilitychange', siOculta);
    accion();                      /* el primer paso, siempre inmediato */
    espera = setTimeout(() => { repite = setInterval(accion, 140); }, 450);
  }
  function teclado(e) {
    if (e.detail === 0) accion();
  }

  boton.addEventListener('pointerdown', abajo);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => boton.addEventListener(ev, parar));
  boton.addEventListener('click', teclado);

  return () => {
    parar();
    boton.removeEventListener('pointerdown', abajo);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => boton.removeEventListener(ev, parar));
    boton.removeEventListener('click', teclado);
  };
}

/* Salida de fila: colapsa alto, paddings y el hueco del gap, para que las de
   abajo no den el salto. Llama a `alTerminar` cuando la animación acaba. */
export function sacarFila(fila, alTerminar, gap = 10) {
  if (reducida()) { alTerminar(); return; }
  /* En retícula no se puede colapsar la altura: una celda que encoge arrastra
     a toda la cuadrícula. La tarjeta se va apagándose y encogiendo. */
  if (fila.classList.contains('pieza')) {
    fila.style.transition = 'opacity .18s ease, transform .18s ease';
    fila.style.opacity = '0';
    fila.style.transform = 'scale(.9)';
    setTimeout(alTerminar, 200);
    return;
  }
  const alto = fila.offsetHeight;
  fila.style.height = alto + 'px';
  fila.style.overflow = 'hidden';
  void fila.offsetWidth;
  fila.classList.add('fila--fuera');
  fila.style.height = '0px';
  fila.style.paddingTop = '0px';
  fila.style.paddingBottom = '0px';
  if (fila.previousElementSibling) fila.style.marginTop = '-' + gap + 'px';
  else fila.style.marginBottom = '-' + gap + 'px';
  setTimeout(alTerminar, 240);
}

export function limpiarFila(fila) {
  fila.classList.remove('fila--fuera');
  fila.style.height = '';
  fila.style.overflow = '';
  fila.style.paddingTop = '';
  fila.style.paddingBottom = '';
  fila.style.marginTop = '';
  fila.style.marginBottom = '';
  fila.style.transition = '';
  fila.style.opacity = '';
  fila.style.transform = '';
}

/* Entrada de fila. `siguiente` marca dónde reinsertarla (deshacer); sin ella
   va al final. Con `flash` hace el destello de "esto es lo que acabas de
   añadir". */
export function meterFila(lista, fila, siguiente, flash) {
  limpiarFila(fila);
  if (siguiente && siguiente.parentNode === lista) lista.insertBefore(fila, siguiente);
  else lista.appendChild(fila);
  if (reducida()) return;
  fila.classList.add('fila--entrando');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fila.classList.remove('fila--entrando');
    if (flash) {
      fila.classList.remove('fila--flash');
      void fila.offsetWidth;
      fila.classList.add('fila--flash');
    }
  }));
}

/* -------------------------------------------------------------- toast ------ */
/* Uno solo para toda la app; vive fuera del contenedor de vistas para
   sobrevivir a los repintados. `alDeshacer` es opcional: sin él no sale el
   botón. Devuelve una función para cerrarlo antes de tiempo. */

let toastEl = null;
let toastTiempo = null;
let toastAccion = null;

function montarToast() {
  if (toastEl) return toastEl;
  toastEl = nodo(
    '<div class="toast" role="status">' +
      '<span class="toast__texto"></span>' +
      '<span class="sep" aria-hidden="true">·</span>' +
      '<button type="button" class="deshacer">Deshacer</button>' +
    '</div>');
  toastEl.querySelector('.deshacer').addEventListener('click', () => {
    const accion = toastAccion;
    cerrarToast();
    if (accion) accion();
  });
  document.body.appendChild(toastEl);
  return toastEl;
}

export function toast(texto, alDeshacer) {
  const el = montarToast();
  toastAccion = typeof alDeshacer === 'function' ? alDeshacer : null;
  el.querySelector('.toast__texto').textContent = texto;
  el.querySelector('.sep').classList.toggle('oculto', !toastAccion);
  el.querySelector('.deshacer').classList.toggle('oculto', !toastAccion);
  el.classList.add('toast--visible');
  clearTimeout(toastTiempo);
  toastTiempo = setTimeout(cerrarToast, 5000);
  return cerrarToast;
}

export function cerrarToast() {
  clearTimeout(toastTiempo);
  if (toastEl) toastEl.classList.remove('toast--visible');
  toastAccion = null;
}

/* --------------------------------------------------------------- hoja ------ */
/* La hoja del sistema: <dialog> anclado abajo en móvil y centrado en
   escritorio. `contenido` puede ser HTML o un nodo. Se cierra tocando el velo
   y se destruye al cerrarse.

   const { dialog, cerrar } = ui.hoja({ titulo: 'Añadir a otra caja',
                                        contenido: '<div class="hoja__lista">…</div>' }); */
export function hoja({ titulo = '', contenido = '', alCerrar = null } = {}) {
  const dialog = nodo(
    '<dialog class="hoja">' +
      '<div class="hoja__cuerpo">' +
        (titulo ? '<div class="hoja__titulo">' + esc(titulo) + '</div>' : '') +
      '</div>' +
    '</dialog>');
  const cuerpo = dialog.querySelector('.hoja__cuerpo');
  if (contenido instanceof Node) cuerpo.appendChild(contenido);
  else cuerpo.insertAdjacentHTML('beforeend', String(contenido));

  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (alCerrar) alCerrar();
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  return { dialog, cuerpo, cerrar: () => dialog.close() };
}

/* ------------------------------------------------------------- plurales ---- */

export function plural(n, singular, plural_) {
  return n + ' ' + (n === 1 ? singular : plural_);
}

/* ------------------------------------------------------------- buscador ---- */

/* Añade a un `.buscador` su propia aspa de limpiar, con el icono de la casa:
   la del navegador (azul en iOS) no es nuestra y se esconde por CSS.
   Aparece sólo cuando hay texto, y al limpiar devuelve el foco al campo para
   que puedas seguir escribiendo sin volver a tocar. */
export function limpiable(campo) {
  if (!campo) return () => {};
  const boton = nodo(
    `<button type="button" class="buscador__limpiar" aria-label="Limpiar la búsqueda" hidden>
       ${icono('cerrar', 17, 2.4)}
     </button>`);
  campo.after(boton);

  const refrescar = () => { boton.hidden = campo.value.length === 0; };
  campo.addEventListener('input', refrescar);
  boton.addEventListener('click', () => {
    campo.value = '';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.focus();
  });
  refrescar();
  return refrescar;
}

/* ----------------------------------------------------------------- cara ---- */

/* La cara de un ítem: su foto si la tiene, y si no su emoji. Devuelve HTML
   para meter dentro de una tesela, una mini o una celda del mosaico — el
   tamaño y la forma los pone el contenedor, la foto sólo lo rellena. */
export function cara(item) {
  if (item && item.foto) {
    /* `draggable=false`: sin esto el navegador arranca SU arrastre de imagen
       en cuanto pulsas y mueves, y ese cancela el nuestro de reordenar. */
    return '<img class="foto" src="' + esc(item.foto) + '" alt="" draggable="false" loading="lazy">';
  }
  return esc(item ? item.emoji : '');
}

/* ------------------------------------------------------------- teclado ---- */
/* iOS sólo abre el teclado si el foco ocurre dentro del gesto que lo pide, y
   nuestras pantallas tardan un pelo en montarse (cargar el módulo, la
   transición). Truco de toda la vida: en el mismo toque se enfoca un campo
   invisible —el teclado sube— y cuando el de verdad existe se le pasa el
   foco, que eso el teclado ya lo aguanta sin cerrarse.

   El `font-size: 16px` no es decorativo: por debajo, iOS hace zoom al
   enfocar. */
let fantasma = null;

export function precalentarTeclado() {
  soltarFantasma();
  fantasma = document.createElement('input');
  fantasma.type = 'text';
  fantasma.setAttribute('aria-hidden', 'true');
  fantasma.tabIndex = -1;
  fantasma.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;' +
    'padding:0;border:0;outline:0;opacity:0;font-size:16px;z-index:-1;';
  document.body.appendChild(fantasma);
  fantasma.focus({ preventScroll: true });
}

function soltarFantasma() {
  if (!fantasma) return;
  fantasma.remove();
  fantasma = null;
}

/* Pasa el foco al campo de verdad. Primero se enfoca y DESPUÉS se quita el
   fantasma: al revés, el teclado se cerraría en el hueco entre los dos. */
export function entregarTeclado(campo) {
  if (campo) campo.focus({ preventScroll: true });
  soltarFantasma();
}

/* -------------------------------------------------------------- ocupar ---- */
/* Mientras la app trabaja con una foto (prepararla, recortarla, subirla) no
   se puede guardar: el botón se bloquea, gira y dice qué está haciendo.
   Devuelve la función que lo devuelve a su sitio. */
export function ocupar(boton, texto) {
  if (boton.dataset.reposo === undefined) boton.dataset.reposo = boton.innerHTML;
  boton.disabled = true;
  boton.classList.add('cta--trabajando');
  boton.innerHTML = '<span class="cta__giro" aria-hidden="true"></span>' + esc(texto);
  return () => {
    boton.disabled = false;
    boton.classList.remove('cta--trabajando');
    boton.innerHTML = boton.dataset.reposo;
  };
}

/* -------------------------------------------------- selector de sitio ----- */
/* El sitio de una caja —el armario negro, el trastero— se elige de entre los
   que ya existen, porque escribirlo a mano dos veces con una tilde de
   diferencia partiría el grupo en dos. "Otro sitio" abre el campo libre, que
   es como nace el primero de todos.

   Lo usan "Nueva caja" y "Ajustes de la caja", que tienen que ofrecer
   exactamente lo mismo. Devuelve `{ nodo, valor }`. */
export function selectorSitio(valorInicial, sitios) {
  const inicial = String(valorInicial || '').trim();
  const lista = (sitios || []).slice();
  /* El sitio de esta caja puede no estar en la lista todavía (se acaba de
     escribir en otra pantalla, o es el único que lo usa). */
  if (inicial && !lista.some(s => plano(s) === plano(inicial))) lista.unshift(inicial);

  const raiz = nodo(`
    <div>
      <div class="chips-sitio" id="chips">
        <button type="button" class="chip-sitio" data-sitio=""
                aria-pressed="${inicial ? 'false' : 'true'}">Sin sitio</button>
        ${lista.map(s => `
          <button type="button" class="chip-sitio" data-sitio="${esc(s)}"
                  aria-pressed="${plano(s) === plano(inicial) ? 'true' : 'false'}">${esc(s)}</button>`).join('')}
        <button type="button" class="chip-sitio chip-sitio--nuevo" id="otro">
          ${icono('mas', 16, 2.4)} Otro sitio
        </button>
      </div>
      <label class="campo oculto" id="campo-otro">
        <input type="text" id="otro-nombre" placeholder="Cómo se llama el sitio"
               aria-label="Nombre del sitio" autocomplete="off"
               autocorrect="on" autocapitalize="sentences" spellcheck="true">
      </label>
    </div>
  `);

  const chips = raiz.querySelector('#chips');
  const campoOtro = raiz.querySelector('#campo-otro');
  const nombreOtro = raiz.querySelector('#otro-nombre');
  const botonOtro = raiz.querySelector('#otro');
  let escribiendo = false;

  function marcar(boton) {
    [...chips.querySelectorAll('.chip-sitio')].forEach(b =>
      b.setAttribute('aria-pressed', b === boton ? 'true' : 'false'));
  }

  chips.addEventListener('click', e => {
    const boton = e.target.closest('.chip-sitio');
    if (!boton) return;
    if (boton === botonOtro) {
      escribiendo = true;
      marcar(botonOtro);
      campoOtro.classList.remove('oculto');
      nombreOtro.focus();
      return;
    }
    escribiendo = false;
    campoOtro.classList.add('oculto');
    marcar(boton);
  });

  return {
    nodo: raiz,
    valor() {
      if (escribiendo) return nombreOtro.value.trim();
      const elegido = chips.querySelector('.chip-sitio[aria-pressed="true"]');
      return elegido ? (elegido.dataset.sitio || '') : '';
    }
  };
}

/* ----------------------------------------------------------- arrastrable -- */
/* El gesto de reordenar, compartido por la lista de una caja y por la retícula
   de la home. Aquí vive CUÁNDO se arrastra; la geometría —dónde cae cada
   pieza— la pone quien lo llama, porque una lista es una columna y la retícula
   es una cuadrícula.

   Dos gestos distintos según con qué se toca, que es lo que se hacía mal:
     · con el DEDO hay que distinguir arrastrar de hacer scroll, así que se
       exige pulsación larga y quieta;
     · con el RATÓN no hay scroll que confundir: se arrastra en cuanto se
       mueve, que es lo que espera cualquiera. Antes también pedía aguantar
       320 ms sin moverse y por eso no funcionaba nunca en escritorio.

   Devuelve la función que lo desengancha (para `alSalir`). */
export function arrastrable(zona, opciones) {
  const { selector, ignorar = '', puede = () => true, levantar, mover, soltar } = opciones;

  const ESPERA = 260;        /* cuánto hay que aguantar el dedo para levantar  */
  const MOVIDA_DEDO = 14;    /* si te mueves más antes de eso, es un scroll    */
  const MOVIDA_RATON = 5;    /* con ratón, esto YA es un arrastre              */

  let activo = false;
  let reloj = null;

  /* iOS decide si un toque hace scroll ANTES de que levantemos nada, y
     cambiarle `touch-action` a mitad de gesto ya no le afecta: la única forma
     de que la página no se escape bajo el dedo es tragarse el `touchmove`. */
  function tragar(e) { if (activo) e.preventDefault(); }
  document.addEventListener('touchmove', tragar, { passive: false });

  /* Una imagen se arrastra sola —es lo que hace el navegador con cualquier
     <img>— y ese arrastre nativo cancela el nuestro. Como los mosaicos y las
     filas son fotos, sin esto el gesto no llegaba a empezar casi nunca. */
  function nadaDeArrastreNativo(e) { if (e.target.closest(selector)) e.preventDefault(); }
  zona.addEventListener('dragstart', nadaDeArrastreNativo);

  function alPulsar(e) {
    if (!puede() || activo) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (ignorar && e.target.closest(ignorar)) return;
    const pieza = e.target.closest(selector);
    if (!pieza) return;

    const dedo = e.pointerType === 'touch';
    const inicio = { x: e.clientX, y: e.clientY };
    let arrastrado = false;

    function arrancar() {
      activo = true;
      arrastrado = true;
      try { zona.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      document.body.classList.add('reordenando');
      if (dedo && navigator.vibrate) navigator.vibrate(8);
      levantar(pieza, e);
    }

    if (dedo) reloj = setTimeout(arrancar, ESPERA);

    function vigilar(ev) {
      if (activo) { mover(ev); return; }
      const lejos = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
      if (dedo) { if (lejos > MOVIDA_DEDO) clearTimeout(reloj); return; }
      if (lejos > MOVIDA_RATON) { arrancar(); mover(ev); }
    }

    function acabar() {
      clearTimeout(reloj);
      zona.removeEventListener('pointermove', vigilar);
      zona.removeEventListener('pointerup', acabar);
      zona.removeEventListener('pointercancel', acabar);
      if (!activo) return;
      activo = false;
      document.body.classList.remove('reordenando');
      soltar();
      /* El dedo que suelta dispara un `click`: sin tragárselo, soltar una
         tarjeta la abriría. Se traga el siguiente, y si no llega ninguno el
         vigilante se retira solo. */
      if (!arrastrado) return;
      const tragarClic = ev => { ev.stopPropagation(); ev.preventDefault(); quitarClic(); };
      const quitarClic = () => zona.removeEventListener('click', tragarClic, true);
      zona.addEventListener('click', tragarClic, true);
      setTimeout(quitarClic, 350);
    }

    zona.addEventListener('pointermove', vigilar);
    zona.addEventListener('pointerup', acabar);
    zona.addEventListener('pointercancel', acabar);
  }

  zona.addEventListener('pointerdown', alPulsar);

  return () => {
    clearTimeout(reloj);
    document.body.classList.remove('reordenando');
    document.removeEventListener('touchmove', tragar);
    zona.removeEventListener('dragstart', nadaDeArrastreNativo);
    zona.removeEventListener('pointerdown', alPulsar);
  };
}

/* ------------------------------------------------------------- formato ---- */
/* Lista o retícula. Es preferencia de interfaz, como la pestaña: se guarda en
   este navegador y no viaja a la nube — el formato que le va bien a Nil en el
   móvil no tiene por qué ser el de Rafa.

   Y se guarda POR PANTALLA: en Cajas quieres ver las fotos y en Inventario
   quieres leer nombres, así que compartir el ajuste sería peor que no
   tenerlo. */
export const RETICULA = 'reticula';
export const LISTA = 'lista';

export function formato(clave, porDefecto) {
  try {
    const v = localStorage.getItem('cajas.formato.' + clave);
    return v === RETICULA || v === LISTA ? v : porDefecto;
  } catch (e) { return porDefecto; }
}

export function ponerFormato(clave, valor) {
  try { localStorage.setItem('cajas.formato.' + clave, valor); }
  catch (e) { /* sin almacenamiento: sólo durante esta visita */ }
}

/* El botón de la esquina. Enseña el formato AL QUE VAS, no en el que estás:
   es un botón, y un botón dice lo que hace. */
export function pintarConmutador(boton, actual) {
  const aReticula = actual === LISTA;
  boton.innerHTML = icono(aReticula ? 'rejilla' : 'listado');
  boton.setAttribute('aria-label', aReticula ? 'Ver en retícula' : 'Ver en lista');
}

/* ----------------------------------------------------------- reordenable -- */
/* Arrastrar para reordenar, sobre `arrastrable`. Vale igual para una lista y
   para una retícula: en las dos se miden las casillas al levantar y se mira
   sobre cuál está el dedo. Una lista no es más que una retícula de una
   columna, así que no hacen falta dos geometrías.

   `grupo(pieza)` dice qué piezas se ordenan juntas (en la home, las de su
   sitio); `alOrdenar(contenedor, piezas)` recibe el resultado ya colocado. */
export function reordenable(zona, opciones) {
  const { selector, ignorar, puede, levantada = 'levantada', grupo, alOrdenar } = opciones;
  let a = null;

  return arrastrable(zona, {
    selector, ignorar, puede,

    levantar(pieza, e) {
      const cont = grupo ? grupo(pieza) : zona;
      const piezas = [...cont.querySelectorAll(selector)];
      a = {
        cont, piezas, pieza,
        desde: piezas.indexOf(pieza),
        hasta: piezas.indexOf(pieza),
        casillas: piezas.map(p => p.getBoundingClientRect()),
        x0: e.clientX,
        y0: e.clientY
      };
      pieza.classList.add(levantada);
    },

    mover(e) {
      if (!a) return;
      a.pieza.style.transform =
        'translate(' + (e.clientX - a.x0) + 'px, ' + (e.clientY - a.y0) + 'px)';

      /* Sobre qué casilla está el dedo. Fuera de todas, se queda donde estaba. */
      const encima = a.casillas.findIndex(r =>
        e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top && e.clientY <= r.bottom);
      const hasta = encima < 0 ? a.hasta : encima;
      if (hasta === a.hasta) return;
      a.hasta = hasta;

      /* Dónde acaba cada una si la levantada se cuela en `hasta`. */
      const resultado = colocar(a.piezas, a.desde, hasta);
      a.piezas.forEach((p, i) => {
        if (p === a.pieza) return;
        const destino = a.casillas[resultado.indexOf(p)];
        const dx = destino.left - a.casillas[i].left;
        const dy = destino.top - a.casillas[i].top;
        p.style.transform = (dx || dy) ? 'translate(' + dx + 'px, ' + dy + 'px)' : '';
      });
    },

    soltar() {
      if (!a) return;
      const { cont, piezas, pieza, desde, hasta } = a;
      a = null;

      piezas.forEach(p => { p.style.transform = ''; });
      pieza.classList.remove(levantada);
      if (desde === hasta) return;

      /* El DOM se recoloca ahora, de una vez, y el almacén se entera. */
      const resultado = colocar(piezas, desde, hasta);
      resultado.forEach(p => cont.appendChild(p));
      alOrdenar(cont, resultado);
    }
  });
}

function colocar(piezas, desde, hasta) {
  const r = piezas.slice();
  const [pieza] = r.splice(desde, 1);
  r.splice(hasta, 0, pieza);
  return r;
}
