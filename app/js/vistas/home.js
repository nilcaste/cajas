/* =============================================================================
   Vista: home  ·  ruta #/
   Maqueta de referencia: maquetas/prueba-medkit.html
   =============================================================================
   Dos pestañas sobre los mismos datos:
     · Cajas       retícula de carpetas + celda "Nueva caja"
     · Inventario  el catálogo entero, accionable (chips que llevan a la caja)

   El buscador flotante ES el buscador del inventario: al escribir salta a esa
   pestaña, y al vaciarlo vuelve a la que estabas.

   Esta vista es la prueba del ciclo completo: pinta desde `datos`, y se
   resuscribe con `alCambiar` para repintarse sola cuando cualquier otra vista
   (o la consola) muta el almacén.
   ========================================================================== */

import { datos, sinClasificar, sitio, rotulo } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, alCambiar, alSalir } from '../app.js';
import { nube } from '../supabase-adapter.js';

const CLAVE_TAB = 'cajas.pestana';
/* Qué sitios están plegados. Es preferencia de interfaz, como la pestaña: se
   guarda aquí y no viaja a la nube — si Rafa pliega el trastero en su móvil,
   el mío no tiene por qué cerrarse. */
const CLAVE_PLEGADOS = 'cajas.sitios-plegados';

function leerPlegados() {
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_PLEGADOS) || '[]')); }
  catch (e) { return new Set(); }
}

function guardarPlegados(plegados) {
  try { localStorage.setItem(CLAVE_PLEGADOS, JSON.stringify([...plegados])); }
  catch (e) { /* sin almacenamiento: se pliega sólo durante esta visita */ }
}

/* En qué pestaña aterriza la home. Es preferencia de interfaz, no dato: la
   home la recuerda sola, y quien navegue hacia aquí puede decidirla antes
   (al eliminar un ítem se vuelve a Inventario; una caja, a Cajas). */
export const PESTANA = { cajas: 0, inventario: 1 };

export function irAPestana(i) {
  try { localStorage.setItem(CLAVE_TAB, String(i === 1 ? 1 : 0)); }
  catch (e) { /* sin almacenamiento */ }
}

function leerTab() {
  try { return localStorage.getItem(CLAVE_TAB) === '1' ? 1 : 0; } catch (e) { return 0; }
}

