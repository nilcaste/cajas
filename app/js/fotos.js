/* =============================================================================
   Cajas — fotos de ítems
   =============================================================================
   Una foto vale más que un emoji cuando tienes tres botes blancos iguales.
   El flujo entero, de un toque a una URL:

     elegir()            ->  File | null        selector del sistema
     preparar(archivo)   ->  { blob, datos }    cuadrada y al tamaño final
     silueta(archivo, fn)->  { blob, datos } | null   recortada como pegatina
     subir(foto)         ->  URL                sube lo que le des
     soltable(zona, fn)                         arrastrar y soltar

   Las pantallas las componen: `preparar` para ver la foto tal cual, y
   `silueta` cuando el usuario pide quitarse el fondo de encima. Recortar es
   SIEMPRE a petición: cuesta megas y segundos, y una foto que se recorta sola
   cuando no toca es peor que una foto sin recortar.

   Sin nube configurada (modo local) no hay dónde subirla: se guarda como
   `data:` dentro del propio almacén. Vale para probar; no para un almacén de
   verdad, porque localStorage se llena enseguida.
   ========================================================================== */

import { nube } from './supabase-adapter.js';

/* Lado de la foto guardada. La tesela más grande de la app son 56 px, así que
   con 1000 va sobrada incluso en pantallas de mucha densidad, y una foto de
   móvil pasa de ~4 MB a ~150 KB. */
const LADO = 1000;
const CALIDAD = 0.82;

/* ------------------------------------------------------------- selector ---- */
/* `accept="image/*"` sin `capture`: así el móvil ofrece cámara Y carrete, que
   es lo que quiere alguien que está guardando cosas en una caja. El input
   vive lo justo y se va, para no dejar nodos sueltos por el documento. */
function elegirArchivo() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    document.body.appendChild(input);

    let resuelto = false;
    const terminar = archivo => {
      if (resuelto) return;
      resuelto = true;
      input.remove();
      resolve(archivo || null);
    };

    input.addEventListener('change', () => terminar(input.files && input.files[0]));
    /* Si se cancela, `change` no llega nunca: el foco volviendo a la ventana
       es la única señal de que el diálogo se ha cerrado. */
    addEventListener('focus', () => setTimeout(() => terminar(null), 500), { once: true });

    input.click();
  });
}

/* --------------------------------------------------------------- cargar ---- */
function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => resolve({ img, soltar: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('el archivo no es una imagen'));
    };
    img.src = url;
  });
}

/* --------------------------------------------------------------- objeto ---- */
/* Dónde está la cosa que has fotografiado. Sirve para lo de casa: un objeto
   sobre una encimera, una mesa, el suelo.

     1. Se mira la foto en pequeño y se puntúa cada píxel por cuánto se aleja
        del color del fondo (la mediana del borde) y por cuánto contraste
        tiene alrededor. Un bote blanco sobre mármol blanco casi no cambia de
        color, pero sus filos sí se notan.
     2. Se EMBORRONA esa puntuación. Es el paso que lo cambia todo: las vetas
        del mármol son rayas finas y se diluyen; el objeto es una mancha
        compacta y sobrevive.
     2b. El corte se pone por PROPORCIÓN (el 20 % de la foto que más puntúa) y
        no como fracción del máximo. Con un tubo blanco de tapón rosa, el
        tapón dispara el máximo y el resto del tubo se quedaría fuera.
     3. De las manchas que quedan se elige una sola —la más gorda, penalizando
        las que tocan el borde (el mueble del fondo, la pared) y las que están
        lejos del centro— y se recorta cuadrado a su alrededor.

   No es reconocimiento de objetos: es geometría. Por eso el recorte va en un
   botón y no automático, y por eso devuelve `null` cuando no ve nada claro,
   en vez de inventarse un encuadre. */
const ANALISIS = 200;      /* lado mayor con el que se estudia la foto      */
const RADIO = 0.05;        /* cuánto se emborrona, en tantos por uno        */
const PORCION = 0.20;      /* qué parte de la foto se considera "algo"      */
const CRECER = 0.15;       /* la mancha se estira un poco: los filos        */
const MARGEN = 0.05;       /*   transparentes puntúan poco                  */

function mediana(valores) {
  const v = valores.slice().sort((a, b) => a - b);
  return v[v.length >> 1];
}

