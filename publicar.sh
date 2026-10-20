#!/bin/sh
# =============================================================================
# Cajas — publicar
# =============================================================================
# La app vive en d.nil.sx/cajas, dentro del hub, pero su FUENTE es esta
# carpeta (Cajas/app). `dashboard-hub/public/cajas/` es una copia: se edita
# aquí y se sincroniza con este script, nunca al revés.
#
#   sh Cajas/publicar.sh          copia a dashboard-hub/public/cajas/
#   sh Cajas/publicar.sh --deploy copia, commit + push y despliega el hub
#
# El hub es direct-upload (no está conectado a git): el push NO despliega.
# =============================================================================
set -e

raiz="$(cd "$(dirname "$0")" && pwd)"
hub="$raiz/../dashboard-hub"

[ -d "$hub" ] || { echo "No encuentro dashboard-hub en $hub"; exit 1; }

rsync -a --delete "$raiz/app/" "$hub/public/cajas/"

# ---------------------------------------------------------------- versión --
# Cloudflare Pages le pone `max-age=14400` a los ficheros estáticos y no hay
# forma de quitárselo desde la Function (ni desde `_headers`): el navegador se
# quedaría hasta 4 h con el JS viejo. Solución: firmar las rutas. El HTML sí
# viaja con `no-cache`, así que basta con que cada versión pida sus módulos
# con una firma distinta. Se toca SOLO la copia, nunca la fuente.
firma=$(find "$raiz/app" -type f -exec shasum {} + | shasum | cut -c1-10)
find "$hub/public/cajas" -name '*.js' -exec sed -i '' -E \
  "s#'(\.\.?/[A-Za-z0-9_./-]*\.js)'#'\1?v=$firma'#g" {} +
sed -i '' -E "s#(src=\"js/app\.js|href=\"css/sistema\.css)\"#\1?v=$firma\"#g" \
  "$hub/public/cajas/index.html"
echo "Copiado  →  dashboard-hub/public/cajas/   (versión $firma)"

[ "$1" = "--deploy" ] || { echo "(sin --deploy: no se sube nada)"; exit 0; }

cd "$hub"
git pull --ff-only
git add public/cajas functions/_middleware.js public/projects.json
git commit -m "Cajas: sincronizar la app en /cajas" || echo "(nada que commitear)"
git push
npx wrangler pages deploy public --project-name dashboard --branch main