export function render() {
  const raiz = ui.nodo(`
    <div>
      <header class="cabecera cabecera--home">
        <div>
          <h1>Mi almacén</h1>
          <div class="sub" id="resumen"></div>
        </div>
      </header>

      <div class="franja">
        <div class="franja__fila">
          <nav class="pestanas" role="tablist" aria-label="Secciones" data-activa="0">
            <span class="pestanas__pastilla" aria-hidden="true"></span>
            <button type="button" class="pestanas__tab" role="tab" id="tab-cajas"
                    aria-selected="true" aria-controls="panel-cajas">Cajas</button>
            <button type="button" class="pestanas__tab" role="tab" id="tab-inventario"
                    aria-selected="false" aria-controls="panel-inventario">Inventario</button>
          </nav>
          <!-- Sólo el inventario cambia de formato: las cajas se ven SIEMPRE en
               retícula. En la pestaña de cajas el botón se apaga en vez de
               desaparecer — si desapareciera, las pestañas darían un salto de
               58px cada vez que cambias de pestaña. -->
          <button type="button" class="conmutador" id="conmutador"></button>
        </div>
        <div class="escritorio-controles">
          <label class="buscador buscador--mini">
            <span aria-hidden="true">${ui.icono('lupa', 18)}</span>
            <input type="search" id="donde-desktop" placeholder="Dónde está..."
                   aria-label="Buscar un ítem" autocomplete="off">
          </label>
          <button type="button" class="boton-anadir-desktop" id="anadir-desktop">
            ${ui.icono('mas', 18, 2.6)}
            Añadir ítem
          </button>
        </div>
      </div>

      <section class="panel" id="panel-cajas" role="tabpanel" aria-labelledby="tab-cajas">
        <div class="vacio oculto" id="cajas-vacio" hidden>
        </div>
        <div class="reticula" id="reticula"></div>
      </section>

      <section class="panel" id="panel-inventario" role="tabpanel"
               aria-labelledby="tab-inventario" hidden>
        <div class="lista" id="inv-lista"></div>
        <div class="vacio oculto" id="inv-vacio" hidden>
        </div>
      </section>

      <div class="velo-inferior" aria-hidden="true"></div>

      <div class="flotante">
        <label class="buscador buscador--flotante">
          <span aria-hidden="true">${ui.icono('lupa', 20)}</span>
          <input type="search" id="donde" placeholder="Dónde está..." aria-label="Buscar un ítem"
                 autocomplete="off" autocorrect="off" spellcheck="false">
        </label>
        <button type="button" class="fab" id="fab" aria-label="Añadir ítem">
          ${ui.icono('mas', 26, 2.6)}
        </button>
        <button type="button" class="cerrar-busqueda" id="cerrar-busqueda"
                aria-label="Cerrar la búsqueda" hidden>
          ${ui.icono('cerrar', 24, 2.4)}
        </button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const nav = $('.pestanas');
  const tabs = [...nav.querySelectorAll('.pestanas__tab')];
  const paneles = tabs.map(t => raiz.querySelector('#' + t.getAttribute('aria-controls')));
  const reticula = $('#reticula');
  const invLista = $('#inv-lista');
  const campoMovil = $('#donde');
  const campoEscritorio = $('#donde-desktop');

  /* Las CAJAS se ven siempre en retícula: son fotos, y el mosaico es lo que
     las identifica de un vistazo. El que cambia es el inventario, que son
     nombres y hay muchos — ahí nace en lista. */
  let formatoInv = ui.formato('inventario', ui.LISTA);

  let filtro = '';
  let pestanaPrevia = null;
  let buscando = false;

  /* ----------------------------------------------------- pestañas ------- */
  /* `recordar` distingue elegir pestaña (preferencia, se guarda) de que la
     interfaz te lleve a Inventario para enseñarte resultados (no se guarda:
     al salir de la búsqueda vuelves a la que tenías). */
  function activar(i, { recordar = true } = {}) {
    if (recordar) irAPestana(i);
    if (tabs[i].getAttribute('aria-selected') === 'true') return;
    nav.dataset.activa = i;
    tabs.forEach((t, j) => {
      t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      t.tabIndex = j === i ? 0 : -1;
    });
    pintarConmutador();
    paneles.forEach((p, j) => {
      if (j !== i) { p.hidden = true; return; }
      p.hidden = false;
      if (ui.reducida()) return;
      p.classList.add('panel--entrando');
      requestAnimationFrame(() => requestAnimationFrame(() =>
        p.classList.remove('panel--entrando')));
    });
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => activar(i));
    t.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = (i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      activar(n);
      tabs[n].focus();
    });
  });

  /* ------------------------------------------------------ pintado ------- */
  function pintarResumen(cajas) {
    let unidades = 0;
    cajas.forEach(c => datos.stockDeCaja(c.id).forEach(l => { unidades += l.cantidad; }));
    /* Lo que está sin clasificar no cuenta como caja: no tiene pegatina y
       en la retícula tampoco se cuenta (ver `cuenta`). */
    const numeradas = cajas.filter(c => !sinClasificar(c)).length;
    $('#resumen').textContent =
      ui.plural(unidades, 'ítem', 'ítems') + ' en ' + ui.plural(numeradas, 'caja', 'cajas');
  }

  function tarjeta(c) {
    const lineas = datos.stockDeCaja(c.id);
    const celdas = [0, 1, 2, 3]
      .map(i => '<i>' + (lineas[i] ? ui.cara(lineas[i].item) : '') + '</i>')
      .join('');
    return `<article class="caja${sinClasificar(c) ? ' caja--sin-clasificar' : ''}"
                     data-caja="${ui.esc(c.id)}">
      <div class="mosaico" aria-hidden="true">${celdas}</div>
      <div class="caja__nombre">${ui.esc(rotulo(c))}</div>
      <div class="caja__meta">${ui.plural(lineas.length, 'ítem', 'ítems')}</div>
    </article>`;
  }

  /* Las cajas por sitio: el armario negro, el trastero, y al final las que no
     están en ninguno. El orden de los sitios es alfabético —predecible— y
     dentro manda el número, con la caja sin numerar (lo "sin clasificar" de
     ese sitio) cerrando el grupo. */
  function agrupar(cajas) {
    const grupos = new Map();
    cajas.forEach(c => {
      const clave = sitio(c);
      if (!grupos.has(clave)) grupos.set(clave, { sitio: clave, cajas: [] });
      grupos.get(clave).cajas.push(c);
    });
    return [...grupos.values()].sort((a, b) => {
      if (!a.sitio !== !b.sitio) return a.sitio ? -1 : 1;   /* "sin sitio", al final */
      return a.sitio.localeCompare(b.sitio, 'es');
    });
  }

  function resumenSitio(grupo) {
    const cajasReales = grupo.cajas.filter(c => !sinClasificar(c)).length;
    const items = grupo.cajas.reduce((n, c) => n + datos.stockDeCaja(c.id).length, 0);
    /* Un sitio donde sólo hay cosas sin clasificar no tiene "0 cajas": no
       tiene cajas, y decirlo con un cero suena a que falta algo. */
    return (cajasReales ? ui.plural(cajasReales, 'caja', 'cajas') + ' · ' : '') +
           ui.plural(items, 'ítem', 'ítems');
  }

  function pintarCajas(cajas) {
    const grupos = agrupar(cajas);
    /* Un rótulo tiene que ganarse el sitio que ocupa: mientras cada caja esté
       en un sitio distinto, agrupar no junta nada y sólo mete ruido. La home
       sigue siendo la de siempre —retícula lisa, celda de crear al final— y
       los rótulos aparecen el día que dos cajas comparten mueble. */
    const liso = !grupos.some(g => g.cajas.length > 1) && !cajas.some(sinClasificar);

    if (liso) {
      reticula.className = 'reticula';
      reticula.innerHTML = cajas.map(tarjeta).join('') + `
        <button type="button" class="caja-nueva" id="caja-nueva">
          <span aria-hidden="true">${ui.icono('mas', 24)}</span>
          Nueva caja
        </button>`;
    } else {
      const plegados = leerPlegados();
      reticula.className = 'sitios';
      reticula.innerHTML = grupos.map(g => {
        const abierto = !plegados.has(g.sitio);
        return `
          <button type="button" class="seccion seccion--sitio"
                  data-sitio="${ui.esc(g.sitio)}" aria-expanded="${abierto}">
            <span class="seccion__titulo">${ui.esc(g.sitio || 'Sin sitio')}
              <span class="seccion__galon" aria-hidden="true">${ui.icono('chevronAbajo')}</span>
            </span>
            <span class="seccion__cuenta">${resumenSitio(g)}</span>
          </button>
          <div class="sitio__cuerpo"><div>
            <div class="reticula">${g.cajas.map(tarjeta).join('')}</div>
          </div></div>`;
      }).join('') + `
        <button type="button" class="caja-nueva caja-nueva--fila" id="caja-nueva">
          <span aria-hidden="true">${ui.icono('mas', 22)}</span>
          Nueva caja
        </button>`;
    }
    $('#cajas-vacio').classList.toggle('oculto', cajas.length > 0);
  }

  /* De lo que más hay a lo que menos, y al final lo que no está en ninguna
     caja: así la lista contesta sola a "¿de qué voy sobrado?" y deja abajo lo
     que hay que reponer. A igualdad, por nombre. */
  function porCantidad(a, b) {
    const suma = it => datos.stockDeItem(it.id).reduce((n, l) => n + l.cantidad, 0);
    const ca = suma(a), cb = suma(b);
    if ((ca === 0) !== (cb === 0)) return ca === 0 ? 1 : -1;
    if (cb !== ca) return cb - ca;
    return a.nombre.localeCompare(b.nombre, 'es');
  }

  function pintarInventario() {
    /* Buscando manda la lista: se leen nombres, no se miran fotos. */
    const enRejilla = formatoInv === ui.RETICULA && !buscando;
    invLista.className = enRejilla ? 'rejilla' : 'lista';
    const items = datos.buscarItems(filtro).sort(porCantidad);
    invLista.innerHTML = items.map(it => {
      const donde = datos.stockDeItem(it.id);
      const total = donde.reduce((a, l) => a + l.cantidad, 0);
      const cuenta = !donde.length
        ? 'Sin ubicar'
        : (it.suministro ? ui.plural(total, 'unidad', 'unidades') : 'Único');
      /* "en 2 cajas" deja de ser verdad cuando lo que hay es un armario: si
         nada de esto está en una caja numerada, se cuentan sitios. */
      const sueltos = donde.length && donde.every(l => sinClasificar(l.caja));
      const donde_ = sueltos
        ? ui.plural(donde.length, 'sitio', 'sitios')
        : ui.plural(donde.length, 'caja', 'cajas');
      const chips = donde.map(l => {
        if (sinClasificar(l.caja)) {
          return `<button type="button" class="chip-caja chip-caja--sitio"
                          data-caja="${ui.esc(l.caja.id)}">` +
            '<span class="n">' + ui.esc(sitio(l.caja) || 'Sin clasificar') + '</span>' +
            (it.suministro ? ` <span class="x">×${l.cantidad}</span>` : '') +
            `</button>`;
        }
        return `<button type="button" class="chip-caja" data-caja="${ui.esc(l.caja.id)}">${ui.esc(l.caja.num)}` +
          (it.suministro ? ` <span class="x">×${l.cantidad}</span>` : '') +
          `</button>`;
      }).join('');
      if (enRejilla) {
        /* En tarjeta la foto se ve de verdad, que es lo que un mosaico de 2×2
           no deja. A cambio la cuenta se abrevia: no cabe "46 unidades". */
        const corto = !donde.length
          ? 'Sin ubicar'
          : (it.suministro ? total + ' uds' : 'Único');
        /* El chip se queda con el número pelado: el "×46" ya lo dice la
           cuenta de al lado y en una tarjeta no sobra sitio. */
        const chipsCortos = donde.map(l =>
          sinClasificar(l.caja)
            ? `<button type="button" class="chip-caja chip-caja--sitio" data-caja="${ui.esc(l.caja.id)}">` +
              `<span class="n">${ui.esc(sitio(l.caja) || 'Sin clasificar')}</span></button>`
            : `<button type="button" class="chip-caja" data-caja="${ui.esc(l.caja.id)}">${ui.esc(l.caja.num)}</button>`
        ).join('');
        return `<article class="pieza pulsable" data-item="${ui.esc(it.id)}">
          <div class="pieza__cara" aria-hidden="true">${ui.cara(it)}</div>
          <div class="pieza__nombre">${ui.resaltar(it.nombre, filtro)}</div>
          <div class="pieza__meta">${corto}${chipsCortos}</div>
        </article>`;
      }
      return `<article class="fila fila--inv pulsable" data-item="${ui.esc(it.id)}">
        <span class="mini" aria-hidden="true">${ui.cara(it)}</span>
        <div class="texto">
          <div class="nombre">${ui.resaltar(it.nombre, filtro)}</div>
          <div class="meta">${cuenta} · ${donde_}</div>
        </div>
        <div class="fila__cajas">${chips}</div>
      </article>`;
    }).join('');
    $('#inv-vacio').classList.toggle('oculto', items.length > 0);
  }

  function pintar() {
    const cajas = datos.listarCajas();
    pintarConmutador();
    pintarResumen(cajas);
    pintarCajas(cajas);
    pintarInventario();
  }

  /* Cualquier mutación del almacén (de esta vista o de otra) repinta.
     La baja se suelta sola al cambiar de ruta. Lo que muta esta pantalla NO
     repinta: ya está en su sitio, y un `innerHTML` nuevo recrearía todas las
     <img> de los mosaicos (el parpadeo de siempre). */
  let propio = false;
  alCambiar(() => { if (!propio) pintar(); });

  /* -------------------------------------------------- interacción ------- */
  /* Todo pasa por `navegar`: un <a href="#..."> se saltaría al router y la
     pila del historial dejaría de cuadrar con lo que ve el usuario. */
  reticula.addEventListener('click', e => {
    if (e.target.closest('#caja-nueva')) { navegar('/nueva'); return; }

    /* Plegar un sitio NO repinta: el CSS anima la altura y un `innerHTML`
       nuevo se comería la animación a medias. */
    const rotuloSitio = e.target.closest('.seccion--sitio');
    if (rotuloSitio) {
      const abierto = rotuloSitio.getAttribute('aria-expanded') === 'true';
      rotuloSitio.setAttribute('aria-expanded', abierto ? 'false' : 'true');
      const plegados = leerPlegados();
      if (abierto) plegados.add(rotuloSitio.dataset.sitio);
      else plegados.delete(rotuloSitio.dataset.sitio);
      guardarPlegados(plegados);
      return;
    }

    /* Por `data-caja` y no por `.caja`: en lista la pieza es una `.fila`. */
    const cual = e.target.closest('[data-caja]');
    if (cual) navegar('/caja/' + encodeURIComponent(cual.dataset.caja));
  });

  invLista.addEventListener('click', e => {
    const chip = e.target.closest('.chip-caja');
    if (chip) { navegar('/caja/' + encodeURIComponent(chip.dataset.caja)); return; }
    /* La ficha del ítem se abre SOLO desde aquí: es el sitio donde se mira el
       catálogo, no el contenido de una caja. */
    /* Por `data-item`: en retícula la pieza es una tarjeta, no una fila. */
    const cual = e.target.closest('[data-item]');
    if (cual) navegar('/item/' + encodeURIComponent(cual.dataset.item));
  });

  /* --------------------------------------------------- reordenar --------- */
  /* Se miden las casillas al levantar y se mira sobre cuál está el dedo, así
     que vale igual en retícula y en lista: una lista es una retícula de una
     columna. El arrastre no sale de su grupo — cada sitio ordena lo suyo, y
     mover una caja de mueble es cambiarle la ubicación, que se hace en
     Ajustes. */
  alSalir(ui.reordenable(reticula, {
    selector: '.caja, .fila',
    ignorar: '.seccion--sitio, #caja-nueva',
    /* Sin dónde guardarlo no se ofrece el gesto: mover tarjetas y que vuelvan
       solas al recargar sería peor que no poder moverlas. */
    puede: () => datos.puedeOrdenarCajas(),
    levantada: 'levantada',
    grupo: pieza => pieza.parentElement,
    alOrdenar: (cont, piezas) => {
      /* Lo mutamos nosotros y ya está pintado: repintar volvería a crear
         todas las <img> de los mosaicos. */
      propio = true;
      try { datos.ordenarCajas(piezas.map(p => p.dataset.caja)); }
      finally { propio = false; }
    }
  }));

  /* ------------------------------------------------- conmutar formato ---- */
  const conmutador = $('#conmutador');

  /* En Cajas no hay nada que conmutar: el botón se apaga y deja de responder,
     pero sigue ocupando su sitio para que las pestañas no den un salto al
     cambiar de pestaña. */
  function pintarConmutador() {
    const enInventario = Number(nav.dataset.activa) === PESTANA.inventario;
    conmutador.classList.toggle('conmutador--apagado', !enInventario);
    conmutador.disabled = !enInventario;
    ui.pintarConmutador(conmutador, formatoInv);
  }

  conmutador.addEventListener('click', () => {
    if (conmutador.disabled) return;
    formatoInv = formatoInv === ui.LISTA ? ui.RETICULA : ui.LISTA;
    ui.ponerFormato('inventario', formatoInv);
    pintarConmutador();
    pintarInventario();
  });

  function abrirAnadir() {
    ui.precalentarTeclado();
    navegar('/anadir');
  }
  $('#fab').addEventListener('click', abrirAnadir);
  $('#anadir-desktop').addEventListener('click', abrirAnadir);

  /* ------------------------------------------- modo búsqueda (móvil) ----- */
  /* Buscar es una pantalla, no un campo: al enfocar el buscador flotante la
     barra sube hasta arriba del todo y debajo queda sólo el inventario, que
     se filtra según escribes. El viaje se anima con FLIP (medir → cambiar de
     sitio → animar la diferencia): la barra está `position: fixed`, y de
     abajo a arriba no hay propiedad que interpolar.

     En escritorio no existe: el buscador ya vive arriba y la barra flotante
     ni se pinta. */
  const barraFlotante = $('.flotante');
  const botonCerrarBusqueda = $('#cerrar-busqueda');

  function modoBusqueda(activo) {
    if (buscando === activo) return;
    /* En escritorio la barra no se pinta (`display: none`) y este modo no
       existe. Se pregunta al estilo calculado y no a `offsetParent`, que en
       un elemento `position: fixed` siempre es null. */
    if (activo && getComputedStyle(barraFlotante).display === 'none') return;
    buscando = activo;

    const antes = barraFlotante.getBoundingClientRect();
    document.body.classList.toggle('buscando', activo);
    botonCerrarBusqueda.hidden = !activo;
    const despues = barraFlotante.getBoundingClientRect();

    const salto = antes.top - despues.top;
    if (salto && !ui.reducida()) {
      barraFlotante.animate(
        [{ transform: `translateY(${salto}px)` }, { transform: 'none' }],
        { duration: 420, easing: 'cubic-bezier(.32, 1.26, .4, 1)' }
      );
    }

    if (activo) {
      pestanaPrevia = Number(nav.dataset.activa) || 0;
      activar(1, { recordar: false });
      /* Buscando se lee, no se mira: el inventario baja a lista aunque tengas
         puesta la retícula. */
      pintarInventario();
      scrollTo({ top: 0 });
      seguirTeclado();
    } else {
      campoMovil.value = '';
      filtro = '';
      refrescarAspas.forEach(f => f());
      pintarInventario();
      if (pestanaPrevia !== null) activar(pestanaPrevia, { recordar: false });
      pestanaPrevia = null;
      campoMovil.blur();
      scrollTo({ top: 0 });
      seguirTeclado();
    }
  }

  /* iOS no mueve la página cuando sale el teclado: encoge la "ventana visual"
     y la desplaza dentro de la de siempre. Un elemento `position: fixed`
     sigue anclado a la de siempre, así que la barra se queda POR ENCIMA de lo
     que se ve — que es exactamente el "se me va arriba". La única forma de
     seguirle la pista es preguntarle al propio navegador dónde está mirando. */
  function seguirTeclado() {
    const vv = window.visualViewport;
    if (!vv) return;
    const desfase = buscando ? Math.max(0, Math.round(vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--desfase-teclado', desfase + 'px');
  }

  if (window.visualViewport) {
    visualViewport.addEventListener('resize', seguirTeclado);
    visualViewport.addEventListener('scroll', seguirTeclado);
    alSalir(() => {
      visualViewport.removeEventListener('resize', seguirTeclado);
      visualViewport.removeEventListener('scroll', seguirTeclado);
      document.documentElement.style.removeProperty('--desfase-teclado');
    });
  }

  campoMovil.addEventListener('focus', () => modoBusqueda(true));
  botonCerrarBusqueda.addEventListener('click', () => modoBusqueda(false));
  campoMovil.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); modoBusqueda(false); }
  });
  /* Si te vas de la home a media búsqueda, el body no se queda marcado. */
  alSalir(() => document.body.classList.remove('buscando'));

  /* Escritorio: sin modo búsqueda, pero al escribir saltamos a Inventario y
     recordamos de dónde veníamos — si vacías el campo, vuelves a tu pestaña. */
  function engancharBuscador(campo) {
    if (!campo) return;
    campo.addEventListener('input', () => {
      filtro = campo.value.trim();
      const otro = campo === campoMovil ? campoEscritorio : campoMovil;
      if (otro && otro.value !== campo.value) otro.value = campo.value;
      if (!buscando) {
        if (filtro) {
          if (pestanaPrevia === null) pestanaPrevia = Number(nav.dataset.activa) || 0;
          activar(1);
        } else if (pestanaPrevia !== null) {
          activar(pestanaPrevia);
          pestanaPrevia = null;
        }
      }
      pintarInventario();
    });
  }
  engancharBuscador(campoMovil);
  engancharBuscador(campoEscritorio);
  const refrescarAspas = [ui.limpiable(campoMovil), ui.limpiable(campoEscritorio)];

  /* "/" enfoca el buscador que esté a la vista. */
  function atajo(e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement;
    if (a && /^(input|textarea|select)$/i.test(a.tagName)) return;
    const visible = [campoEscritorio, campoMovil].find(c => c && c.offsetParent !== null);
    if (!visible) return;
    e.preventDefault();
    visible.focus();
  }
  document.addEventListener('keydown', atajo);
  alSalir(() => document.removeEventListener('keydown', atajo));

  /* ----------------------------------------------------- arranque ------- */
  pintar();
  const inicial = leerTab();
  if (inicial === 1) {
    nav.dataset.activa = 1;
    tabs[0].setAttribute('aria-selected', 'false');
    tabs[0].tabIndex = -1;
    tabs[1].setAttribute('aria-selected', 'true');
    tabs[1].tabIndex = 0;
    paneles[0].hidden = true;
    paneles[1].hidden = false;
    pintarConmutador();
  }

  return raiz;
}
