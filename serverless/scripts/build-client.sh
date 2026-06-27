#!/usr/bin/env bash
# Builds the Scala.js client and assembles the /hrf/* static asset tree that
# the StaticSite component (router path "/hrf") uploads. Layout mirrors what
# GoodGame.scala served from the haunt-roll-fail/ directory, since the
# <base href> the server injects makes every relative asset URL resolve
# against this prefix (see src/template.ts).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CLIENT_DIR="$ROOT/../haunt-roll-fail"
OUT="$ROOT/dist"

rm -rf "$OUT"
mkdir -p "$OUT/target/scala-2.13"

# sbt's default 1GB heap is not reliably enough for this project's Scala.js
# linking step (fastOptJS runs in-process in the sbt JVM) -- it OOM'd here.
export SBT_OPTS="${SBT_OPTS:--Xmx4096m -Xss8M}"
(cd "$CLIENT_DIR" && sbt fastOptJS)

cp "$CLIENT_DIR"/target/scala-2.13/hrf-fastopt*.js "$OUT/target/scala-2.13/"
cp "$CLIENT_DIR"/target/scala-2.13/hrf-fastopt*.js.map "$OUT/target/scala-2.13/" 2>/dev/null || true

# Card/board art, fonts, and any other static assets referenced by index.html
# are not committed to this repo (likely licensing -- see README.md). Put
# them in serverless/assets/ with paths relative to /hrf/, e.g.
#   serverless/assets/fonts/luminari.woff2
#   serverless/assets/omen.png
# and this picks them up automatically.
if [ -d "$ROOT/assets" ]; then
  cp -r "$ROOT/assets/." "$OUT/"
fi

echo "Built static assets into $OUT"
