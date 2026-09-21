#!/usr/bin/env bash
# Packages the text-utils extension and installs it into VS Code.
#
# Usage:  ./install.sh
#
# Steps performed:
#   1. npm install (only if node_modules is missing)
#   2. vsce package   -> compiles TypeScript via the vscode:prepublish script
#   3. code --install-extension <vsix> --force
#
# Requires the `code` CLI on PATH. Uses `vsce` if installed, else `npx @vscode/vsce`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/text-utils"
cd "$EXT_DIR"

if ! command -v code >/dev/null 2>&1; then
  echo "error: the 'code' command is not on PATH." >&2
  echo "In VS Code, run 'Shell Command: Install \"code\" command in PATH' from the Command Palette, then retry." >&2
  exit 1
fi

if command -v vsce >/dev/null 2>&1; then
  VSCE=(vsce)
else
  echo "vsce not found on PATH; falling back to 'npx @vscode/vsce'"
  VSCE=(npx --yes @vscode/vsce)
fi

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies"
  npm install
fi

NAME="$(node -p "require('./package.json').name")"
VERSION="$(node -p "require('./package.json').version")"
VSIX="$EXT_DIR/$NAME-$VERSION.vsix"

echo "==> Packaging $NAME $VERSION"
"${VSCE[@]}" package --allow-missing-repository --skip-license -o "$VSIX"

echo "==> Installing $VSIX"
code --install-extension "$VSIX" --force

echo
echo "Installed $NAME $VERSION."
echo "Reload VS Code to pick up the new build: Command Palette -> 'Developer: Reload Window'."