/* Media móvil con imagen integral: da igual el radio, cuesta lo mismo. */
function emborronar(mapa, an, al, radio) {
  const suma = new Float64Array((an + 1) * (al + 1));
  for (let y = 0; y < al; y++) {
    let fila = 0;
    for (let x = 0; x < an; x++) {
      fila += mapa[y * an + x];
      suma[(y + 1) * (an + 1) + x + 1] = suma[y * (an + 1) + x + 1] + fila;
    }
  }
  const fuera = new Float64Array(an * al);
  for (let y = 0; y < al; y++) {
    const y0 = Math.max(0, y - radio), y1 = Math.min(al, y + radio + 1);
    for (let x = 0; x < an; x++) {
      const x0 = Math.max(0, x - radio), x1 = Math.min(an, x + radio + 1);
      const total = suma[y1 * (an + 1) + x1] - suma[y0 * (an + 1) + x1]
                  - suma[y1 * (an + 1) + x0] + suma[y0 * (an + 1) + x0];
      fuera[y * an + x] = total / ((y1 - y0) * (x1 - x0));
    }
  }
  return fuera;
}

function puntuar(img) {
  const escala = Math.min(1, ANALISIS / Math.max(img.naturalWidth, img.naturalHeight));
  const an = Math.max(8, Math.round(img.naturalWidth * escala));
  const al = Math.max(8, Math.round(img.naturalHeight * escala));

  const tela = document.createElement('canvas');
  tela.width = an;
  tela.height = al;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, an, al);
  const px = ctx.getImageData(0, 0, an, al).data;

  /* El fondo es lo que hay pegado al marco: mediana, para que un objeto que
     toque un lado no se lo lleve por delante. */
  const bordeR = [], bordeG = [], bordeB = [];
  for (let y = 0; y < al; y++) {
    for (let x = 0; x < an; x++) {
      if (x > 1 && x < an - 2 && y > 1 && y < al - 2) continue;
      const i = (y * an + x) * 4;
      bordeR.push(px[i]); bordeG.push(px[i + 1]); bordeB.push(px[i + 2]);
    }
  }
  const fondo = [mediana(bordeR), mediana(bordeG), mediana(bordeB)];

  const luz = new Float32Array(an * al);
  const lejos = new Float32Array(an * al);
  for (let i = 0, p = 0; p < an * al; p++, i += 4) {
    luz[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    lejos[p] = (Math.abs(px[i] - fondo[0]) +
                Math.abs(px[i + 1] - fondo[1]) +
                Math.abs(px[i + 2] - fondo[2])) / 3;
  }

  const bruto = new Float64Array(an * al);
  for (let y = 1; y < al - 1; y++) {
    for (let x = 1; x < an - 1; x++) {
      const p = y * an + x;
      const filo = Math.min(255, Math.abs(luz[p - 1] - luz[p + 1]) +
                                 Math.abs(luz[p - an] - luz[p + an]));
      const valor = Math.max(lejos[p] * 1.15, filo);
      bruto[p] = valor > 14 ? valor : 0;   /* el ruido de la cámara, fuera */
    }
  }
  return { bruto, an, al };
}

/* La mancha ganadora, en coordenadas del análisis. `null` si no hay ninguna
   que se distinga del resto. */
