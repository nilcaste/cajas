/* =============================================================================
   Vista: editar  ·  ruta #/editar/:id
   =============================================================================
   El ítem entero en una pantalla: su cara (emoji o foto), su nombre y su tipo.
   Es el gemelo de "Ajustes de la caja", y la contraparte de "Nuevo ítem": lo
   que allí se rellena, aquí se corrige.

   Nada se guarda hasta pulsar Guardar — tampoco la foto, que sólo sube en ese
   momento. Cerrar con la ✕ deja el ítem exactamente como estaba.
   ========================================================================== */

import { datos } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, terminarProceso, alSalir } from '../app.js';
import * as fotos from '../fotos.js';

const REJILLA = ['🔨', '🧰', '🪛', '🔧', '🪚', '⚙️', '🧲', '🪜', '🧽', '🔋', '💡', '🕯️'];

/* La etiqueta que pone el almacén cuando nadie eligió emoji (ver `crearItem`
   en datos.js). Aquí NO se enseña como si fuera una elección: se enseña el
   hueco, para que se vea que hay algo por decidir. */
const GENERICO = '🏷️';

export function render(params) {
  const item = datos.item(params.id);
  if (!item) { navegar('/', null, { reemplazar: true }); return document.createElement('div'); }

  const itemId = item.id;
  const volverAlItem = '/item/' + encodeURIComponent(itemId);

  /* Lo que se está editando, todavía sin tocar el almacén. Vacío = el ítem
     nunca tuvo emoji propio, así que se enseña el placeholder. */
  let emoji = item.emoji === GENERICO ? '' : item.emoji;
  let foto = item.foto;        /* la que ya está guardada (URL) o ''        */
  let pendiente = null;        /* { blob, datos } elegida y aún sin subir   */
  let recortada = false;

  const raiz = ui.nodo(`
    <div>
      <nav class="barra barra--sola">
        <button type="button" class="icono-btn" id="cerrar"
                aria-label="Cerrar sin guardar">${ui.icono('cerrar')}</button>
      </nav>

      <header class="cabecera">
        <h1>Editar ítem</h1>
        <div class="sub">${ui.esc(item.nombre)}</div>
      </header>

      <div class="seccion">Nombre</div>
      <div class="campo campo--con-emoji">
        <button type="button" class="emoji-nombre${emoji ? '' : ' emoji-nombre--vacio'}"
                id="emoji-btn" aria-label="${emoji ? 'Cambiar el emoji' : 'Elegir un emoji'}">
          <span id="preview-emoji">${emoji ? ui.esc(emoji) : ui.icono('emoji')}</span>
        </button>
        <input type="text" id="nombre" value="${ui.esc(item.nombre)}"
               aria-label="Nombre del ítem" autocomplete="off"
               autocorrect="on" autocapitalize="sentences" spellcheck="true">
      </div>

      <div class="seccion">Foto</div>
      <button type="button" class="accion" id="hacer-foto">
        <span class="tesela tesela--icono" id="foto-tesela" aria-hidden="true">${ui.icono('camara')}</span>
        <span class="texto">
          <span class="nombre" id="foto-titulo">Hacer una foto</span>
          <span class="tipo" id="foto-estado">Opcional · sustituye al emoji</span>
        </span>
      </button>
      <div class="botones-foto oculto" id="botones-foto">
        <button type="button" class="boton-linea" id="recortar-foto">Recortar contorno</button>
        <button type="button" class="boton-linea boton-linea--baja" id="quitar-foto">Eliminar foto</button>
      </div>

      <div class="seccion">Tipo</div>
      <div class="pestanas" role="tablist" aria-label="Tipo de ítem"
           data-activa="${item.suministro ? 0 : 1}" id="tipo">
        <span class="pestanas__pastilla" aria-hidden="true"></span>
        <button type="button" class="pestanas__tab" role="tab"
                aria-selected="${item.suministro}">Suministro</button>
        <button type="button" class="pestanas__tab" role="tab"
                aria-selected="${!item.suministro}">Único</button>
      </div>
      <div class="pista" id="pista-tipo"></div>

      <div class="velo-inferior" aria-hidden="true"></div>
      <div class="flotante">
        <button type="button" class="cta cta--sin-morph" id="guardar">Guardar</button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const previewEmoji = $('#preview-emoji');
  const botonEmoji = $('#emoji-btn');

  function ponerEmoji(nuevo) {
    emoji = String(nuevo || '').trim();
    previewEmoji.textContent = emoji;
    botonEmoji.classList.toggle('emoji-nombre--vacio', !emoji);
    if (!emoji) previewEmoji.innerHTML = ui.icono('emoji');
    botonEmoji.setAttribute('aria-label', emoji ? 'Cambiar el emoji' : 'Elegir un emoji');
  }
  const teselaFoto = $('#foto-tesela');
  const tituloFoto = $('#foto-titulo');
  const estadoFoto = $('#foto-estado');
  const botonesFoto = $('#botones-foto');
  const botonRecortar = $('#recortar-foto');

  /* ------------------------------------------------------------- emoji -- */
  $('#emoji-btn').addEventListener('click', () => {
    const { cuerpo, cerrar } = ui.hoja({
      titulo: 'Emoji del ítem',
      contenido: `
        <div class="hoja__separador" style="margin-top: 0;">Cualquiera vale — escríbelo o elige uno</div>
        <label class="campo-emoji">
          <input type="text" id="emoji-libre" placeholder="Escribe aquí un emoji…" autocomplete="off">
        </label>
        <div class="rejilla-rapida" id="rejilla-rapida">
          ${REJILLA.map(e => `<button type="button">${e}</button>`).join('')}
        </div>`
    });
    const libre = cuerpo.querySelector('#emoji-libre');
    const poner = valor => {
      const elegido = String(valor || '').trim();
      if (elegido) ponerEmoji(elegido);
      cerrar();
    };
    libre.addEventListener('input', () => {
      const v = [...libre.value.trim()];
      if (v.length) poner(v.slice(0, 2).join(''));
    });
    cuerpo.querySelector('#rejilla-rapida').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) poner(b.textContent);
    });
  });

  /* -------------------------------------------------------------- foto -- */
  const caraActual = () => (pendiente ? pendiente.datos : foto);

  function pintarFoto(estado) {
    const cara = caraActual();
    if (cara) {
      teselaFoto.classList.remove('tesela--icono');
      teselaFoto.innerHTML = '<img class="foto" src="' + ui.esc(cara) + '" alt="">';
      tituloFoto.textContent = 'Cambiar la foto';
      estadoFoto.textContent = estado || (recortada ? 'Recortada, sin fondo' : 'Es la cara del ítem');
      botonesFoto.classList.remove('oculto');
    } else {
      teselaFoto.classList.add('tesela--icono');
      teselaFoto.innerHTML = ui.icono('camara');
      tituloFoto.textContent = 'Hacer una foto';
      estadoFoto.textContent = estado || 'Opcional · sustituye al emoji';
      botonesFoto.classList.add('oculto');
    }
  }

  async function tomar(archivo) {
    if (!archivo) return;
    const libre = ui.ocupar(guardar, 'Preparando la foto…');
    estadoFoto.textContent = 'Preparando…';
    try {
      pendiente = await fotos.preparar(archivo);
      recortada = false;
      pintarFoto();
    } catch (e) {
      console.error('[cajas] la foto no se ha podido leer', e);
      pintarFoto('No se ha podido leer esa imagen');
    } finally {
      libre();
    }
  }

  $('#hacer-foto').addEventListener('click', async () => tomar(await fotos.elegir()));
  alSalir(fotos.soltable($('#hacer-foto'), tomar));

  botonRecortar.addEventListener('click', async () => {
    const cara = caraActual();
    if (!cara) return;
    botonRecortar.disabled = true;
    const libre = ui.ocupar(guardar, 'Recortando el contorno…');
    try {
      /* Si la foto ya está subida hay que bajarla a un blob: dibujar una
         imagen de otro dominio mancha el canvas y ya no se puede leer. */
      const origen = pendiente ? pendiente.blob : await (await fetch(cara)).blob();
      const silueta = await fotos.silueta(origen, (clave, hecho, total) => {
        const pct = total ? Math.round(hecho / total * 100) : 0;
        estadoFoto.textContent = /fetch/.test(clave)
          ? 'Preparando el recorte, la primera vez tarda… ' + pct + '%'
          : 'Recortando el contorno…';
      });
      if (!silueta) { pintarFoto('No he encontrado el objeto — se queda igual'); return; }
      pendiente = silueta;
      recortada = true;
      pintarFoto();
    } catch (e) {
      console.error('[cajas] no se ha podido recortar', e);
      pintarFoto('No se ha podido recortar · inténtalo otra vez');
    } finally {
      botonRecortar.disabled = false;
      libre();
    }
  });

  $('#quitar-foto').addEventListener('click', () => {
    pendiente = null;
    foto = '';
    recortada = false;
    pintarFoto();
  });

  pintarFoto();

  /* -------------------------------------------------------------- tipo -- */
  const tipoEl = $('#tipo');
  const tabs = [...tipoEl.querySelectorAll('.pestanas__tab')];
  const pista = $('#pista-tipo');
  function contarTipo() {
    pista.textContent = tipoEl.dataset.activa === '0'
      ? 'Suministro: se compra más de una vez, cuenta por unidades.'
      : 'Único: solo hay uno, está en una caja o no está.';
  }
  contarTipo();
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    tipoEl.dataset.activa = i;
    tabs.forEach((x, j) => x.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    contarTipo();
  }));

  /* ------------------------------------------------------------ guardar -- */
  const guardar = $('#guardar');
  guardar.addEventListener('click', async () => {
    let url = foto;

    /* La foto sube ahora, ya con el encuadre que se ve en la miniatura. */
    if (pendiente) {
      const libre = ui.ocupar(guardar, 'Subiendo la foto…');
      try {
        url = await fotos.subir(pendiente);
      } catch (e) {
        console.error('[cajas] la foto no ha subido', e);
        pintarFoto('No se ha podido subir · inténtalo otra vez');
        libre();
        return;
      }
      libre();
    }

    datos.actualizarItem(itemId, {
      nombre: $('#nombre').value.trim() || item.nombre,
      /* Sin emoji elegido vuelve la etiqueta: un ítem sin foto necesita
         alguna cara, aunque sea la genérica. */
      emoji: emoji || GENERICO,
      suministro: tipoEl.dataset.activa === '0',
      foto: url
    });
    terminarProceso(volverAlItem);
  });

  $('#cerrar').addEventListener('click', () => volver(volverAlItem));

  return raiz;
}
