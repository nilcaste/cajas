/* =============================================================================
   Vista: crear  ·  ruta #/crear?nombre=&caja=
   Maqueta de referencia: maquetas/prueba-medkit-crear.html
   =============================================================================
   Alta mínima en el catálogo: nombre, emoji o foto, y tipo.
   ========================================================================== */

import { datos } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, terminarProceso, alSalir } from '../app.js';
import * as fotos from '../fotos.js';

const REJILLA = ['🔨', '🧰', '🪛', '🔧', '🪚', '⚙️', '🧲', '🪜', '🧽', '🔋', '💡', '🕯️'];

export function render(params) {
  const caja = params.caja ? datos.caja(params.caja) : null;
  /* Un ítem SIEMPRE nace en una caja: sin destino válido, de vuelta al
     flujo de añadir (que elige o crea la caja primero). */
  if (!caja) {
    navegar('/anadir', null, { reemplazar: true });
    return document.createElement('div');
  }

  const nombreParam = String(params.nombre || '');
  const nombreInicial = nombreParam
    ? nombreParam.charAt(0).toUpperCase() + nombreParam.slice(1)
    : '';

  const raiz = ui.nodo(`
    <div>
      <nav class="barra barra--sola">
        <button type="button" class="icono-btn" id="volver" aria-label="Volver">${ui.icono('volver')}</button>
      </nav>

      <header class="cabecera">
        <h1>Nuevo ítem</h1>
        <div class="sub">${caja
          ? 'irá a <span class="num">CAJA ' + ui.esc(caja.num) + '</span> · ' + ui.esc(caja.nombre)
          : 'Alta nueva en el catálogo'}</div>
      </header>

      <div class="seccion">Nombre</div>
      <div class="campo campo--con-emoji">
        <!-- Sin emoji elegido esto NO enseña un emoji cualquiera: enseña un
             icono de la UI, que se lee como "toca y elige". Si al guardar
             sigue vacío, el almacén le pone el suyo. -->
        <button type="button" class="emoji-nombre emoji-nombre--vacio" id="emoji-btn"
                aria-label="Elegir un emoji">
          <span id="preview-emoji">${ui.icono('emoji')}</span>
        </button>
        <input type="text" id="nombre" value="${ui.esc(nombreInicial)}" aria-label="Nombre del ítem"
               autocomplete="off" autocorrect="on" autocapitalize="sentences" spellcheck="true">
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
      <!-- Por defecto, Suministro: la mayoría de lo que se guarda en una caja
           se compra más de una vez. (La maqueta arrancaba en Único por un
           estado accidental del prototipo.) -->
      <div class="pestanas" role="tablist" aria-label="Tipo de ítem" data-activa="0" id="tipo">
        <span class="pestanas__pastilla" aria-hidden="true"></span>
        <button type="button" class="pestanas__tab" role="tab" aria-selected="true">Suministro</button>
        <button type="button" class="pestanas__tab" role="tab" aria-selected="false">Único</button>
      </div>
      <div class="pista" id="pista-tipo">Suministro: se compra más de una vez, cuenta por unidades.</div>

      <div class="velo-inferior" aria-hidden="true"></div>
      <div class="flotante">
        <button type="button" class="cta" id="guardar">
          <span aria-hidden="true">${ui.icono('mas', 20, 2.6)}</span>
          Añadir a la caja
        </button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const campoNombre = $('#nombre');
  const previewEmoji = $('#preview-emoji');
  const botonEmoji = $('#emoji-btn');

  /* Vacío mientras el usuario no elija: es la diferencia entre "no ha dicho
     nada" y "ha querido la etiqueta". */
  let emoji = '';
  function ponerEmoji(nuevo) {
    emoji = String(nuevo || '').trim();
    previewEmoji.textContent = emoji;
    botonEmoji.classList.toggle('emoji-nombre--vacio', !emoji);
    if (!emoji) previewEmoji.innerHTML = ui.icono('emoji');
    botonEmoji.setAttribute('aria-label', emoji ? 'Cambiar el emoji' : 'Elegir un emoji');
  }
  const tipoEl = $('#tipo');
  const tabs = [...tipoEl.querySelectorAll('.pestanas__tab')];
  const pista = $('#pista-tipo');

  /* -------------------------------------------------------- emoji: hoja -- */
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
    const emojiLibre = cuerpo.querySelector('#emoji-libre');
    emojiLibre.addEventListener('input', () => {
      const v = [...emojiLibre.value.trim()];
      if (!v.length) return;
      ponerEmoji(v.slice(0, 2).join(''));
      emojiLibre.value = '';
      cerrar();
    });
    cuerpo.querySelector('#rejilla-rapida').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      ponerEmoji(b.textContent);
      cerrar();
    });
  });

  /* ---------------------------------------------------------------- foto -- */
  /* La foto manda sobre el emoji: si la hay, es la cara del ítem.

     Nada se sube hasta que se guarda el ítem. Así el recorte se ve al momento
     en la miniatura, se puede deshacer, y una foto que al final no quieres no
     deja basura en el almacén. */
  let original = null;      /* el archivo tal cual salió del móvil          */
  let entera = null;        /* { blob, datos } cuadrada, sin recortar       */
  let ajustada = null;      /* { blob, datos } recortada al objeto          */
  let recortada = false;    /* cuál de las dos se está usando               */

  const teselaFoto = $('#foto-tesela');
  const tituloFoto = $('#foto-titulo');
  const estadoFoto = $('#foto-estado');
  const botonesFoto = $('#botones-foto');
  const botonRecortar = $('#recortar-foto');
  const botonQuitar = $('#quitar-foto');

  const fotoActual = () => (recortada ? ajustada : entera);

  function pintarFoto(estado) {
    const foto = fotoActual();
    if (foto) {
      teselaFoto.classList.remove('tesela--icono');
      teselaFoto.innerHTML = '<img class="foto" src="' + foto.datos + '" alt="">';
      tituloFoto.textContent = 'Cambiar la foto';
      estadoFoto.textContent = estado || (recortada ? 'Recortada, sin fondo' : 'Es la cara del ítem');
      botonesFoto.classList.remove('oculto');
      botonRecortar.textContent = recortada ? 'Deshacer el recorte' : 'Recortar contorno';
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
      original = archivo;
      entera = await fotos.preparar(archivo);
      ajustada = null;
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

  /* En el ordenador la foto suele estar ya en el escritorio: arrástrala aquí
     y no hay que abrir ningún diálogo. */
  alSalir(fotos.soltable($('#hacer-foto'), tomar));

  botonRecortar.addEventListener('click', async () => {
    if (!original) return;
    if (recortada) { recortada = false; pintarFoto(); return; }

    /* Ya calculado antes: recortar y deshacer no cuesta nada. */
    if (ajustada) { recortada = true; pintarFoto(); return; }

    botonRecortar.disabled = true;
    const libre = ui.ocupar(guardar, 'Recortando el contorno…');
    try {
      ajustada = await fotos.silueta(original, (clave, hecho, total) => {
        /* La primera vez se baja el modelo: sin este aviso parece colgado. */
        const pct = total ? Math.round(hecho / total * 100) : 0;
        estadoFoto.textContent = /fetch/.test(clave)
          ? 'Preparando el recorte, la primera vez tarda… ' + pct + '%'
          : 'Recortando el contorno…';
      });
      recortada = !!ajustada;
      pintarFoto(ajustada ? null : 'No he encontrado el objeto — se queda entera');
    } catch (e) {
      console.error('[cajas] no se ha podido recortar', e);
      pintarFoto('No se ha podido recortar · inténtalo otra vez');
    } finally {
      botonRecortar.disabled = false;
      libre();
    }
  });

  botonQuitar.addEventListener('click', () => {
    original = entera = ajustada = null;
    recortada = false;
    pintarFoto();
  });

  /* ---------------------------------------------------------------- tipo -- */
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    tipoEl.dataset.activa = i;
    tabs.forEach((x, j) => x.setAttribute('aria-selected', j === i ? 'true' : 'false'));
    pista.textContent = i === 0
      ? 'Suministro: se compra más de una vez, cuenta por unidades.'
      : 'Único: solo hay uno, está en una caja o no está.';
  }));

  /* ----------------------------------------------------------------- CTA -- */
  const guardar = $('#guardar');
  guardar.addEventListener('click', async () => {
    const nombre = campoNombre.value.trim();
    const suministro = tipoEl.dataset.activa === '0';
    /* Si no ha elegido ninguno, la etiqueta genérica: un ítem sin foto
       necesita alguna cara. */
    const suEmoji = emoji || '🏷️';

    /* La foto sube ahora, ya con el encuadre que se ve en la miniatura. */
    let foto = '';
    if (fotoActual()) {
      const libre = ui.ocupar(guardar, 'Subiendo la foto…');
      try {
        foto = await fotos.subir(fotoActual());
      } catch (e) {
        console.error('[cajas] la foto no ha subido', e);
        pintarFoto('No se ha podido subir · inténtalo otra vez');
        libre();
        return;
      }
      libre();
    }

    const nuevo = datos.crearItem({ nombre, emoji: suEmoji, suministro, foto });

    if (caja) {
      datos.ponerStock(nuevo.id, caja.id, 1);
      try {
        /* Con `itemId` y `cajaId` la caja destino reconoce SU novedad: sin
           ellos, la primera caja que se abriera se comería la marca. */
        localStorage.setItem('cajas.recien', JSON.stringify({
          itemId: nuevo.id,
          cajaId: caja.id,
          emoji: nuevo.emoji,
          nombre: nuevo.nombre,
          tipo: suministro ? 'Suministro' : 'Único'
        }));
      } catch (err) { /* sin almacenamiento: se pierde la marca, nada más */ }
      terminarProceso('/caja/' + encodeURIComponent(caja.id));
    } else {
      terminarProceso('/');
    }
  });

  /* Atrás vuelve al buscador del catálogo, y lo hace sustituyendo: los dos
     son pasos del mismo proceso, no dos pantallas. */
  $('#volver').addEventListener('click', () =>
    navegar('/anadir', caja ? { caja: caja.id } : null, { reemplazar: true }));

  return raiz;
}
