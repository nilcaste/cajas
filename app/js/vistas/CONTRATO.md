# Contrato de las vistas

Convenciones exactas para rellenar una vista de `js/vistas/`. La referencia
visual e interactiva canónica son las maquetas de `Cajas/maquetas/prueba-medkit*.html`:
cada fichero de vista dice arriba cuál le toca. **No inventes componentes ni
cambies medidas: si algo no está en la maqueta, pregunta antes de dibujarlo.**

Reglas de fondo:

- Copy siempre **«ítem»** (nunca «objeto»).
- Código en inglés no: este proyecto va en castellano (identificadores incluidos),
  como las maquetas.
- Sin sombras en tarjetas: bordes finos. El rebote vive en `:active`.
- La UI actúa **siempre sobre UNA caja**. El único sitio que enseña la realidad
  multi-caja es el buscador / la vista de ítem.
- Los iconos son sólo de UI. Los ítems van con emoji (foto: futuro).

---

## 1. Firma de un módulo de vista

```js
import { datos } from '../datos.js';
import * as ui from '../ui.js';
import { navegar, volver, alCambiar, alSalir } from '../app.js';

export function render(params) {
  const raiz = ui.nodo(`<div> … </div>`);
  // engancha eventos sobre `raiz`
  return raiz;                 // Node (o Promise<Node>)
}

export function destruir() { … }   // opcional
```

- `render(params)` devuelve **un nodo suelto**; el router lo mete en `#vista`
  y le pone al contenedor la clase `vista vista--<nombre>` (y `vista--modal`
  en los pasos de proceso). No toques `#vista` ni `<body>` tú.
- `params` mezcla los parámetros de ruta (`:id`) y los de la query del hash
  (`?caja=`, `?nombre=`). Todos son cadenas.
- Si la entidad no existe: `navegar('/', null, { reemplazar: true })` y devuelve
  un `div` vacío.
- No hace falta limpiar listeners puestos **dentro de `raiz`**: el nodo se tira
  entero. Para listeners en `document`/`window`, regístralos con `alSalir(fn)`.

## 2. Rutas y navegación

| Ruta | Vista | Parámetros |
|---|---|---|
| `#/` | `home.js` | — |
| `#/caja/:id` | `caja.js` | `id` |
| `#/item/:id` | `item.js` | `id` |
| `#/anadir` | `anadir.js` | `?caja=<id>` (opcional: sin él hay selector) |
| `#/crear` | `crear.js` | `?nombre=&caja=` |
| `#/ajustes/:id` | `ajustes.js` | `id` |
| `#/nueva` | `nueva.js` | — |

Los `:id` son **ids opacos** (`caja-01`, `estropajos`), nunca el número de la
pegatina: el número se puede editar y repetir.

```js
navegar('/caja/' + caja.id);                 // empuja al historial
navegar('/anadir', { caja: caja.id });       // #/anadir?caja=caja-01
navegar('/', null, { reemplazar: true });    // sin dejar rastro
volver('/caja/' + caja.id);                  // atrás real, con reserva si se
                                             // ha entrado directo por QR
```

Los enlaces normales también valen (`<a href="#/nueva">`) y son preferibles
cuando el destino es fijo.

### Registrar una ruta nueva

En `js/app.js`, añade una entrada a `RUTAS`:

```js
{ nombre: 'informe', patron: '/informe/:id', modulo: './vistas/informe.js', modal: false }
```

`nombre` da la clase CSS (`vista--informe`) y `modal: true` hace que en
escritorio (≥900px) la pantalla se presente como tarjeta centrada sobre el velo.

## 3. Transiciones

El router ya envuelve el cambio en `document.startViewTransition` (con reserva
sin animación y respeto a `prefers-reduced-motion`). Tú sólo tienes que poner
la clase correcta:

- `.fab` (home) y `.cta` (caja, crear) llevan `view-transition-name: boton-anadir`
  de serie: es el morph del botón + → CTA → ✓. **Sólo puede haber uno por
  pantalla.**
- Si una pantalla tiene una CTA que no debe participar en el morph (p. ej.
  «Añadir a otra caja»), usa `.cta.cta--sin-morph`.

## 4. Datos

Interfaz completa documentada en la cabecera de `js/datos.js`. Resumen:

```js
datos.listarCajas() · datos.caja(id) · datos.crearCaja({num,nombre,ubicacion})
datos.actualizarCaja(id, cambios) · datos.siguienteNum()
datos.eliminarCaja(id)                         // + su stock; NO borra ítems
datos.listarItems() · datos.item(id) · datos.crearItem({nombre,emoji,suministro})
datos.eliminarItem(id)                         // + su stock en todas las cajas
datos.buscarItems(texto)                       // sin acentos ni mayúsculas
datos.stockDeCaja(cajaId)  -> [{ item, cantidad }]
datos.stockDeItem(itemId)  -> [{ caja, cantidad }]
datos.ponerStock(itemId, cajaId, cantidad)     // 0 = quitar la relación
```

- Todo es **síncrono** y devuelve copias.
- Toda mutación emite un evento. Para repintar:
  ```js
  alCambiar(() => pintar());   // la baja se suelta sola al cambiar de ruta
  ```
