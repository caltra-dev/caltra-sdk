#!/usr/bin/env bash
set -euo pipefail

mkdir -p /home/sprite/.sprite-dev
# Pin to the repository's Playwright version; browser dependencies are part of the
# reproducible Sprite environment, including machines created before npm install.
npx --yes playwright@1.62.1 install --with-deps chromium
