#!/usr/bin/env bash
set -euo pipefail

# ── Config ──
REPO="boltenv/boltenv"
INSTALL_DIR="${BOLTENV_INSTALL_DIR:-/usr/local/bin}"
VERSION="${BOLTENV_VERSION:-latest}"

# ── Detect platform ──
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

case "$OS" in
  linux|darwin) ;;
  *)
    echo "Error: Unsupported OS: $OS"
    echo "For Windows, use: npm install -g @boltenv.dev/cli"
    exit 1
    ;;
esac

# ── Check if Node.js is available (fallback to npm install) ──
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v | sed 's/^v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 22 ] 2>/dev/null; then
    echo "Node.js $(node -v) detected. Installing via npm..."
    npm install -g @boltenv.dev/cli
    echo ""
    echo "Installed! Run 'boltenv --help' to get started."
    exit 0
  fi
fi

# ── Binary install (no Node.js or Node < 22) ──
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/boltenv-${OS}-${ARCH}"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/boltenv-${OS}-${ARCH}"
fi

echo "Installing boltenv for ${OS}/${ARCH}..."

# Download binary
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

HTTP_CODE=$(curl -fsSL -w '%{http_code}' -o "$TMPFILE" "$DOWNLOAD_URL" 2>/dev/null || true)

if [ "$HTTP_CODE" != "200" ]; then
  # Binary not available — try npm as fallback
  if command -v npm >/dev/null 2>&1; then
    echo "Pre-built binary not available yet. Installing via npm..."
    npm install -g @boltenv.dev/cli
    echo ""
    echo "Installed! Run 'boltenv --help' to get started."
    exit 0
  fi

  echo "Error: Failed to download boltenv (HTTP $HTTP_CODE)"
  echo "URL: $DOWNLOAD_URL"
  echo ""
  echo "Install via npm instead:"
  echo "  npm install -g @boltenv.dev/cli"
  echo ""
  echo "Or check releases: https://github.com/${REPO}/releases"
  exit 1
fi

chmod +x "$TMPFILE"

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMPFILE" "${INSTALL_DIR}/boltenv"
else
  echo "Installing to ${INSTALL_DIR} (requires sudo)..."
  sudo mv "$TMPFILE" "${INSTALL_DIR}/boltenv"
fi

echo ""
echo "boltenv installed to ${INSTALL_DIR}/boltenv"
echo ""
echo "Get started:"
echo "  boltenv login       # authenticate with GitHub"
echo "  boltenv init        # initialize project"
echo "  boltenv push        # encrypt & upload .env"
echo "  boltenv pull        # download & decrypt .env"
echo ""
echo "Run 'boltenv --help' for all commands."