function manchaPrincipal(dens, an, al) {
  let maximo = 0;
  for (let i = 0; i < dens.length; i++) if (dens[i] > maximo) maximo = dens[i];
  if (maximo <= 0) return null;

  /* El corte deja fuera todo menos la parte más marcada de la foto. Con el
     fondo bien liso muchos píxeles valen cero y el corte cae ahí: entonces
     "algo" es, literalmente, todo lo que no es fondo. */
  const orden = Float64Array.from(dens).sort();
  const corte = orden[Math.floor(orden.length * (1 - PORCION))];
  const etiqueta = new Int32Array(an * al);
  const pila = new Int32Array(an * al);
  let cuantas = 0, mejor = null, mejorNota = -1;

  for (let inicio = 0; inicio < an * al; inicio++) {
    if (etiqueta[inicio] || dens[inicio] <= corte) continue;
    cuantas++;
    let cima = 0;
    pila[cima++] = inicio;
    etiqueta[inicio] = cuantas;

    let peso = 0, sumaX = 0, sumaY = 0, cuenta = 0;
    let x0 = an, y0 = al, x1 = 0, y1 = 0;

    while (cima) {
      const p = pila[--cima];
      const x = p % an, y = (p / an) | 0;
      peso += dens[p];
      sumaX += x; sumaY += y; cuenta++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (x > 0      && !etiqueta[p - 1]  && dens[p - 1]  > corte) { etiqueta[p - 1]  = cuantas; pila[cima++] = p - 1; }
      if (x < an - 1 && !etiqueta[p + 1]  && dens[p + 1]  > corte) { etiqueta[p + 1]  = cuantas; pila[cima++] = p + 1; }
      if (y > 0      && !etiqueta[p - an] && dens[p - an] > corte) { etiqueta[p - an] = cuantas; pila[cima++] = p - an; }
      if (y < al - 1 && !etiqueta[p + an] && dens[p + an] > corte) { etiqueta[p + an] = cuantas; pila[cima++] = p + an; }
    }

    /* Lo que toca el borde suele ser decorado (una pared, un mueble, el canto
       de la mesa); lo que está en el centro suele ser lo que ibas a retratar. */
    const toca = x0 === 0 || y0 === 0 || x1 === an - 1 || y1 === al - 1;
    const dx = (sumaX / cuenta - an / 2) / an;
    const dy = (sumaY / cuenta - al / 2) / al;
    const centro = 1 - Math.min(1, Math.hypot(dx, dy) * 1.6);
    const nota = peso * (toca ? 0.45 : 1) * (0.35 + 0.65 * centro);
    if (nota > mejorNota) { mejorNota = nota; mejor = { x0, y0, x1: x1 + 1, y1: y1 + 1 }; }
  }
  return mejor;
}

/* Recorte cuadrado alrededor del objeto, en píxeles del original. `null` si
   no ha encontrado nada que merezca la pena recortar. */
function cuadroDelObjeto(img) {
  let mapa;
  try {
    mapa = puntuar(img);
  } catch (e) {
    return null;        /* foto de otro origen: el canvas queda manchado */
  }
  const { bruto, an, al } = mapa;
  const dens = emborronar(bruto, an, al, Math.max(2, Math.round(Math.min(an, al) * RADIO)));
  const mancha = manchaPrincipal(dens, an, al);
  if (!mancha) return null;

  const kx = img.naturalWidth / an;
  const ky = img.naturalHeight / al;
  const crecerX = (mancha.x1 - mancha.x0) * CRECER;
  const crecerY = (mancha.y1 - mancha.y0) * CRECER;
  const ancho = (mancha.x1 - mancha.x0 + crecerX * 2) * kx;
  const alto = (mancha.y1 - mancha.y0 + crecerY * 2) * ky;
  const cx = (mancha.x0 + mancha.x1) / 2 * kx;
  const cy = (mancha.y0 + mancha.y1) / 2 * ky;

  const menor = Math.min(img.naturalWidth, img.naturalHeight);
  let lado = Math.max(ancho, alto) * (1 + MARGEN * 2);

  /* Una mota no es un objeto. */
  if (lado < menor * 0.15) return null;
  /* Y si la mancha ya ocupa la foto entera POR LOS DOS LADOS, no hay fondo
     que quitar. Ojo: que el cuadrado se pase de ancho es normal en una foto
     vertical de algo alto —una botella— y ahí sí hay mucho que recortar por
     arriba y por abajo. */
  if (ancho >= img.naturalWidth * 0.95 && alto >= img.naturalHeight * 0.95) return null;

  lado = Math.min(lado, menor);

  return {
    x: Math.min(img.naturalWidth - lado, Math.max(0, cx - lado / 2)),
    y: Math.min(img.naturalHeight - lado, Math.max(0, cy - lado / 2)),
    lado
  };
}

/* ------------------------------------------------------------- dibujar ---- */
function alTamano(img, { x, y, lado }) {
  return new Promise((resolve, reject) => {
    const tela = document.createElement('canvas');
    tela.width = LADO;
    tela.height = LADO;
    tela.getContext('2d').drawImage(img, x, y, lado, lado, 0, 0, LADO, LADO);
    tela.toBlob(blob => {
      if (!blob) { reject(new Error('no se ha podido preparar la imagen')); return; }
      resolve({ blob, datos: tela.toDataURL('image/jpeg', CALIDAD) });
    }, 'image/jpeg', CALIDAD);
  });
}

