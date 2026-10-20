/* =============================================================================
   Vista: anadir  ·  ruta #/anadir?caja=<id>
   Maqueta de referencia: maquetas/prueba-medkit-anadir.html
   =============================================================================
   Catálogo-primero: dos toques para un ítem ya conocido. Sin ?caja= hay que
   elegir destino con el selector destacado; con ?caja= la caja ya está fija.
   ========================================================================== */

import { datos, sinClasificar, sitio } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, terminarProceso, alSalir, alMontar } from '../app.js';

export function render(params) {
  const cajaFija = params.caja ? datos.caja(params.caja) : null;
  if (params.caja && !cajaFija) {
    navegar('/', null, { reemplazar: true });
    return document.createElement('div');
  }

  const cajas = cajaFija ? [] : datos.listarCajas();

  /* Un ítem SIEMPRE va a una caja: sin cajas no se puede añadir. */
  if (!cajaFija && cajas.length === 0) {
    const aviso = ui.nodo(`
      <div>
        <nav class="barra barra--sola">
          <button type="button" class="icono-btn" id="cerrar"
                  aria-label="Cerrar">${ui.icono('cerrar')}</button>
        </nav>
        <header class="cabecera">
          <h1>Añadir ítem</h1>
          <div class="sub">Todo ítem vive en una caja — crea la primera.</div>
        </header>
        <div class="flotante">
          <button type="button" class="cta" id="ir-nueva">Crear la primera caja</button>
        </div>
      </div>`);
    aviso.querySelector('#cerrar').addEventListener('click', () => volver('/'));
    aviso.querySelector('#ir-nueva').addEventListener('click', () =>
      navegar('/nueva', null, { reemplazar: true }));
    return aviso;
  }

  const raiz = ui.nodo(`
    <div>
      <nav class="barra barra--sola">
        <button type="button" class="icono-btn" id="cerrar"
                aria-label="Cerrar sin terminar">${ui.icono('cerrar')}</button>
      </nav>

      <header class="cabecera">
        <h1>Añadir ítem</h1>
        ${cajaFija
          ? (sinClasificar(cajaFija)
              ? `<div class="sub">a lo sin clasificar de ${ui.esc(sitio(cajaFija) || 'ningún sitio')}</div>`
              : `<div class="sub">a <span class="num">CAJA ${ui.esc(cajaFija.num)}</span> · ${ui.esc(cajaFija.nombre)}</div>`)
          : ''}
      </header>

      ${cajaFija ? '' : `
      <label class="selector-caja" id="selector-caja">
        <span class="selector-caja__prefijo">Va a:</span>
        <select id="caja-destino" aria-label="Caja de destino">
          ${cajas.map(c => `<option value="${ui.esc(c.id)}">` +
              (sinClasificar(c)
                ? (ui.esc(sitio(c) || 'Sin sitio') + ' · sin clasificar')
                : ('CAJA ' + ui.esc(c.num) + ' · ' + ui.esc(c.nombre))) +
            '</option>').join('')}
        </select>
        <span class="flecha" aria-hidden="true">${ui.icono('chevronAbajo')}</span>
      </label>`}

      <label class="buscador">
        <span aria-hidden="true">${ui.icono('lupa')}</span>
        <input type="search" id="q" placeholder="Buscar en el catálogo..." aria-label="Buscar en el catálogo"
               autocomplete="off" autocorrect="off" spellcheck="false">
      </label>

      <div class="lista" id="lista" style="margin-top: 18px;"></div>

      <button type="button" class="crear oculto" id="crear">
        <span class="tesela" aria-hidden="true">${ui.icono('mas', 20)}</span>
        <span>
          <span class="nombre" id="crear-nombre">Crear «»</span>
          <span class="tipo">Alta nueva en el catálogo</span>
        </span>
      </button>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const lista = $('#lista');
  const campo = $('#q');
  const crear = $('#crear');
  const crearNombre = $('#crear-nombre');
  const selectDestino = $('#caja-destino');

  function cajaActual() {
    if (cajaFija) return cajaFija;
    return selectDestino ? datos.caja(selectDestino.value) : null;
  }

  function pintar() {
    const texto = campo.value.trim();
    const items = texto ? datos.buscarItems(texto) : [];
    lista.innerHTML = items.map(it => `
      <article class="fila pulsable" data-item="${ui.esc(it.id)}">
        <span class="tesela" aria-hidden="true">${ui.cara(it)}</span>
        <div class="texto">
          <div class="nombre">${ui.resaltar(it.nombre, texto)}</div>
          <div class="tipo">${it.suministro ? 'Suministro' : 'Único'}</div>
        </div>
        <span class="btn-cuadrado" aria-hidden="true">${ui.icono('mas', 18)}</span>
      </article>`).join('');

    const exacto = items.some(it => ui.plano(it.nombre) === ui.plano(texto));
    if (texto && !exacto) {
      crear.classList.remove('oculto');
      crearNombre.textContent = 'Crear «' + texto + '»';
    } else {
      crear.classList.add('oculto');
    }
  }

  /* Un ítem por viaje: tocas, se marca y se vuelve a la caja. */
  let saliendo = false;
  lista.addEventListener('click', e => {
    const fila = e.target.closest('.fila');
    if (!fila || saliendo) return;
    const caja = cajaActual();
    if (!caja) return;
    const item = datos.item(fila.dataset.item);
    if (!item) return;

    saliendo = true;
    const lineas = datos.stockDeCaja(caja.id);
    const previa = lineas.find(l => l.item.id === item.id);
    const cantidadActual = previa ? previa.cantidad : 0;
    datos.ponerStock(item.id, caja.id, cantidadActual + 1);

    try {
      /* Con `itemId` y `cajaId` la caja destino reconoce SU novedad: sin
         ellos, la primera caja que se abriera se comería la marca. */
      localStorage.setItem('cajas.recien', JSON.stringify({
        itemId: item.id,
        cajaId: caja.id,
        emoji: item.emoji,
        nombre: item.nombre,
        tipo: item.suministro ? 'Suministro' : 'Único'
      }));
    } catch (err) { /* sin almacenamiento: se pierde la marca, nada más */ }

    const boton = fila.querySelector('.btn-cuadrado');
    boton.style.background = 'var(--carbon)';
    boton.style.borderColor = 'var(--carbon)';
    boton.style.color = '#fff';
    boton.innerHTML = ui.icono('check');
    /* Terminar el proceso es VOLVER, no avanzar: si se apilara, el atrás de
       la caja reabriría este mismo modal. */
    setTimeout(() => terminarProceso('/caja/' + encodeURIComponent(caja.id)), 260);
  });

  campo.addEventListener('input', pintar);
  ui.limpiable(campo);
  crear.addEventListener('click', () => {
    const caja = cajaActual();
    /* Un paso del mismo proceso sustituye al anterior: en la pila nunca hay
       más de un modal. */
    navegar('/crear', { nombre: campo.value.trim(), caja: caja ? caja.id : undefined },
            { reemplazar: true });
  });

  $('#cerrar').addEventListener('click', () =>
    volver(cajaFija ? '/caja/' + cajaFija.id : '/'));

  /* "/" enfoca el buscador si andabas por la pantalla. */
  function atajo(e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const a = document.activeElement;
    if (a && /^(input|textarea|select)$/i.test(a.tagName)) return;
    e.preventDefault();
    campo.focus();
  }
  document.addEventListener('keydown', atajo);
  alSalir(() => document.removeEventListener('keydown', atajo));

  pintar();
  /* El teclado ya viene subiendo desde el toque que abrió esta pantalla
     (ui.precalentarTeclado): aquí sólo hay que recoger el testigo. Pero el
     testigo no se puede recoger todavía —este árbol aún está suelto, y
     enfocar un campo fuera del documento no enfoca nada—, así que se espera
     a estar montado. El fantasma aguanta el teclado mientras tanto. */
  alMontar(() => ui.entregarTeclado(campo));

  return raiz;
}
