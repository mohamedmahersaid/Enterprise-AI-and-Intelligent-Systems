#!/bin/bash
# Prepares a Claude Code on the web session to run this repository's gates
# exactly as CI does (.github/workflows/validate.yml):
#   - Node dependencies from the lockfile (npm ci), only when missing or stale;
#   - the leaf-script venv on Python 3.12 with scripts/requirements.txt
#     installed hash-checked, exported as LEAF_PYTHON, which
#     validate:python and validate:scripts already honour.
# Idempotent: a stamp of the requirements file's hash skips a rebuild. Local
# (non-web) sessions are left alone. Prints nothing on success, so it adds no
# tokens to the session's context.
set -euo pipefail

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:?}"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --no-audit --no-fund --loglevel=error >/dev/null
fi

py=$(command -v python3.12 || command -v python3)
venv="$HOME/.cache/leaf-python"
stamp="$venv/.requirements.sha256"
want=$(sha256sum scripts/requirements.txt | cut -d' ' -f1)
if [ ! -x "$venv/bin/python" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
  rm -rf "$venv"
  "$py" -m venv "$venv"
  "$venv/bin/pip" install --quiet --disable-pip-version-check --require-hashes -r scripts/requirements.txt
  echo "$want" > "$stamp"
fi

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export LEAF_PYTHON=\"$venv/bin/python\"" >> "$CLAUDE_ENV_FILE"
fi
