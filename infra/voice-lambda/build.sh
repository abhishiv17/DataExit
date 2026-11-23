#!/usr/bin/env sh
# Packages the Lambda: handler + compiled scam-shield rules (run `npm run build` and `npm run build -w @dataexit/web` first).
set -e
cd "$(dirname "$0")"
rm -rf out && mkdir -p out/scam-shield
cp index.mjs package.json out/
cp ../../servers/scam-shield/dist/ops.js ../../servers/scam-shield/dist/rules.js out/scam-shield/
echo '{"type":"module"}' > out/scam-shield/package.json
cp -r ../../apps/web/dist out/site
