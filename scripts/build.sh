#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
DIST_DIR="dist"
BIN_DIR="bin"

echo "Building boltenv v${VERSION}..."

# Clean
rm -rf "$DIST_DIR" "$BIN_DIR"
mkdir -p "$DIST_DIR" "$BIN_DIR"

# Step 1: Compile TypeScript
echo "  Compiling TypeScript..."
npx tsc --project tsconfig.build.json

# Step 2: Bundle into single file
echo "  Bundling..."
npx esbuild dist/index.js \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile=dist/bundle.mjs \
  --external:@inquirer/prompts \
  --minify

echo "  Bundle: dist/bundle.mjs ($(du -h dist/bundle.mjs | cut -f1))"

echo ""
echo "Build complete."
echo "  Run locally:  npx tsx src/index.ts --help"
echo "  Run built:    node dist/index.js --help"
