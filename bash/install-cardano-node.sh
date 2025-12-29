#!/bin/bash

# Complete Cardano Node + Mithril Installation Script
# For Cardano Preprod Testnet
# Compatible with Hydra Head Protocol

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║     Cardano Node + Mithril Installation Script (Preprod Testnet)      ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
WORK_DIR="$HOME/cardano-node"
BIN_DIR="$WORK_DIR/bin"
CONFIG_DIR="$WORK_DIR/preprod"
NETWORK="preprod"

# Create directories
mkdir -p "$BIN_DIR"
mkdir -p "$CONFIG_DIR"

cd "$WORK_DIR"

echo "Working directory: $WORK_DIR"
echo ""

# ============================================================================
# STEP 1: Install Mithril Client (for fast blockchain sync)
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 1: Installing Mithril Client..."
echo "─────────────────────────────────────────────────────────────────────────"

if [ -f "$BIN_DIR/mithril-client" ]; then
    echo "✓ Mithril client already installed"
else
    curl --proto '=https' --tlsv1.2 -sSf \
        https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-install.sh \
        | sh -s -- -c mithril-client -d latest -p "$BIN_DIR"

    chmod +x "$BIN_DIR/mithril-client"
    echo "✓ Mithril client installed successfully"
fi

echo ""

# ============================================================================
# STEP 2: Download Cardano Node & CLI Binaries
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 2: Downloading Cardano Node & CLI binaries..."
echo "─────────────────────────────────────────────────────────────────────────"

CARDANO_VERSION="10.1.3"

if [ -f "$BIN_DIR/cardano-node" ] && [ -f "$BIN_DIR/cardano-cli" ]; then
    echo "✓ Cardano binaries already exist"
else
    echo "Downloading cardano-node ${CARDANO_VERSION}..."

    # Download from IntersectMBO releases
    curl -L -o cardano-node-${CARDANO_VERSION}-linux.tar.gz \
        https://github.com/IntersectMBO/cardano-node/releases/download/${CARDANO_VERSION}/cardano-node-${CARDANO_VERSION}-linux.tar.gz

    # Extract everything to temp directory first
    mkdir -p temp_extract
    tar -xzf cardano-node-${CARDANO_VERSION}-linux.tar.gz -C temp_extract

    # Find and move binaries
    find temp_extract -name "cardano-node" -exec cp {} "$BIN_DIR/" \;
    find temp_extract -name "cardano-cli" -exec cp {} "$BIN_DIR/" \;

    chmod +x "$BIN_DIR/cardano-node" "$BIN_DIR/cardano-cli"

    # Cleanup
    rm -rf temp_extract cardano-node-${CARDANO_VERSION}-linux.tar.gz

    echo "✓ Cardano binaries installed successfully"
fi

echo ""

# ============================================================================
# STEP 3: Download Preprod Network Configuration Files
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 3: Downloading Preprod configuration files..."
echo "─────────────────────────────────────────────────────────────────────────"

BASE_URL="https://book.world.dev.cardano.org/environments/preprod"

declare -a CONFIG_FILES=(
    "config.json"
    "topology.json"
    "byron-genesis.json"
    "shelley-genesis.json"
    "alonzo-genesis.json"
    "conway-genesis.json"
)

for file in "${CONFIG_FILES[@]}"; do
    if [ -f "$CONFIG_DIR/$file" ]; then
        echo "✓ $file already exists"
    else
        echo "Downloading $file..."
        curl -L -o "$CONFIG_DIR/$file" "$BASE_URL/$file"
        echo "✓ $file downloaded"
    fi
done

echo ""

# ============================================================================
# STEP 4: Set up environment variables
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 4: Setting up environment variables..."
echo "─────────────────────────────────────────────────────────────────────────"

# Mithril environment variables
export GENESIS_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/genesis.vkey)
export AGGREGATOR_ENDPOINT=https://aggregator.release-preprod.api.mithril.network/aggregator
export CARDANO_NODE_SOCKET_PATH="$CONFIG_DIR/node.socket"

echo "✓ Environment variables set"
echo ""
echo "GENESIS_VERIFICATION_KEY: $GENESIS_VERIFICATION_KEY"
echo "AGGREGATOR_ENDPOINT: $AGGREGATOR_ENDPOINT"
echo "CARDANO_NODE_SOCKET_PATH: $CARDANO_NODE_SOCKET_PATH"
echo ""

