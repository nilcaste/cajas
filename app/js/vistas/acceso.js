/* =============================================================================
   Vista: acceso  ·  la puerta
   =============================================================================
   No tiene ruta propia: cuando hay configuración de Supabase y NO hay sesión,
   el router la pinta en lugar de la vista que tocara (incluido el QR de una
   caja, que espera aquí y llega a su destino en cuanto entras).

   Enlace mágico y nada más: sin contraseñas que recordar ni que guardar. Se
   pide el correo, Supabase manda un enlace y al volver ya hay sesión.

   Es la única pantalla de la app sin maqueta previa: se construye con piezas
   del sistema (.campo, .cta, .pista) y lo único nuevo es la columna .acceso.
   ========================================================================== */

import * as ui from '../ui.js';
import { nube } from '../supabase-adapter.js';

/* El correo se recuerda entre intentos: el enlace se suele abrir en otro sitio
   y volver aquí a reescribirlo es un fastidio. */
const CLAVE_CORREO = 'cajas.correo';

function recordar(correo) {
  try { localStorage.setItem(CLAVE_CORREO, correo); } catch (e) { /* sin almacenamiento */ }
}
function recordado() {
  try { return localStorage.getItem(CLAVE_CORREO) || ''; } catch (e) { return ''; }
}

/* Traducción de los errores de Supabase a algo que se pueda leer. */
function explicar(error) {
  const m = String((error && error.message) || '').toLowerCase();
  if (!m) return 'No se ha podido enviar el enlace. Inténtalo otra vez.';
  if (m.includes('signups not allowed') || m.includes('not authorized') || m.includes('user not found')) {
    return 'Ese correo no tiene acceso. Esta app es sólo para vosotros dos.';
  }
  if (m.includes('rate limit') || m.includes('for security purposes') || m.includes('too many')) {
    return 'Acabas de pedir uno. Espera un minuto y vuelve a intentarlo.';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return 'Sin conexión. Inténtalo cuando vuelva la cobertura.';
  }
  if (m.includes('invalid') && m.includes('email')) return 'Ese correo no parece válido.';
  return 'No se ha podido enviar el enlace. Inténtalo otra vez.';
}

export function render() {
  const raiz = ui.nodo(`
    <div class="acceso">
      <div class="acceso__marca">cajas</div>

      <div id="paso-correo">
        <p class="acceso__sub">El almacén de casa.<br>Entra con tu correo y te mandamos un enlace.</p>
        <form id="forma" novalidate>
          <label class="campo">
            <input type="email" id="correo" value="${ui.esc(recordado())}"
                   placeholder="tu@correo.com" aria-label="Tu correo"
                   autocomplete="email" autocapitalize="off" autocorrect="off"
                   spellcheck="false" inputmode="email" enterkeyhint="send">
          </label>
          <button type="submit" class="cta cta--sin-morph" id="enviar">Enviarme un enlace</button>
        </form>
        <p class="pista oculto" id="error" role="alert"></p>
      </div>

      <div id="paso-hecho" class="oculto">
        <p class="acceso__sub">Revisa tu correo.<br>Te hemos mandado un enlace para entrar.</p>
        <p class="pista">Abre el enlace en este mismo dispositivo. Caduca en una hora
          y sólo sirve una vez.</p>
        <button type="button" class="acceso__otro" id="otro">Usar otro correo</button>
      </div>
    </div>
  `);

  const $ = sel => raiz.querySelector(sel);
  const forma = $('#forma');
  const campo = $('#correo');
  const boton = $('#enviar');
  const error = $('#error');

  function fallar(texto) {
    error.textContent = texto;
    error.classList.remove('oculto');
  }

  forma.addEventListener('submit', async e => {
    e.preventDefault();
    const correo = campo.value.trim();
    error.classList.add('oculto');

    /* Validación mínima: sólo para no gastar un viaje a la red por una errata
       evidente. La de verdad la hace Supabase. */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      fallar('Escribe un correo válido.');
      campo.focus();
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      await nube.enviarEnlace(correo);
      recordar(correo);
      $('#paso-correo').classList.add('oculto');
      $('#paso-hecho').classList.remove('oculto');
    } catch (err) {
      console.warn('[cajas] no se ha podido enviar el enlace', err);
      fallar(explicar(err));
      boton.disabled = false;
      boton.textContent = 'Enviarme un enlace';
    }
  });

  /* Intro envía. El envío implícito del formulario ya lo haría, pero el campo
     vive dentro de un <label> y no cuesta nada asegurarlo. */
  campo.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (forma.requestSubmit) forma.requestSubmit();
    else forma.dispatchEvent(new Event('submit', { cancelable: true }));
  });

  $('#otro').addEventListener('click', () => {
    $('#paso-hecho').classList.add('oculto');
    $('#paso-correo').classList.remove('oculto');
    boton.disabled = false;
    boton.textContent = 'Enviarme un enlace';
    campo.focus();
    campo.select();
  });

  return raiz;
}
