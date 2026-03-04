#!/bin/bash
set -e

INSTALL_DIR="$HOME/.local/share/mush"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "Mush Installer v1.0.0"
echo "=========================================="
echo ""

echo "Installing to ${INSTALL_DIR}..."
rm -rf "${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
mkdir -p "${BIN_DIR}"
mkdir -p "${DESKTOP_DIR}"

# Copy from the script's directory
cd "${SCRIPT_DIR}"

if [ ! -d "bin" ]; then
    echo "Error: bin directory not found. Run this script from the extracted package directory."
    exit 1
fi

cp -r bin "${INSTALL_DIR}/"
cp -r gui "${INSTALL_DIR}/"
cp -r assets "${INSTALL_DIR}/"
mkdir -p "${INSTALL_DIR}/outputs"

echo "Setting permissions..."
chmod +x "${INSTALL_DIR}"/bin/*

echo "Creating launcher scripts..."
cat > "${BIN_DIR}/mush" << 'EOFMUSH'
#!/bin/bash
MUSH_DIR="$HOME/.local/share/mush"
"${MUSH_DIR}/bin/mush" "$@"
EOFMUSH
chmod +x "${BIN_DIR}/mush"

cat > "${BIN_DIR}/mush-gui" << 'EOFGUI'
#!/bin/bash
MUSH_DIR="$HOME/.local/share/mush"
cd "${MUSH_DIR}/gui"
if [ ! -d node_modules ]; then
    echo "Installing GUI dependencies (first run only)..."
    npm install --production --silent
fi
npm start
EOFGUI
chmod +x "${BIN_DIR}/mush-gui"

echo "Creating desktop entry..."
cat > "${DESKTOP_DIR}/mush.desktop" << EOFDESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Mush
Comment=Multi-Interface Transport System
Exec=${BIN_DIR}/mush-gui
Icon=${INSTALL_DIR}/assets/mush-icon.svg
Terminal=false
Categories=Network;FileTransfer;
EOFDESKTOP

echo "Installing GUI dependencies..."
cd "${INSTALL_DIR}/gui"
npm install --production --silent 2>&1 | grep -v "npm warn" || true

echo ""
echo "=========================================="
echo "Installation Complete!"
echo "=========================================="
echo ""
echo "Installed to: ${INSTALL_DIR}"
echo ""
echo "Binaries installed:"
ls -1 "${INSTALL_DIR}/bin/" | grep "mush_phase"
echo ""
echo "Usage:"
echo "  mush <URL>     - Download using CLI"
echo "  mush-gui       - Launch GUI"
echo ""
echo "Note: Make sure $HOME/.local/bin is in your PATH"
echo "Add this to your ~/.bashrc or ~/.zshrc if needed:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo ""
echo "Desktop entry created at: ${DESKTOP_DIR}/mush.desktop"
echo ""