# ============================================================================
# STEP 5: Add to PATH permanently
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 5: Adding binaries to PATH..."
echo "─────────────────────────────────────────────────────────────────────────"

SHELL_RC="$HOME/.bashrc"
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

# Check if already added
if grep -q "# Cardano Node Path" "$SHELL_RC"; then
    echo "✓ PATH already configured in $SHELL_RC"
else
    echo "" >> "$SHELL_RC"
    echo "# Cardano Node Path" >> "$SHELL_RC"
    echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
    echo "export CARDANO_NODE_SOCKET_PATH=\"$CONFIG_DIR/node.socket\"" >> "$SHELL_RC"
    echo "✓ Added to $SHELL_RC"
fi

# Also export for current session
export PATH="$BIN_DIR:$PATH"

echo ""

# ============================================================================
# STEP 6: Verify Installation
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 6: Verifying installation..."
echo "─────────────────────────────────────────────────────────────────────────"

echo ""
echo "Mithril Client:"
"$BIN_DIR/mithril-client" --version

echo ""
echo "Cardano Node:"
"$BIN_DIR/cardano-node" --version

echo ""
echo "Cardano CLI:"
"$BIN_DIR/cardano-cli" --version

echo ""

# ============================================================================
# STEP 7: Fast Sync with Mithril
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 7: Fast blockchain sync with Mithril..."
echo "─────────────────────────────────────────────────────────────────────────"

if [ -d "$CONFIG_DIR/db" ]; then
    echo "⚠️  Database already exists at $CONFIG_DIR/db"
    echo ""
    read -p "Do you want to remove and re-download? (y/n): " REMOVE_DB
    if [[ "$REMOVE_DB" =~ ^[Yy]$ ]]; then
        echo "Removing existing database..."
        rm -rf "$CONFIG_DIR/db"
        echo "✓ Database removed"
    else
        echo "Skipping download, keeping existing database"
    fi
fi

if [ ! -d "$CONFIG_DIR/db" ]; then
    echo ""
    echo "Downloading blockchain snapshot with Mithril..."
    echo "This may take 10-30 minutes depending on your connection..."
    echo ""

    cd "$CONFIG_DIR"
    "$BIN_DIR/mithril-client" cardano-db download latest

    cd "$WORK_DIR"
    echo ""
    echo "✓ Blockchain snapshot downloaded successfully!"
fi

echo ""

# ============================================================================
# Installation Complete
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                    INSTALLATION COMPLETED! ✓                           ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Installation Summary:"
echo "  • Working Directory: $WORK_DIR"
echo "  • Binaries: $BIN_DIR"
echo "  • Config Files: $CONFIG_DIR"
echo "  • Database: $CONFIG_DIR/db"
echo "  • Socket Path: $CONFIG_DIR/node.socket"
echo ""
echo "Next Steps:"
echo ""
echo "1. Reload your shell configuration:"
echo "   source ~/.bashrc    # or source ~/.zshrc"
echo ""
echo "2. Start the Cardano node:"
echo "   cd $WORK_DIR"
echo "   ./start-node.sh"
echo ""
echo "3. Check sync status (in another terminal):"
echo "   cardano-cli query tip --testnet-magic 1"
echo ""

# ============================================================================
# Create Start Node Script
# ============================================================================

cat > "$WORK_DIR/start-node.sh" << 'STARTSCRIPT'
#!/bin/bash

# Start Cardano Preprod Node

WORK_DIR="$HOME/cardano-node"
CONFIG_DIR="$WORK_DIR/preprod"
BIN_DIR="$WORK_DIR/bin"

export CARDANO_NODE_SOCKET_PATH="$CONFIG_DIR/node.socket"

echo "Starting Cardano Node (Preprod)..."
echo "Socket: $CARDANO_NODE_SOCKET_PATH"
echo ""

"$BIN_DIR/cardano-node" run \
  --topology "$CONFIG_DIR/topology.json" \
  --database-path "$CONFIG_DIR/db" \
  --socket-path "$CONFIG_DIR/node.socket" \
  --config "$CONFIG_DIR/config.json"
STARTSCRIPT

chmod +x "$WORK_DIR/start-node.sh"

echo "✓ Created start-node.sh script"
echo ""
echo "Installation complete! 🎉"