async function conLaImagen(archivo, fn) {
  const { img, soltar } = await cargarImagen(archivo);
  try { return await fn(img); } finally { soltar(); }
}

/* ------------------------------------------------------------- preparar --- */
/* La foto tal cual, cuadrada por el centro y al tamaño final. */
export function preparar(archivo) {
  return conLaImagen(archivo, img => {
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    return alTamano(img, {
      x: (img.naturalWidth - lado) / 2,
      y: (img.naturalHeight - lado) / 2,
      lado
    });
  });
}

/* ------------------------------------------------------------- encuadrar -- */
/* Ajustada al objeto. `null` si no encuentra ninguno. Es el paso previo de la
   silueta: al modelo se le da el objeto ya centrado y grande, que acierta
   más y tarda menos. */
function encuadrar(archivo) {
  return conLaImagen(archivo, img => {
    const cuadro = cuadroDelObjeto(img);
    return cuadro ? alTamano(img, cuadro) : null;
  });
}

/* ----------------------------------------------------------------- subir --- */
/* De una foto ya preparada a una URL. Sin nube, la propia imagen hace de URL. */
export async function subir(foto) {
  if (!foto) return '';
  if (!nube.activa) return foto.datos;
  return nube.subirFoto(foto.blob);
}

/* ---------------------------------------------------------------- elegir --- */
export async function elegir() {
  return elegirArchivo();
}

/* -------------------------------------------------------------- soltable --- */
/* Arrastrar la foto encima y soltarla, sin pasar por ningún diálogo.
   `zona` se marca con `.soltando` mientras la foto está encima y `alSoltar`
   recibe el archivo. Devuelve la baja: llamarla al salir de la pantalla.

   El documento entero se defiende de los descuidos: sin esto, una foto que
   caiga FUERA de la zona se abre en la pestaña y se lleva por delante lo que
   estabas escribiendo. */
export function soltable(zona, alSoltar) {
  if (!zona) return () => {};

  const conFotos = e => !!(e.dataTransfer && [...e.dataTransfer.types].includes('Files'));
  const tragar = e => { if (conFotos(e)) e.preventDefault(); };

  /* `dragleave` también salta al pasar de un hijo a otro: se cuentan las
     entradas y las salidas en vez de fiarse del último evento. */
  let dentro = 0;
  const marcar = activo => zona.classList.toggle('soltando', activo);

  const entrar = e => { if (!conFotos(e)) return; e.preventDefault(); dentro++; marcar(true); };
  const encima = e => { if (conFotos(e)) e.preventDefault(); };
  const salir  = e => { if (!conFotos(e)) return; dentro = Math.max(0, dentro - 1); if (!dentro) marcar(false); };
  const soltar = e => {
    if (!conFotos(e)) return;
    e.preventDefault();
    dentro = 0;
    marcar(false);
    const archivo = e.dataTransfer.files && e.dataTransfer.files[0];
    if (archivo) alSoltar(archivo);
  };

  zona.addEventListener('dragenter', entrar);
  zona.addEventListener('dragover', encima);
  zona.addEventListener('dragleave', salir);
  zona.addEventListener('drop', soltar);
  document.addEventListener('dragover', tragar);
  document.addEventListener('drop', tragar);

  return () => {
    zona.removeEventListener('dragenter', entrar);
    zona.removeEventListener('dragover', encima);
    zona.removeEventListener('dragleave', salir);
    zona.removeEventListener('drop', soltar);
    document.removeEventListener('dragover', tragar);
    document.removeEventListener('drop', tragar);
  };
}

/* ------------------------------------------------------------- silueta ---- */
/* La pegatina: el objeto recortado por su contorno, con el fondo transparente.

   Esto ya no es geometría, es un modelo de segmentación que corre en el
   propio navegador (@imgly/background-removal). Cuesta una descarga la
   primera vez y unos segundos cada foto, y por eso NO se hace solo: lo pide
   el usuario con un botón y la pantalla le cuenta por dónde va.

   Nada sale del móvil: el modelo se descarga y la foto se procesa aquí. */
