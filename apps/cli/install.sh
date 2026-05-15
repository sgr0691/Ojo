#!/bin/bash
# Ojo Installer — adds shims to PATH
set -euo pipefail

OJO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHIM_DIR="$OJO_DIR/apps/cli/shim"
OJO_CLI_DIR="$OJO_DIR/apps/cli/dist"

echo "Ojo Installer"
echo "============="
echo ""

if [ ! -f "$OJO_CLI_DIR/index.js" ]; then
  echo "Building Ojo..."
  (cd "$OJO_DIR" && pnpm build)
fi

echo "Shim directory: $SHIM_DIR"

detect_shell_profile() {
  case "$SHELL" in
    */zsh) echo "$HOME/.zshrc" ;;
    */bash)
      if [ -f "$HOME/.bash_profile" ]; then
        echo "$HOME/.bash_profile"
      elif [ -f "$HOME/.bashrc" ]; then
        echo "$HOME/.bashrc"
      else
        echo "$HOME/.profile"
      fi
      ;;
    */fish) echo "$HOME/.config/fish/config.fish" ;;
    *) echo "" ;;
  esac
}

install_path() {
  local profile="$1"
  local line="export PATH=\"$SHIM_DIR:\$PATH\""

  if grep -qF "$SHIM_DIR" "$profile" 2>/dev/null; then
    echo "-> Ojo already in PATH ($profile)"
    return
  fi

  echo ""
  echo "Add the following line to $profile:"
  echo "  $line"
  echo ""
  read -p "Add it automatically? [Y/n] " -r answer
  if [[ "$answer" =~ ^[Nn] ]]; then
    echo "Skipping. Add it manually:"
    echo "  echo 'export PATH=\"$SHIM_DIR:\$PATH\"' >> $profile"
    return
  fi

  echo "$line" >> "$profile"
  echo "-> Added to $profile"
  echo "  Run: source $profile"
  echo ""
  echo "Then test with: npm install is-odd"
}

profile=$(detect_shell_profile)
if [ -n "$profile" ]; then
  install_path "$profile"
else
  echo ""
  echo "Unknown shell. Add this to your shell profile:"
  echo "  export PATH=\"$SHIM_DIR:\$PATH\""
fi

echo ""
echo "Installation complete!"
echo ""
echo "To bypass Ojo for a single install: OJO_ALLOW=true npm install <pkg>"
echo "To run in CI mode:                   OJO_CI=true npm install <pkg>"
