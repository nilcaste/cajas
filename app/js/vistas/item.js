/* =============================================================================
   Vista: item  ·  ruta #/item/:id
   Maqueta de referencia: maquetas/prueba-medkit-objeto.html
   =============================================================================
   El único sitio que enseña la realidad multi-caja: un ítem del catálogo y
   todas las cajas donde está.

     · Cabecera con la cara del ítem —foto si la tiene, si no su emoji— y
       "Suministro · N unidades en M cajas",
       recalculada en cada cambio.
     · Una fila por caja (tesela del número, nombre y ubicación) con su propio
       stepper; los únicos, el botón de sacar de la caja. Al llegar a 0
       la fila colapsa y sale el toast "Quitado · Deshacer".
     · La CTA "Añadir a otra caja" abre la hoja con las cajas donde AÚN no
       está; al elegir una entra con 1 unidad. No participa en el morph del +
       (por eso `.cta--sin-morph`).

   Como en la vista de caja, las mutaciones van por `datos` y la suscripción
   sólo repinta cuando el cambio viene de fuera: lo de aquí se anima a mano.
   ========================================================================== */

import { datos, sinClasificar, sitio } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, alCambiar, alSalir } from '../app.js';
import { irAPestana, PESTANA } from './home.js';

/* Mismo criterio que el almacén: 01, 02, … 10 (y no 1, 10, 2). */
function porNum(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

export function render(params) {
  const inicial = datos.item(params.id);
  if (!inicial) { navegar('/', null, { reemplazar: true }); return document.createElement('div'); }

  const itemId = inicial.id;

  const raiz = ui.nodo(`
    <div>
      <nav class="barra">
        <button type="button" class="icono-btn" id="volver" aria-label="Volver">${ui.icono('volver')}</button>
        <div class="barra__grupo">
          <button type="button" class="icono-btn" id="editar"
                  aria-label="Editar el ítem">${ui.icono('lapiz')}</button>
          <button type="button" class="icono-btn" id="eliminar"
                  aria-label="Eliminar del catálogo">${ui.icono('papelera', 22, 2.4)}</button>
        </div>
      </nav>

      <header class="cabecera cabecera--identidad">
        <button type="button" class="tesela tesela--pulsable" id="cara"
                aria-label="Foto del ítem"></button>
        <button type="button" class="cabecera__editable" id="editar-nombre">
          <h1 id="nombre"></h1>
          <div class="sub" id="sub"></div>
        </button>
      </header>

      <div class="seccion seccion--primera" id="seccion">En estas cajas</div>
      <main class="lista" id="lista"></main>

      <div class="velo-inferior" aria-hidden="true"></div>

      <div class="flotante">
        <button type="button" class="cta cta--sin-morph" id="otra-caja">
          <span aria-hidden="true">${ui.icono('mas', 20, 2.6)}</span>
          Añadir a otra caja
        </button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const lista = $('#lista');
  const seccion = $('#seccion');

  /* Mientras la vista está viva se pueden animar filas; al salir, no. */
  let vivo = true;
  alSalir(() => { vivo = false; });

  /* Los desenganches de `ui.repetible`: si una fila desaparece con el dedo
     encima, hay que parar su intervalo. */
  let sueltas = [];
  function soltarFilas() {
    sueltas.forEach(f => { try { f(); } catch (e) { /* una baja rota no bloquea */ } });
    sueltas = [];
  }
  alSalir(soltarFilas);

  /* Lo que muta esta vista NO dispara repintado: ya se ha animado a mano. */
  let propio = false;
  function mutar(fn) {
    propio = true;
    try { return fn(); } finally { propio = false; }
  }

  /* ------------------------------------------------------------- editar -- */
  /* Todo lo que se escribe o se elige del ítem vive en su propia pantalla:
     aquí sólo se mira y se toca el stock. La cara y el nombre son atajos a
     esa pantalla, que es donde se cambian. */
  const abrirEdicion = () => navegar('/editar/' + encodeURIComponent(itemId));
  $('#cara').addEventListener('click', abrirEdicion);
  $('#editar').addEventListener('click', abrirEdicion);
  $('#editar-nombre').addEventListener('click', abrirEdicion);

  /* ------------------------------------------------------- pintado ------- */
  /* "Suministro · 7 unidades en 3 cajas" — se recalcula desde el almacén en
     cada toque, que es lo que la hace estar viva. */
  function resumen() {
    const item = datos.item(itemId);
    if (!item) return;
    const donde = datos.stockDeItem(itemId);
    const total = donde.reduce((a, l) => a + l.cantidad, 0);
    const cajas = ui.plural(donde.length, 'caja', 'cajas');
    const cuenta = item.suministro
      ? 'Suministro · ' + ui.plural(total, 'unidad', 'unidades') + ' en ' + cajas
      : 'Único en ' + cajas;

    $('#cara').innerHTML = ui.cara(item);
    $('#nombre').textContent = item.nombre;
    $('#sub').textContent = donde.length
      ? cuenta
      : (item.suministro ? 'Suministro' : 'Único') + ' · Sin ubicar';
    /* Sin cajas no hay nada que encabezar. */
    seccion.classList.toggle('oculto', donde.length === 0);
  }

  function filaHTML(caja, cantidad) {
    const item = datos.item(itemId);
    const control = item && item.suministro
      ? `<div class="stepper">
           <button type="button" data-menos aria-label="Quitar una de esta caja">${ui.icono('menos', 18)}</button>
           <span class="cifra">${cantidad}</span>
           <button type="button" data-mas aria-label="Añadir una a esta caja">${ui.icono('mas', 18)}</button>
         </div>`
      : `<button type="button" class="btn-cuadrado" data-quitar
                 aria-label="Sacar de esta caja">${ui.icono('sacar', 20)}</button>`;
    /* Sin número, la tesela de la pegatina no pinta nada: el sitio pasa a
       ser el nombre de la fila y debajo se dice que está sin clasificar. */
    const suelta = sinClasificar(caja);
    return `<article class="fila" data-caja="${ui.esc(caja.id)}" data-num="${ui.esc(caja.num)}">
      ${suelta ? '' : `<span class="num-tesela" aria-hidden="true">${ui.esc(caja.num)}</span>`}
      <div class="texto">
        <div class="nombre">${ui.esc(suelta ? (sitio(caja) || 'Sin sitio') : caja.nombre)}</div>
        <div class="ubi">${ui.esc(suelta ? 'Sin clasificar' : caja.ubicacion)}</div>
      </div>
      ${control}
    </article>`;
  }

  function pintar() {
    if (!datos.item(itemId)) { navegar('/', null, { reemplazar: true }); return; }
    soltarFilas();
    const donde = datos.stockDeItem(itemId);
    lista.innerHTML = donde.map(l => filaHTML(l.caja, l.cantidad)).join('');
    [...lista.children].forEach((fila, i) => engancharFila(fila, donde[i].caja));
    resumen();
  }

  /* ---------------------------------------------------- interacción ------ */
  function quitar(fila, caja, previa) {
    if (fila.dataset.saliendo) return;
    fila.dataset.saliendo = '1';
    ui.sacarFila(fila, () => {
      const siguiente = fila.nextElementSibling;
      fila.remove();
      mutar(() => datos.ponerStock(itemId, caja.id, 0));
      if (!vivo) return;                 /* nos hemos ido: sin toast fantasma */
      resumen();
      ui.toast('Quitado', () => {
        delete fila.dataset.saliendo;
        mutar(() => datos.ponerStock(itemId, caja.id, previa));
        const cifra = fila.querySelector('.cifra');
        if (cifra) cifra.textContent = previa;
        ui.meterFila(lista, fila, siguiente, false);
        resumen();
      });
    });
  }

  function engancharFila(fila, caja) {
    if (!fila.querySelector('.stepper')) {
      fila.querySelector('[data-quitar]')
        .addEventListener('click', () => quitar(fila, caja, 1));
      return;
    }
    const cifra = fila.querySelector('.cifra');
    const leer = () => parseInt(cifra.textContent, 10) || 0;

    function pon(n) {
      if (fila.dataset.saliendo) return;
      if (n <= 0) { quitar(fila, caja, leer()); return; }
      mutar(() => datos.ponerStock(itemId, caja.id, n));
      cifra.textContent = n;
      ui.pop(cifra);
      resumen();
    }

    sueltas.push(ui.repetible(fila.querySelector('[data-menos]'), () => pon(leer() - 1)));
    sueltas.push(ui.repetible(fila.querySelector('[data-mas]'), () => pon(leer() + 1)));
  }

  /* Entra en una caja nueva con 1 unidad, en su sitio por número. */
  function anadirEn(cajaId) {
    const caja = datos.caja(cajaId);
    if (!caja) return;
    if (lista.querySelector(`[data-caja="${CSS.escape(cajaId)}"]`)) return;
    mutar(() => datos.ponerStock(itemId, caja.id, 1));
    const fila = ui.nodo(filaHTML(caja, 1));
    engancharFila(fila, caja);
    const siguiente = [...lista.children].find(f => porNum(f.dataset.num, caja.num) > 0);
    ui.meterFila(lista, fila, siguiente, false);
    resumen();
  }

  function abrirHoja() {
    const dentro = new Set(datos.stockDeItem(itemId).map(l => l.caja.id));
    const libres = datos.listarCajas().filter(c => !dentro.has(c.id));
    const contenido = libres.length
      ? '<div class="hoja__lista">' + libres.map(c =>
          `<button type="button" class="hoja__caja" data-elegir="${ui.esc(c.id)}">` +
            (sinClasificar(c)
              ? `${ui.esc(sitio(c) || 'Sin sitio')} · sin clasificar`
              : `<span class="num">${ui.esc(c.num)}</span> ${ui.esc(c.nombre)}`) +
          '</button>').join('') + '</div>'
      : '<div class="pista">Ya está en todas las cajas</div>';

    const { dialog, cerrar } = ui.hoja({ titulo: 'Añadir a otra caja', contenido });
    dialog.addEventListener('click', e => {
      const boton = e.target.closest('[data-elegir]');
      if (!boton) return;
      cerrar();
      anadirEn(boton.dataset.elegir);
    });
  }

  /* Eliminar del catálogo. La hoja de confirmación ES la barrera: no hay
     toast de deshacer detrás (deshacer un borrado en cascada sería mentira
     con dos personas tocando el mismo almacén). */
  function confirmarEliminar() {
    const item = datos.item(itemId);
    if (!item) return;

    const { dialog, cerrar } = ui.hoja({
      titulo: '¿Eliminar «' + item.nombre + '»?',
      contenido:
        '<div class="pista">Desaparece del catálogo y de todas las cajas.</div>' +
        '<div class="hoja__acciones">' +
          '<button type="button" class="cta cta--sin-morph" data-eliminar>Eliminar</button>' +
          '<button type="button" class="boton-fantasma" data-cancelar>Cancelar</button>' +
        '</div>'
    });

    dialog.addEventListener('click', e => {
      if (e.target.closest('[data-cancelar]')) { cerrar(); return; }
      if (!e.target.closest('[data-eliminar]')) return;
      cerrar();
      mutar(() => datos.eliminarItem(itemId));
      /* A la home, en Inventario: es de donde se llega aquí y donde se nota
         que el ítem ya no está. */
      irAPestana(PESTANA.inventario);
      navegar('/', null, { reemplazar: true });
    });
  }

  $('#volver').addEventListener('click', () => volver('/'));
  $('#eliminar').addEventListener('click', confirmarEliminar);
  $('#otra-caja').addEventListener('click', abrirHoja);

  alCambiar(() => { if (!propio) pintar(); });

  pintar();

  return raiz;
}