const LIBRERIA = 'https://esm.sh/@imgly/background-removal@1.5.8';
const LADO_PEGATINA = 800;
/* El fondo que se pinta detrás del recorte: el mismo gris casi blanco de las
   teselas (`--tesela`). Podría dejarse transparente y que lo pusiera el CSS,
   pero entonces la foto sólo se ve bien DENTRO de la app: abierta desde el
   almacén, o desde Fotos, saldría sobre blanco.

   Se guarda en WebP sin pérdida y no en JPEG por un motivo tonto pero real:
   el viaje de ida y vuelta del JPEG convierte este color en #FAFAFA y no hay
   relleno que lo evite (probados: cae en 250 o en 252, nunca en 251). WebP
   lo conserva clavado y pesa la mitad que un PNG. Si el navegador no supiera
   escribir WebP, `toBlob` devuelve un PNG, que también es exacto. */
const FONDO_PEGATINA = '#FAFAFB';

let libreria = null;

/* El modelo deja la silueta bien, pero con ruido: motas del mármol que se
   quedan medio opacas, un halo blando por el borde y el objeto perdido en
   medio de un cuadrado enorme. Aquí se limpia:

     · se endurece el alfa (lo dudoso, fuera; lo sólido, sólido),
     · se conserva SOLO la mancha grande — las motas sueltas desaparecen,
     · y se recorta ajustado a lo que ha quedado, para que el objeto llene la
       pegatina en vez de flotar en una esquina.

   Devuelve null si no queda nada: mejor decirlo que guardar un cristal. */
const ALFA_MIN = 70;       /* por debajo, fondo                              */
const ALFA_MAX = 190;      /* por encima, objeto del todo                    */
const MARGEN_PEGATINA = 0.12;   /* aire alrededor de la silueta */

function limpiarPegatina(datosImg, an, al) {
  const px = datosImg.data;
  const total = an * al;

  /* 1. Endurecer: la rampa entre los dos umbrales conserva un filo suave. */
  const solido = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    const a = px[p * 4 + 3];
    let nuevo;
    if (a <= ALFA_MIN) nuevo = 0;
    else if (a >= ALFA_MAX) nuevo = 255;
    else nuevo = Math.round((a - ALFA_MIN) * 255 / (ALFA_MAX - ALFA_MIN));
    px[p * 4 + 3] = nuevo;
    solido[p] = nuevo > 128 ? 1 : 0;
  }

  /* 2. Quedarse con la mancha más grande. */
  const visto = new Uint8Array(total);
  const pila = new Int32Array(total);
  let mejorTam = 0, mejorEtiqueta = 0;
  const etiqueta = new Int32Array(total);
  let n = 0;

  for (let inicio = 0; inicio < total; inicio++) {
    if (visto[inicio] || !solido[inicio]) continue;
    n++;
    let cima = 0, tam = 0;
    pila[cima++] = inicio;
    visto[inicio] = 1;
    etiqueta[inicio] = n;
    while (cima) {
      const q = pila[--cima];
      tam++;
      const x = q % an, y = (q / an) | 0;
      if (x > 0      && !visto[q - 1]  && solido[q - 1])  { visto[q - 1] = 1;  etiqueta[q - 1] = n;  pila[cima++] = q - 1; }
      if (x < an - 1 && !visto[q + 1]  && solido[q + 1])  { visto[q + 1] = 1;  etiqueta[q + 1] = n;  pila[cima++] = q + 1; }
      if (y > 0      && !visto[q - an] && solido[q - an]) { visto[q - an] = 1; etiqueta[q - an] = n; pila[cima++] = q - an; }
      if (y < al - 1 && !visto[q + an] && solido[q + an]) { visto[q + an] = 1; etiqueta[q + an] = n; pila[cima++] = q + an; }
    }
    if (tam > mejorTam) { mejorTam = tam; mejorEtiqueta = n; }
  }
  if (!mejorTam || mejorTam < total * 0.004) return null;

  /* 3. Borrar todo lo que no sea esa mancha y medir dónde ha quedado. */
  let x0 = an, y0 = al, x1 = 0, y1 = 0;
  for (let p = 0; p < total; p++) {
    if (etiqueta[p] === mejorEtiqueta) {
      const x = p % an, y = (p / an) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    } else if (px[p * 4 + 3]) {
      px[p * 4 + 3] = 0;
    }
  }

  /* 4. Tapar los agujeros. Un brillo dentro de la estrella o una etiqueta
     clara confunden al modelo y dejan huecos transparentes EN MEDIO del
     objeto. Se inunda el fondo desde los cuatro bordes: lo que no se moja,
     está dentro, y se rellena. */
  const fuera = new Uint8Array(total);
  let cima = 0;
  const meter = q => { if (!fuera[q] && !solido[q]) { fuera[q] = 1; pila[cima++] = q; } };
  for (let x = 0; x < an; x++) { meter(x); meter((al - 1) * an + x); }
  for (let y = 0; y < al; y++) { meter(y * an); meter(y * an + an - 1); }
  while (cima) {
    const q = pila[--cima];
    const x = q % an, y = (q / an) | 0;
    if (x > 0) meter(q - 1);
    if (x < an - 1) meter(q + 1);
    if (y > 0) meter(q - an);
    if (y < al - 1) meter(q + an);
  }
  for (let p = 0; p < total; p++) {
    if (!solido[p] && !fuera[p]) { px[p * 4 + 3] = 255; solido[p] = 1; }
  }

  /* 5. Suavizar el filo. Endurecer el alfa deja los bordes en escalera; una
     media de 3×3 sobre el alfa los devuelve a algo que parece recortado y no
     serrado. Sólo se toca el contorno: dentro y fuera quedan como están. */
  const alfa = new Uint8Array(total);
  for (let p = 0; p < total; p++) alfa[p] = px[p * 4 + 3];
  for (let y = 1; y < al - 1; y++) {
    for (let x = 1; x < an - 1; x++) {
      const p = y * an + x;
      const a = alfa[p];
      if (a === 0 || a === 255) {
        /* sólo si tiene algún vecino distinto, es decir, si está en el filo */
        if (alfa[p - 1] === a && alfa[p + 1] === a &&
            alfa[p - an] === a && alfa[p + an] === a) continue;
      }
      px[p * 4 + 3] = (alfa[p - an - 1] + alfa[p - an] + alfa[p - an + 1] +
                       alfa[p - 1] + alfa[p] + alfa[p + 1] +
                       alfa[p + an - 1] + alfa[p + an] + alfa[p + an + 1]) / 9;
    }
  }

  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/* Un PNG con transparencia, limpio y ajustado al objeto. */
