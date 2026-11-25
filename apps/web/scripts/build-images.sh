#!/usr/bin/env bash
# Regenerates every halftone image in public/img from scripts/.raw/ (see fetch.py for downloads).
# Usage: scripts/build-images.sh [name ...]   (no args = everything)
set -euo pipefail
cd "$(dirname "$0")"
RAW=.raw
OUT=../public/img
mkdir -p "$OUT"

ht() { # <raw-file> <out-name> <args...>
  local in="$1" out="$2"; shift 2
  python3 -I halftone.py "$RAW/$in" "$OUT/$out.webp" "$@"
  echo "built $out ($(wc -c < "$OUT/$out.webp") bytes)"
}
sel=("$@")
run() { # <name> <raw> <args...>
  local name="$1"; shift
  if [ ${#sel[@]} -eq 0 ] || [[ " ${sel[*]} " == *" $name "* ]]; then ht "$1" "$name" "${@:2}"; fi
}
CARD="--width 900 --height 700 --invert --gamma 0.7 --sky 0.2 --cell 5 --quality 70"
BAND="--invert --gamma 0.6 --sky 0.2 --cell 5 --quality 70"

run hero mikado.jpg --width 2400 --height 1350 --invert --contain --focus 0.5,1 --place-right 0.8 --fade-left 0.7 --gamma 0.6 --sky 0.2 --local 1.5 --contrast 1.3 --cell 5 --quality 70
run band-semaphore signals.jpg --width 2400 --height 900 $BAND --zoom 1.12 --focus 0.5,0.62 --local 1.0 --contrast 1.2
run card-1 levers.jpg $CARD --zoom 1.12 --focus 0.5,0.5 --local 1.0 --contrast 1.2
run card-2 canyon.jpg $CARD --zoom 2.4 --focus 0.3,0.33 --local 1.0 --contrast 1.3
run card-3 empire.jpg $CARD --zoom 3.2 --focus 0.55,0.72 --local 1.2 --contrast 1.3
run card-4 yardengine.jpg $CARD --zoom 2.3 --focus 0.82,0.5 --local 1.2 --contrast 1.3
run card-5 yardtower.jpg $CARD --zoom 3.0 --focus 0.33,0.4 --local 1.2 --contrast 1.6
run card-6 signals.jpg $CARD --zoom 2.2 --focus 0.25,0.7 --local 1.0 --contrast 1.2
run cta-yard yardengine.jpg --width 2400 --height 900 $BAND --sky 0.45 --gamma 1.1 --quality 30 --cell 6 --zoom 1.05 --focus 0.5,0.72 --local 1.2 --contrast 1.3
run solution-bg consolidation.jpg --width 1800 --height 1000 $BAND --sky 0.5 --gamma 1.2 --quality 30 --cell 6 --zoom 1.3 --focus 0.5,0.9 --local 1.0 --contrast 1.2 --fade-left 0.5
run dash-band mikado.jpg --width 2400 --height 520 --invert --focus 0.5,0.62 --place-right 0.6 --fade-left 0.8 --gamma 0.6 --sky 0.2 --local 1.5 --contrast 1.3 --cell 5 --quality 60
