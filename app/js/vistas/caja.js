/* =============================================================================
   Vista: caja  ·  ruta #/caja/:id
   Maqueta de referencia: maquetas/prueba-medkit-caja.html
   =============================================================================
   El contenido de UNA caja: la única pantalla desde la que se toca su stock.

     · Cabecera con la tesela del número, el nombre y "ubicación · N ítems".
     · Una fila por ítem: suministros con stepper (mantener pulsado repite),
       únicos con el botón de sacar de la caja. Al llegar a 0 la fila se
       colapsa, se quita la
       relación y sale el toast "Quitado · Deshacer", que la devuelve a su
       sitio con la cantidad que tenía.
     · Sin nada dentro: la foto de la caja + "Caja vacía / Añade el primer ítem".
     · La CTA lleva el morph (`view-transition-name: boton-anadir`) hacia
       #/anadir?caja=<id>: es el + de la home estirándose.

   Las mutaciones van siempre por `datos`. La suscripción sólo repinta cuando
   el cambio viene de FUERA de esta vista (otra pestaña, la consola): lo que
   toca el usuario aquí se anima a mano, y un repintado en medio se llevaría
   por delante el colapso, el pop y el deshacer.
   ========================================================================== */

import { datos, sinClasificar } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, alCambiar, alSalir } from '../app.js';

/* La marca que deja "Añadir ítem" para que la caja cuele arriba, con
   destello, lo que acabas de meter. Formato de las maquetas
   ({ emoji, nombre, tipo }) más, si viene, a qué caja y a qué ítem apunta. */
const CLAVE_RECIEN = 'cajas.recien';

