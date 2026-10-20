/* =============================================================================
   Vista: ajustes  ·  ruta #/ajustes/:id
   Maqueta de referencia: maquetas/prueba-medkit-ajustes.html
   ========================================================================== */

import { datos, listarSitios, sinClasificar, rotulo } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver } from '../app.js';
import { irAPestana, PESTANA } from './home.js';

export function render(params) {
  const caja = datos.caja(params.id);
  if (!caja) { navegar('/', null, { reemplazar: true }); return document.createElement('div'); }

  /* Lo sin clasificar de un sitio es una caja sin número: aquí no se le
     pregunta ni por el número ni por el nombre, porque no tiene. */
  const suelta = sinClasificar(caja);

  const raiz = ui.nodo(`
    <div>
      <nav class="barra barra--sola">
        <button type="button" class="icono-btn" id="cerrar"
                aria-label="Cerrar sin guardar">${ui.icono('cerrar')}</button>
      </nav>

      <header class="cabecera">
        <h1>${suelta ? 'Ajustes' : 'Ajustes de la caja'}</h1>
        <div class="sub">${suelta
          ? ui.esc(caja.ubicacion || 'Sin sitio') + ' · sin clasificar'
          : '<span class="num">CAJA ' + ui.esc(caja.num) + '</span>' +
            (caja.nombre ? ' · ' + ui.esc(caja.nombre) : '')}</div>
      </header>

      ${suelta ? '' : `
      <div class="seccion">Número</div>
      <label class="campo">
        <input class="mono" type="text" id="num" value="${ui.esc(caja.num)}"
               aria-label="Número de la caja" autocomplete="off" inputmode="numeric">
      </label>
      <div class="pista">Es el número de la pegatina. Puede repetirse: tú mandas.</div>

      <div class="seccion">Nombre</div>
      <label class="campo">
        <input type="text" id="nombre" value="${ui.esc(caja.nombre)}"
               aria-label="Nombre de la caja" autocomplete="off"
               autocorrect="on" autocapitalize="sentences" spellcheck="true">
      </label>`}

      <div class="seccion">¿Dónde está?</div>
      <div id="sitio"></div>
      <div class="pista">El sitio agrupa la home: las cajas del mismo sitio salen juntas.</div>

      <div class="seccion">Esta caja</div>
      <button type="button" class="accion accion--destructiva" id="eliminar">
        <span class="tesela tesela--icono" aria-hidden="true">${ui.icono('papelera', 22, 2.4)}</span>
        <span class="texto">
          <span class="nombre">Eliminar caja</span>
        </span>
      </button>

      <div class="velo-inferior" aria-hidden="true"></div>
      <div class="flotante">
        <button type="button" class="cta cta--sin-morph" id="guardar">Guardar</button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const selector = ui.selectorSitio(caja.ubicacion, listarSitios());
  $('#sitio').appendChild(selector.nodo);

  $('#cerrar').addEventListener('click', () => volver('/caja/' + caja.id));

  /* Eliminar la caja. Como en el catálogo, la hoja es la única barrera: sin
     deshacer detrás. Los ítems no se tocan, y eso se dice en la propia hoja
     porque es la duda que tiene cualquiera al pulsar. */
  $('#eliminar').addEventListener('click', () => {
    const { dialog, cerrar } = ui.hoja({
      titulo: '¿Eliminar «' + rotulo(caja) + '»?',
      contenido:
        '<div class="pista">Sus ítems no se borran del catálogo: quedan sin ubicar.</div>' +
        '<div class="hoja__acciones">' +
          '<button type="button" class="cta cta--sin-morph" data-eliminar>Eliminar</button>' +
          '<button type="button" class="boton-fantasma" data-cancelar>Cancelar</button>' +
        '</div>'
    });

    dialog.addEventListener('click', e => {
      if (e.target.closest('[data-cancelar]')) { cerrar(); return; }
      if (!e.target.closest('[data-eliminar]')) return;
      cerrar();
      datos.eliminarCaja(caja.id);
      /* A la home y a la pestaña Cajas: la caja de la que veníamos ya no
         existe, volver a ella sería un callejón sin salida. */
      irAPestana(PESTANA.cajas);
      navegar('/', null, { reemplazar: true });
    });
  });

  $('#guardar').addEventListener('click', () => {
    const cambios = { ubicacion: selector.valor() };
    /* Una caja sin número no gana uno por pasar por aquí: los campos ni
       existen, y mandar `''` sería borrarle el nombre a la de al lado. */
    if (!suelta) {
      cambios.num = $('#num').value.trim();
      cambios.nombre = $('#nombre').value.trim();
    }
    datos.actualizarCaja(caja.id, cambios);
    volver('/caja/' + caja.id);
  });

  return raiz;
}
