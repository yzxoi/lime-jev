#!/bin/bash
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'This release requires an Apple Silicon Mac (macOS 14+).' >&2
  exit 1
fi
if ! command -v uv >/dev/null; then
  if command -v brew >/dev/null; then
    HOMEBREW_NO_AUTO_UPDATE=1 brew install uv
  else
    echo 'Install uv first: https://docs.astral.sh/uv/getting-started/installation/' >&2
    exit 1
  fi
fi
if command -v deno >/dev/null; then
  deno_bin="$(command -v deno)"
elif [[ -x .tools/node_modules/.bin/deno ]]; then
  deno_bin="$PWD/.tools/node_modules/.bin/deno"
elif command -v npm >/dev/null; then
  npm install --prefix .tools deno@2.9.6 --no-audit --no-fund
  deno_bin="$PWD/.tools/node_modules/.bin/deno"
elif command -v brew >/dev/null; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install deno
  deno_bin="$(command -v deno)"
else
  echo 'Install Deno 2.9+: https://deno.com/' >&2
  exit 1
fi
if ! xcrun --find swiftc >/dev/null 2>&1; then
  echo 'Install Apple command line tools with xcode-select --install, then retry.' >&2
  exit 1
fi
if [[ ! -x .venv/bin/python ]]; then uv venv --python 3.12 .venv; fi
uv pip sync --python .venv/bin/python requirements.lock
"$deno_bin" install --frozen --allow-scripts=npm:node-llama-cpp
mkdir -p .runtime
chmod 700 .runtime
printf '%s\n' "$deno_bin" > .runtime/deno-path
.venv/bin/python scripts/download_models.py
xcrun swiftc scripts/focuswatch.swift -o .runtime/focuswatch
.venv/bin/python scripts/manage.py install-rime
.venv/bin/python scripts/manage.py start
.venv/bin/python scripts/manage.py open
echo 'Ready. In Squirrel, press Control + grave accent and choose “Lime · 本地语境”.'
