#!/bin/sh
set -e

# El volumen se monta EN RUNTIME, encima de /data, y se lleva puesto el
# `chown node:node` que hizo el build: el directorio termina siendo de root
# mientras el proceso corre como `node`. El resultado es un EACCES al abrir la
# base, el proceso muere antes de escuchar, y el deploy falla con un
# "healthcheck failure" que no dice nada.
#
# Por eso el contenedor arranca como root, corrige el owner con el volumen ya
# montado, y recién entonces baja privilegios. La app nunca corre como root.
DATA_DIR="${DATA_DIR:-/data}"

if [ -d "$DATA_DIR" ]; then
  # Solo si hace falta: en un volumen con muchas fotos, un chown -R en cada
  # arranque es trabajo al pedo.
  if [ "$(stat -c '%U' "$DATA_DIR")" != "node" ]; then
    echo "🔧 Corrigiendo owner de $DATA_DIR (volumen montado como root)."
    chown -R node:node "$DATA_DIR"
  fi
else
  mkdir -p "$DATA_DIR"
  chown node:node "$DATA_DIR"
fi

exec gosu node "$@"
