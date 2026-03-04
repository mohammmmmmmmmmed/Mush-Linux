#!/bin/bash
set -e

INSTALL_DIR="$HOME/.local/share/mush"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

echo "Uninstalling Mush..."

rm -f "${BIN_DIR}/mush"
rm -f "${BIN_DIR}/mush-gui"
rm -f "${DESKTOP_DIR}/mush.desktop"
rm -rf "${INSTALL_DIR}"

echo "Mush has been uninstalled."
