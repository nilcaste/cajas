/* =============================================================================
   Vista: nueva  ·  ruta #/nueva
   Maqueta de referencia: maquetas/prueba-medkit-nueva.html · maquetas/sitios.html
   =============================================================================
   Dos cosas se crean aquí, y son la misma con una diferencia:

     · una CAJA, con su número de pegatina y su nombre;
     · lo SIN CLASIFICAR de un sitio — el papel higiénico del armario negro:
       mismo contenedor, mismo stock, mismo QR, pero sin número. Por eso no
       pide ni número ni nombre: se llama por el sitio donde está.

   Y las dos preguntan lo mismo al final: dónde está. Eso —el sitio— es lo que
   agrupa la retícula de la home, sin ser una carpeta en la que haya que
   entrar.
   ========================================================================== */

import { datos, listarSitios, sinClasificar, sitio as sitioDe } from '../datos.js';
import * as ui from '../ui.js';
import { volver, terminarProceso } from '../app.js';

export function render() {
  const sugerido = datos.siguienteNum();
  const sitios = listarSitios();
  /* Un sitio no puede tener dos "sin clasificar": sería la misma balda
     contada dos veces. Los que ya tienen uno no se ofrecen. */
  const ocupados = new Set(datos.listarCajas()
    .filter(sinClasificar)
    .map(c => ui.plano(sitioDe(c))));

  const raiz = ui.nodo(`
    <div>
      <nav class="barra barra--sola">
        <button type="button" class="icono-btn" id="cerrar"
                aria-label="Cerrar sin crear">${ui.icono('cerrar')}</button>
      </nav>

      <header class="cabecera">
        <h1>Nueva caja</h1>
        <div class="sub" id="sub">Se creará con el número <span class="num">${ui.esc(sugerido)}</span></div>
      </header>

      <div class="pestanas" role="tablist" aria-label="Qué se crea" data-activa="0" id="tipo">
        <span class="pestanas__pastilla" aria-hidden="true"></span>
        <button type="button" class="pestanas__tab" role="tab" aria-selected="true">Caja</button>
        <button type="button" class="pestanas__tab" role="tab" aria-selected="false">Sin clasificar</button>
      </div>

      <div id="de-caja">
        <div class="seccion">Número</div>
        <label class="campo">
          <input class="mono" type="text" id="num" value="${ui.esc(sugerido)}"
                 aria-label="Número de la caja" autocomplete="off" inputmode="numeric">
        </label>
        <div class="pista">Es el número de la pegatina. Puede repetirse: tú mandas.</div>

        <div class="seccion">Nombre</div>
        <label class="campo">
          <input type="text" id="nombre" value="" placeholder="Qué guarda esta caja"
                 aria-label="Nombre de la caja" autocomplete="off"
                 autocorrect="on" autocapitalize="sentences" spellcheck="true">
        </label>
      </div>

      <div class="pista oculto" id="pista-suelto">
        Lo que está en el sitio pero no dentro de una caja: el papel higiénico
        del armario. No lleva número ni nombre — se llama por su sitio.
      </div>

      <div class="seccion">¿Dónde está?</div>
      <div id="sitio"></div>
      <div class="pista">El sitio sólo agrupa la home: no hay que entrar en él para llegar a una caja.</div>

      <div class="velo-inferior" aria-hidden="true"></div>
      <div class="flotante">
        <button type="button" class="cta cta--sin-morph" id="crear">Crear caja</button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const selector = ui.selectorSitio('', sitios);
  $('#sitio').appendChild(selector.nodo);

  /* ---------------------------------------------------------- qué se crea -- */
  const tipoEl = $('#tipo');
  const tabs = [...tipoEl.querySelectorAll('.pestanas__tab')];
  const esSuelto = () => tipoEl.dataset.activa === '1';

  function pintarTipo() {
    const suelto = esSuelto();
    $('#de-caja').classList.toggle('oculto', suelto);
    $('#pista-suelto').classList.toggle('oculto', !suelto);
    $('#crear').textContent = suelto ? 'Crear' : 'Crear caja';
    $('#sub').innerHTML = suelto
      ? 'Para lo que está en un sitio pero no en una caja'
      : 'Se creará con el número <span class="num">' + ui.esc(sugerido) + '</span>';
  }

  tabs.forEach((t, i) => t.addEventListener('click', () => {
    tipoEl.dataset.activa = i;
    tabs.forEach((x, j) => x.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    pintarTipo();
  }));
  pintarTipo();

  /* --------------------------------------------------------------- crear -- */
  $('#cerrar').addEventListener('click', () => volver('/'));

  $('#crear').addEventListener('click', () => {
    const donde = selector.valor();

    if (esSuelto() && ocupados.has(ui.plano(donde))) {
      ui.toast(donde ? '«' + donde + '» ya tiene su sin clasificar' : 'Ya hay un sin clasificar sin sitio');
      return;
    }

    const nueva = esSuelto()
      ? datos.crearCaja({ num: '', nombre: '', ubicacion: donde })
      : datos.crearCaja({
          num: $('#num').value.trim(),
          nombre: $('#nombre').value.trim(),
          ubicacion: donde
        });
    terminarProceso('/caja/' + encodeURIComponent(nueva.id));
  });

  return raiz;
}