export function render(params) {
  const inicial = datos.caja(params.id);
  if (!inicial) { navegar('/', null, { reemplazar: true }); return document.createElement('div'); }

  const cajaId = inicial.id;

  const raiz = ui.nodo(`
    <div>
      <nav class="barra">
        <button type="button" class="icono-btn" id="volver" aria-label="Volver">${ui.icono('volver')}</button>
        <div class="barra__grupo">
          <!-- Misma esquina que en la home: arriba del todo, a la derecha. -->
          <button type="button" class="icono-btn" id="conmutador"></button>
          <button type="button" class="icono-btn" id="ajustes"
                  aria-label="Ajustes de la caja">${ui.icono('ajustes')}</button>
        </div>
      </nav>

      <header class="cabecera cabecera--identidad">
        <span class="num-tesela" id="num" aria-hidden="true"></span>
        <div>
          <h1 id="nombre"></h1>
          <div class="sub" id="sub"></div>
        </div>
      </header>

      <main class="lista" id="lista"></main>

      <div class="vacio vacio--holgado vacio--caja oculto" id="vacia">
        <img class="vacio__caja" src="img/caja-vacia.png" alt="" aria-hidden="true">
        <div class="vacio__titulo">Caja vacía</div>
        <div class="vacio__sub">Añade el primer ítem</div>
      </div>

      <div class="velo-inferior" aria-hidden="true"></div>

      <div class="flotante">
        <button type="button" class="cta" id="anadir">
          <span aria-hidden="true">${ui.icono('mas', 20, 2.6)}</span>
          Añadir ítem
        </button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const lista = $('#lista');
  const vacia = $('#vacia');

  /* Dentro de una caja el formato nace en LISTA: aquí se viene a tocar el
     stepper, y en tarjeta queda pequeño. La retícula está por si quieres
     mirar las fotos. */
  let formato = ui.formato('caja', ui.LISTA);

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

  /* ------------------------------------------------------- pintado ------- */
  function actualizarCuenta() {
    const caja = datos.caja(cajaId);
    if (!caja) return;
    /* Por `data-item`: en retícula las piezas son tarjetas, no filas. */
    const n = lista.querySelectorAll('[data-item]').length;
    /* Sin número no hay pegatina que enseñar: se quita la tesela y el título
       pasa a ser "Sin clasificar", con el sitio debajo. */
    const suelta = sinClasificar(caja);
    $('#num').textContent = suelta ? '' : caja.num;
    $('#num').classList.toggle('oculto', suelta);
    $('#nombre').textContent = suelta ? 'Sin clasificar' : caja.nombre;
    $('#sub').textContent = suelta
      ? (caja.ubicacion || 'Sin sitio') + ' · ' + ui.plural(n, 'ítem', 'ítems')
      : (caja.ubicacion ? caja.ubicacion + ' · ' : '') + ui.plural(n, 'ítem', 'ítems');
    vacia.classList.toggle('oculto', n > 0);
  }

  function filaHTML(item, cantidad) {
    const control = item.suministro
      ? `<div class="stepper">
           <button type="button" data-menos aria-label="Quitar uno">${ui.icono('menos', 18)}</button>
           <span class="cifra">${cantidad}</span>
           <button type="button" data-mas aria-label="Añadir uno">${ui.icono('mas', 18)}</button>
         </div>`
      : `<button type="button" class="btn-cuadrado" data-quitar
                 aria-label="Sacar de la caja">${ui.icono('sacar', 20)}</button>`;
    return `<article class="fila fila--items" data-item="${ui.esc(item.id)}">
      <span class="tesela" aria-hidden="true">${ui.cara(item)}</span>
      <div class="texto">
        <div class="nombre">${ui.esc(item.nombre)}</div>
        <div class="tipo">${item.suministro ? 'Suministro' : 'Único'}</div>
      </div>
      ${control}
    </article>`;
  }

  /* El mismo ítem en tarjeta: la foto grande y el control debajo. Los
     controles son los mismos nodos, así que `engancharFila` no cambia. */
  function piezaHTML(item, cantidad) {
    const control = item.suministro
      ? `<div class="stepper">
           <button type="button" data-menos aria-label="Quitar uno">${ui.icono('menos', 18)}</button>
           <span class="cifra">${cantidad}</span>
           <button type="button" data-mas aria-label="Añadir uno">${ui.icono('mas', 18)}</button>
         </div>`
      : `<button type="button" class="btn-cuadrado" data-quitar
                 aria-label="Sacar de la caja">${ui.icono('sacar', 20)}</button>`;
    return `<article class="pieza fila--items" data-item="${ui.esc(item.id)}">
      <div class="pieza__cara" aria-hidden="true">${ui.cara(item)}</div>
      <div class="pieza__nombre">${ui.esc(item.nombre)}</div>
      <div class="pieza__accion">${control}</div>
    </article>`;
  }

  function pintar() {
    if (!datos.caja(cajaId)) { navegar('/', null, { reemplazar: true }); return; }
    soltarFilas();
    const enRejilla = formato === ui.RETICULA;
    lista.className = enRejilla ? 'rejilla' : 'lista';
    const lineas = datos.stockDeCaja(cajaId);
    lista.innerHTML = lineas
      .map(l => (enRejilla ? piezaHTML : filaHTML)(l.item, l.cantidad)).join('');
    [...lista.children].forEach((fila, i) => engancharFila(fila, lineas[i].item));
    actualizarCuenta();
  }

  /* ------------------------------------------------- conmutar formato ---- */
  const conmutador = $('#conmutador');
  ui.pintarConmutador(conmutador, formato);
  conmutador.addEventListener('click', () => {
    formato = formato === ui.LISTA ? ui.RETICULA : ui.LISTA;
    ui.ponerFormato('caja', formato);
    ui.pintarConmutador(conmutador, formato);
    pintar();
  });

  /* ---------------------------------------------------- interacción ------ */
  /* Quitar de la caja: la fila colapsa, se corta la relación y queda 5 s de
     margen para deshacer, que la devuelve a su hueco con su cantidad. */
  function quitar(fila, item, previa) {
    if (fila.dataset.saliendo) return;
    fila.dataset.saliendo = '1';
    ui.sacarFila(fila, () => {
      const siguiente = fila.nextElementSibling;
      fila.remove();
      mutar(() => datos.ponerStock(item.id, cajaId, 0));
      if (!vivo) return;                 /* nos hemos ido: sin toast fantasma */
      actualizarCuenta();
      ui.toast('Quitado', () => {
        delete fila.dataset.saliendo;
        mutar(() => datos.ponerStock(item.id, cajaId, previa));
        const cifra = fila.querySelector('.cifra');
        if (cifra) cifra.textContent = previa;
        ui.meterFila(lista, fila, siguiente, false);
        actualizarCuenta();
      });
    });
  }

  function engancharFila(fila, item) {
    if (!item.suministro) {
      fila.querySelector('[data-quitar]')
        .addEventListener('click', () => quitar(fila, item, 1));
      return;
    }
    const cifra = fila.querySelector('.cifra');
    const leer = () => parseInt(cifra.textContent, 10) || 0;

    function pon(n) {
      if (fila.dataset.saliendo) return;
      if (n <= 0) { quitar(fila, item, leer()); return; }
      mutar(() => datos.ponerStock(item.id, cajaId, n));
      cifra.textContent = n;
      ui.pop(cifra);
    }

    sueltas.push(ui.repetible(fila.querySelector('[data-menos]'), () => pon(leer() - 1)));
    sueltas.push(ui.repetible(fila.querySelector('[data-mas]'), () => pon(leer() + 1)));
  }

  /* --------------------------------------------------- reordenar ---------- */
  /* Se miden las casillas al levantar y se mira sobre cuál está el dedo, así
     que el mismo gesto sirve en lista y en retícula. Nada cambia de sitio en
     el DOM hasta soltar: así no hay saltos ni se pierde el scroll. */
  alSalir(ui.reordenable(lista, {
    selector: '.fila, .pieza',
    /* Los controles son suyos: el stepper y el botón de sacar no arrastran. */
    ignorar: '.stepper, .btn-cuadrado',
    /* Si el orden no se puede guardar, no se ofrece el gesto. */
    puede: () => datos.puedeOrdenar(),
    levantada: 'levantada',
    alOrdenar: (cont, piezas) =>
      mutar(() => datos.ordenarCaja(cajaId, piezas.map(p => p.dataset.item)))
  }));

  /* Lo que acabas de añadir entra arriba y destella una vez. El dato ya está
     en el almacén: aquí sólo se sube su fila al principio. */
  function leerRecien() {
    let marca = null;
    try {
      const bruto = localStorage.getItem(CLAVE_RECIEN);
      if (bruto) marca = JSON.parse(bruto);
    } catch (e) { return null; }        /* sin almacenamiento: no hay novedad */
    if (!marca || typeof marca !== 'object') return null;
    /* Si la marca dice a qué caja iba y no es esta, se la queda su caja. */
    const suCaja = marca.cajaId || marca.caja || null;
    if (suCaja && suCaja !== cajaId) return null;
    try { localStorage.removeItem(CLAVE_RECIEN); } catch (e) { /* mejor esfuerzo */ }
    return marca;
  }

  function destacarRecien() {
    const marca = leerRecien();
    if (!marca) return;
    const id = marca.itemId || marca.item || marca.id || null;
    const filas = [...lista.querySelectorAll('[data-item]')];
    const fila = id
      ? filas.find(f => f.dataset.item === id)
      : filas.find(f => {
          const n = f.querySelector('.nombre, .pieza__nombre');
          return n && n.textContent === marca.nombre;
        });
    if (!fila) return;
    ui.meterFila(lista, fila, lista.firstElementChild, true);
  }

  $('#volver').addEventListener('click', () => volver('/'));
  /* Por `navegar` y no con un enlace: así la pila del historial sabe que hay
     un paso más y el cerrar de ajustes sabe a dónde volver. */
  $('#ajustes').addEventListener('click', () =>
    navegar('/ajustes/' + encodeURIComponent(cajaId)));
  $('#anadir').addEventListener('click', () => {
    ui.precalentarTeclado();
    navegar('/anadir', { caja: cajaId });
  });

  /* Sólo los cambios de fuera repintan: los de aquí ya se han animado. */
  alCambiar(() => { if (!propio) pintar(); });

  pintar();
  destacarRecien();

  return raiz;
}