function aPegatina(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const an = img.naturalWidth, al = img.naturalHeight;
      const bruta = document.createElement('canvas');
      bruta.width = an;
      bruta.height = al;
      const ctx = bruta.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const datosImg = ctx.getImageData(0, 0, an, al);
      const caja = limpiarPegatina(datosImg, an, al);
      if (!caja) { resolve(null); return; }
      ctx.putImageData(datosImg, 0, 0);

      /* Cuadrado ajustado a la silueta, con un poco de aire. */
      const ancho = caja.x1 - caja.x0, alto = caja.y1 - caja.y0;
      const lado = Math.max(ancho, alto) * (1 + MARGEN_PEGATINA * 2);
      const cx = (caja.x0 + caja.x1) / 2, cy = (caja.y0 + caja.y1) / 2;

      const tela = document.createElement('canvas');
      tela.width = LADO_PEGATINA;
      tela.height = LADO_PEGATINA;
      const salida = tela.getContext('2d');
      salida.fillStyle = FONDO_PEGATINA;
      salida.fillRect(0, 0, LADO_PEGATINA, LADO_PEGATINA);
      salida.drawImage(
        bruta, cx - lado / 2, cy - lado / 2, lado, lado, 0, 0, LADO_PEGATINA, LADO_PEGATINA);

      tela.toBlob(foto => {
        if (!foto) { reject(new Error('no se ha podido preparar la pegatina')); return; }
        resolve({ blob: foto, datos: tela.toDataURL('image/webp', 1) });
      }, 'image/webp', 1);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('recorte ilegible')); };
    img.src = url;
  });
}

export async function silueta(archivo, alAvanzar) {
  /* Primero el encuadre —el modelo trabaja mejor con el objeto grande— y si
     no se encuentra nada, la foto cuadrada tal cual. */
  const base = (await encuadrar(archivo)) || (await preparar(archivo));

  if (!libreria) libreria = import(LIBRERIA);
  const { removeBackground } = await libreria;

  const recorte = await removeBackground(base.blob, {
    model: 'isnet_quint8',      /* el ligero: ~11 MB en vez de ~40 */
    output: { format: 'image/png' },
    progress: (clave, hecho, total) => {
      if (alAvanzar) alAvanzar(clave, hecho, total);
    }
  });
  return aPegatina(recorte);
}
