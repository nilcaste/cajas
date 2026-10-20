# Cajas — inventario del almacén

Definición del proyecto, consolidada de la conversación con Nil (2026-08-28).

## Qué es

Web app (PWA) para saber qué hay en cada caja de plástico del almacén y dónde
está cada cosa. Dos usuarios: Nil y su pareja. Cada caja lleva un código QR
(más adelante, opcionalmente NFC sobre la misma URL) que abre directamente la
pantalla de esa caja.

**Decisión de plataforma:** web app, no app nativa. El QR es una URL, así que
la web elimina toda fricción (escanear con la cámara → pantalla de la caja, sin
instalar nada). Misma web sirve en móvil y desktop. Stack previsto: web pequeña
+ Supabase, deploy en Cloudflare Pages. Backend se monta DESPUÉS de validar las
maquetas.

## Modelo conceptual

La decisión central del proyecto: **catálogo vs. stock**.

- **Objetos (catálogo):** cada tipo de objeto se da de alta UNA vez en la vida:
  nombre, foto, y flag `suministro`. "Estropajo" es una entrada del catálogo,
  no una cosa dentro de una caja. La mayoría de objetos son recurrentes
  (suministros: estropajo, cepillo de dientes, desodorante…); otros son únicos
  (la plancha).
- **Contenido de caja (stock):** relación caja ↔ objeto con cantidad.
  - `suministro = true` → cantidad con stepper (+/−), puede haber varios.
  - `suministro = false` → sin cantidad: está o no está (cantidad implícita 1).
- **Multi-caja permitido, UI mono-caja.** El modelo permite que un objeto esté
  en varias cajas a la vez. Pero la UI NUNCA pregunta ni avisa ni ofrece
  repartir: cada acción de añadir/quitar va contra UNA caja (la escaneada, o
  la elegida en un selector único en desktop). El único sitio que muestra la
  realidad completa es el buscador: "Estropajo — 2 en caja 3, 2 en caja 7".
  Sin diálogos de traslado: mover = quitar aquí + añadir allá.
- La app refleja lo que hacen los usuarios, no los vigila. Si la realidad se
  desvía, se corrige escaneando la caja y ajustando con el stepper.

## Arquitectura de la interfaz (revisada 2026-08-28)

Una sola app con las mismas capacidades en móvil y desktop ("tengo que poder
hacer lo mismo en todos sitios"): dos secciones — **Cajas** e **Inventario** —
con navegación persistente (sidebar en desktop, pestañas inferiores en móvil).
El buscador NO es pantalla aparte: vive dentro del Inventario (campo arriba,
placeholder "¿Dónde está…?"). El Inventario es accionable, no solo informativo:
"+" por fila (compra precargada) y chips de caja clicables que llevan a la caja.
Las pantallas de caja funcionan igual en desktop (columna centrada).

## Flujos principales

1. **QR → pantalla de caja.** La acción principal es AÑADIR/QUITAR (consultar
   es secundario y sale gratis en la misma pantalla). Añadir es
   catálogo-primero: buscador con recientes arriba, dos toques para un objeto
   ya conocido. Solo si no existe → alta mínima (nombre, ¿suministro?, foto).
2. **Buscar** ("¿dónde está el estropajo?") → objeto con total y desglose por
   cajas. Disponible en móvil y desktop.
3. **Desktop = inventario general.** Tabla/grid del catálogo completo con
   cantidades y cajas, buscador prominente, y alta cómoda de compras:
   "3 estropajos → caja 4" (objeto por autocomplete, cantidad, UNA caja).
4. **Lista de cajas** para dar de alta cajas nuevas e imprimir sus QR.

## Fuera del MVP (anotado, no descartado)

- Notificaciones entre los dos usuarios (web push iOS ≥16.4 si algún día hace falta).
- Etiquetas NFC (misma URL que el QR, se añaden sin tocar código).
- App nativa (probablemente nunca necesaria).

## Estado

- 2026-08-28: definición cerrada; fase actual = maquetar pantallas principales
  (carpeta `maquetas/`) antes de montar backend.