- Nunca escribas en `localStorage` desde una vista (salvo preferencias de UI,
  como la pestaña activa de la home). Los datos van por `datos`.

## 5. Helpers de `ui.js`

```js
ui.nodo(html) / ui.nodos(html)     // construir DOM desde plantilla
ui.esc(t)                          // escapar antes de interpolar
ui.resaltar(nombre, filtro)        // coincidencia en <b>, sin acentos
ui.plural(n, 'ítem', 'ítems')      // "1 ítem" / "4 ítems"
ui.icono(nombre, tam, grosor)      // SVG del sistema (ver tabla abajo)
ui.toast(texto, alDeshacer)        // toast con «Deshacer» (5 s)
ui.hoja({ titulo, contenido })     // <dialog> del sistema -> { dialog, cuerpo, cerrar }
ui.repetible(boton, accion)        // mantener pulsado: 450 ms → cada 140 ms
ui.pop(cifra)                      // el rebote de la cifra del stepper
ui.sacarFila(fila, alTerminar)     // colapso animado (240 ms)
ui.meterFila(lista, fila, siguiente, flash)
ui.reducida()                      // prefers-reduced-motion
```

Iconos disponibles: `mas`, `menos`, `lupa`, `volver`, `cerrar`, `ajustes`,
`papelera`, `check`, `chevron`, `chevronAbajo`, `cajaMas`, `camara`, `qr`.
Traen su tamaño y grosor por defecto (2.4 general, 2.2 en detalle);
en FAB y CTA se pide explícito: `ui.icono('mas', 20, 2.6)`.

### Patrón de quitar con deshacer

```js
ui.sacarFila(fila, () => {
  const siguiente = fila.nextElementSibling;
  fila.remove();
  datos.ponerStock(item.id, caja.id, 0);
  ui.toast('Quitado', () => {
    datos.ponerStock(item.id, caja.id, cantidadPrevia);
    ui.meterFila(lista, fila, siguiente, false);
  });
});
```

## 6. Clases del sistema (`css/sistema.css`)

No escribas CSS nuevo en una vista. Si falta algo, se añade al sistema.

**Estructura**
`.barra` (`.barra--sola` con un solo control) · `.icono-btn` ·
`.cabecera` (`.cabecera--home`, `.cabecera--identidad`) · `.seccion`
(`.seccion--primera`) · `.pista`

**Pestañas** `.pestanas[data-activa]` + `.pestanas__pastilla` +
`.pestanas__tab[aria-selected]` · paneles `.panel` / `.panel--entrando`

**Campos** `.campo` (`.campo--con-emoji`, `input.mono`) · `.emoji-nombre` ·
`.buscador` (`.buscador--flotante`, `.buscador--mini`) · `.selector-caja`

**Listas** `.lista` > `.fila` (+ `.fila--items` en el contenido de una caja,
`.fila--inv` en el inventario) con `.tesela` / `.num-tesela` / `.mini`,
`.texto` > `.nombre` + `.tipo|.ubi|.meta`, y `.fila__cajas` > `.chip-caja`.
Estados de fila: `.fila--fuera`, `.fila--entrando`, `.fila--flash`.

**Controles** `.stepper` (> `button` + `.cifra`, `.cifra--pop`) ·
`.btn-cuadrado` · `.chips` > `.chip` · `.accion` · `.crear`

**Cajas** `.reticula` > `.caja` (> `.mosaico` > `i`, `.caja__nombre`,
`.caja__meta`) + `.caja-nueva`

**Flotante** `.velo-inferior` + `.flotante` > `.cta` | `.buscador--flotante` +
`.fab` (`.fab .globo`)

**Otros** `.vacio` (`.vacio--holgado`) > `.vacio__emoji` / `__titulo` / `__sub` ·
`.toast` · `dialog.hoja` > `.hoja__cuerpo` > `.hoja__titulo` / `.hoja__lista` >
`.hoja__caja` · `.campo-emoji` · `.rejilla-rapida` · `.accion-foto` ·
utilidades `.oculto`, `.pulsable`

**Confirmar algo grave** (eliminar): `ui.hoja` con `.pista` + `.hoja__acciones`
> `.cta.cta--sin-morph` («Eliminar») + `.boton-fantasma` («Cancelar»). La hoja
ES la barrera: detrás no va toast de deshacer.

**Pasos de proceso**: no sustituyen la pantalla, se montan en una capa
(`#capa-proceso`) por encima de `#vista`, que se queda viva debajo con su
scroll. Tu vista de fondo se repinta sola si el proceso toca sus datos
(`alCambiar`), y al cerrar el proceso NO se vuelve a pintar. Sólo puede haber
un `view-transition-name: boton-anadir` en pantalla: mientras hay proceso, el
del fondo se anula por CSS, así que la CTA del proceso hereda el morph.

**Escritorio**: no dupliques marcado. El cambio de móvil a escritorio es
**sólo CSS** a partir de 900px (franja única en la home, columna de 640px en
caja e ítem, tarjeta modal en los pasos de proceso). Los controles que sólo
existen en escritorio van dentro de `.escritorio-controles`, que está oculto
por debajo de 900px.
