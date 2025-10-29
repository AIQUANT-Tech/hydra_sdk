#!/bin/bash

# Complete Hydra Node Installation Script
# Installs Hydra binaries globally, keeps credentials local

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║        Hydra Head Protocol Installation (Cardano Layer 2)             ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Configuration
GLOBAL_BIN_DIR="$HOME/.local/bin"          # Global binaries (like cardano-node)
LOCAL_DIR="$(pwd)"                   # Local project directory
SCRIPTS_DIR="$LOCAL_DIR/scripts"
CREDENTIALS_DIR="$LOCAL_DIR/credentials"
HYDRA_VERSION="0.22.4"

# Create directories if they don't exist
mkdir -p "$GLOBAL_BIN_DIR"
mkdir -p "$LOCAL_DIR"
mkdir -p "$SCRIPTS_DIR"
mkdir -p "$CREDENTIALS_DIR"

echo "Global binaries: $GLOBAL_BIN_DIR"
echo "Local project: $LOCAL_DIR"
echo ""

# ============================================================================
# STEP 1: Install Dependencies
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 1: Installing system dependencies..."
echo "─────────────────────────────────────────────────────────────────────────"

if command -v websocat &> /dev/null; then
    echo "✓ websocat already installed"
else
    echo "Installing websocat..."
    sudo apt update
    sudo apt install -y websocat jq curl unzip
    echo "✓ Dependencies installed"
fi

echo ""

# ============================================================================
# STEP 2: Download Hydra Binaries (Global)
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 2: Installing Hydra binaries globally..."
echo "─────────────────────────────────────────────────────────────────────────"

if [ -f "$GLOBAL_BIN_DIR/hydra-node" ]; then
    echo "✓ Hydra binaries already installed"
else
    echo "Downloading Hydra ${HYDRA_VERSION}..."

    cd /tmp
    curl -L -o hydra-x86_64-linux-${HYDRA_VERSION}.zip \
        https://github.com/cardano-scaling/hydra/releases/download/${HYDRA_VERSION}/hydra-x86_64-linux-${HYDRA_VERSION}.zip

    unzip -o hydra-x86_64-linux-${HYDRA_VERSION}.zip
    chmod +x hydra-*
    mv hydra-* "$GLOBAL_BIN_DIR/"
    rm hydra-x86_64-linux-${HYDRA_VERSION}.zip

    echo "✓ Hydra binaries installed to $GLOBAL_BIN_DIR"
fi

echo ""

# ============================================================================
# STEP 3: Add to PATH permanently
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 3: Adding Hydra binaries to PATH..."
echo "─────────────────────────────────────────────────────────────────────────"

SHELL_RC="$HOME/.bashrc"
if [ -n "$ZSH_VERSION" ]; then
    SHELL_RC="$HOME/.zshrc"
fi

if grep -q "# Hydra Global Path" "$SHELL_RC"; then
    echo "✓ PATH already configured"
else
    echo "" >> "$SHELL_RC"
    echo "# Hydra Global Path" >> "$SHELL_RC"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
    echo "✓ Added to $SHELL_RC"
fi

export PATH="$GLOBAL_BIN_DIR:$PATH"

echo ""

# ============================================================================
# STEP 4: Verify Installation
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 4: Verifying installation..."
echo "─────────────────────────────────────────────────────────────────────────"

echo ""
echo "Hydra Node:"
"$GLOBAL_BIN_DIR/hydra-node" --version

echo ""
echo "Hydra TUI:"
"$GLOBAL_BIN_DIR/hydra-tui" --version 2>/dev/null || echo "hydra-tui not available (optional)"

echo ""

# ============================================================================
# STEP 5: Create Local Project Scripts
# ============================================================================

echo "─────────────────────────────────────────────────────────────────────────"
echo "Step 5: Creating local utility scripts..."
echo "─────────────────────────────────────────────────────────────────────────"

# Generate Keys Script
cat > "$SCRIPTS_DIR/generate-keys.sh" << 'GENKEYS'
#!/bin/bash
# Generate Hydra and Cardano keys for a participant

set -e

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <participant-name>"
    echo "Example: $0 alice"
    exit 1
fi

PARTICIPANT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"

mkdir -p "$CRED_DIR"

echo "Generating keys for: $PARTICIPANT"
echo ""

# Generate Hydra keys
echo "1/3: Generating Hydra signing & verification keys..."
hydra-node gen-hydra-key --output-file "$CRED_DIR/${PARTICIPANT}-hydra"
echo "✓ Created: ${PARTICIPANT}-hydra.sk, ${PARTICIPANT}-hydra.vk"

# Generate Cardano node keys
echo "2/3: Generating Cardano node keys..."
cardano-cli address key-gen \
  --verification-key-file "$CRED_DIR/${PARTICIPANT}-node.vk" \
  --signing-key-file "$CRED_DIR/${PARTICIPANT}-node.sk"

cardano-cli address build \
  --verification-key-file "$CRED_DIR/${PARTICIPANT}-node.vk" \
  --testnet-magic 1 \
  --out-file "$CRED_DIR/${PARTICIPANT}-node.addr"
echo "✓ Created: ${PARTICIPANT}-node.sk, ${PARTICIPANT}-node.vk, ${PARTICIPANT}-node.addr"

# Generate Cardano funds keys
echo "3/3: Generating Cardano funds keys..."
cardano-cli address key-gen \
  --verification-key-file "$CRED_DIR/${PARTICIPANT}-funds.vk" \
  --signing-key-file "$CRED_DIR/${PARTICIPANT}-funds.sk"

cardano-cli address build \
  --verification-key-file "$CRED_DIR/${PARTICIPANT}-funds.vk" \
  --testnet-magic 1 \
  --out-file "$CRED_DIR/${PARTICIPANT}-funds.addr"
echo "✓ Created: ${PARTICIPANT}-funds.sk, ${PARTICIPANT}-funds.vk, ${PARTICIPANT}-funds.addr"

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                    Keys Generated Successfully! ✓                      ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Node Address (fund with ~100 tADA for fees):"
cat "$CRED_DIR/${PARTICIPANT}-node.addr"
echo ""
echo "Funds Address (fund with amount to commit to head):"
cat "$CRED_DIR/${PARTICIPANT}-funds.addr"
echo ""
echo "Keys saved to: $CRED_DIR"
GENKEYS

chmod +x "$SCRIPTS_DIR/generate-keys.sh"
echo "✓ Created: generate-keys.sh"

# Wallet Balance Script
cat > "$SCRIPTS_DIR/wallet-balance.sh" << 'BALANCE'
#!/bin/bash
# Check wallet balance

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <address-file-path>"
  echo "Example: $0 credentials/alice/alice-funds.addr"
  exit 1
fi

ADDRESS_FILE=$1

if [ ! -f "$ADDRESS_FILE" ]; then
    echo "Error: Address file not found: $ADDRESS_FILE"
    exit 1
fi

ADDRESS=$(cat "$ADDRESS_FILE")

echo "Address: $ADDRESS"
echo ""

cardano-cli query utxo \
  --address "$ADDRESS" \
  --testnet-magic 1
BALANCE

chmod +x "$SCRIPTS_DIR/wallet-balance.sh"
echo "✓ Created: wallet-balance.sh"

# Setup Protocol Parameters Script
cat > "$SCRIPTS_DIR/setup-protocol-params.sh" << 'PROTOCOL'
#!/bin/bash
# Setup protocol parameters with zero fees for Hydra

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Querying Cardano protocol parameters..."

cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  | jq '.txFeeFixed = 0 | .txFeePerByte = 0 | .executionUnitPrices.priceMemory = 0 | .executionUnitPrices.priceSteps = 0' \
  > "$PROJECT_DIR/protocol-parameters.json"

echo "✓ Protocol parameters saved to: $PROJECT_DIR/protocol-parameters.json"
echo ""
echo "Fees configured to zero for Hydra transactions"
PROTOCOL

chmod +x "$SCRIPTS_DIR/setup-protocol-params.sh"
echo "✓ Created: setup-protocol-params.sh"

# Start Hydra Node Script
cat > "$SCRIPTS_DIR/start-hydra-node.sh" << 'STARTHYDRA'
#!/bin/bash
# Start Hydra node for a participant

set -e

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <participant> <peer-participant> [peer-participant2...]"
    echo "Example: $0 alice bob"
    echo "Example: $0 alice bob carol"
    exit 1
fi

PARTICIPANT=$1
shift
PEERS=("$@")

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"
PERSISTENCE_DIR="$PROJECT_DIR/persistence-$PARTICIPANT"

# Determine port numbers based on participant
case $PARTICIPANT in
    alice)
        API_PORT=4001
        LISTEN_PORT=5001
        ;;
    bob)
        API_PORT=4002
        LISTEN_PORT=5002
        ;;
    carol)
        API_PORT=4003
        LISTEN_PORT=5003
        ;;
    *)
        echo "Error: Unsupported participant: $PARTICIPANT"
        echo "Supported: alice, bob, carol"
        exit 1
        ;;
esac

# Build peer connections and verification keys
PEER_ARGS=""
HYDRA_VK_ARGS=""
CARDANO_VK_ARGS=""

for peer in "${PEERS[@]}"; do
    case $peer in
        alice)
            PEER_PORT=5001
            ;;
        bob)
            PEER_PORT=5002
            ;;
        carol)
            PEER_PORT=5003
            ;;
        *)
            echo "Error: Unsupported peer: $peer"
            exit 1
            ;;
    esac

    PEER_ARGS="$PEER_ARGS --peer 127.0.0.1:$PEER_PORT"
    HYDRA_VK_ARGS="$HYDRA_VK_ARGS --hydra-verification-key $PROJECT_DIR/credentials/$peer/${peer}-hydra.vk"
    CARDANO_VK_ARGS="$CARDANO_VK_ARGS --cardano-verification-key $PROJECT_DIR/credentials/$peer/${peer}-node.vk"
done

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                Starting Hydra Node: $PARTICIPANT"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "API Port: $API_PORT"
echo "Listen Port: $LISTEN_PORT"
echo "Peers: ${PEERS[@]}"
echo ""

mkdir -p "$PERSISTENCE_DIR"

hydra-node \
  --node-id "${PARTICIPANT}-node" \
  --persistence-dir "$PERSISTENCE_DIR" \
  --cardano-signing-key "$CRED_DIR/${PARTICIPANT}-node.sk" \
  --hydra-signing-key "$CRED_DIR/${PARTICIPANT}-hydra.sk" \
  --network preprod \
  --ledger-protocol-parameters "$PROJECT_DIR/protocol-parameters.json" \
  --testnet-magic 1 \
  --node-socket "$CARDANO_NODE_SOCKET_PATH" \
  --api-port $API_PORT \
  --listen 127.0.0.1:$LISTEN_PORT \
  --api-host 127.0.0.1 \
  $PEER_ARGS \
  $HYDRA_VK_ARGS \
  $CARDANO_VK_ARGS
STARTHYDRA

chmod +x "$SCRIPTS_DIR/start-hydra-node.sh"
echo "✓ Created: start-hydra-node.sh"

# Connect WebSocket Script
cat > "$SCRIPTS_DIR/connect-websocket.sh" << 'WEBSOCKET'
#!/bin/bash
# Connect to Hydra node WebSocket

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <participant>"
    echo "Example: $0 alice"
    exit 1
fi

PARTICIPANT=$1

case $PARTICIPANT in
    alice)
        PORT=4001
        ;;
    bob)
        PORT=4002
        ;;
    carol)
        PORT=4003
        ;;
    *)
        echo "Error: Unsupported participant: $PARTICIPANT"
        echo "Supported: alice, bob, carol"
        exit 1
        ;;
esac

echo "Connecting to $PARTICIPANT Hydra node WebSocket..."
echo "Port: $PORT"
echo ""
echo "Commands you can use:"
echo "  {\"tag\":\"Init\"}     - Initialize Hydra Head"
echo "  {\"tag\":\"Close\"}    - Close Hydra Head"
echo "  {\"tag\":\"Fanout\"}   - Distribute funds after close"
echo ""

websocat ws://127.0.0.1:$PORT
WEBSOCKET

chmod +x "$SCRIPTS_DIR/connect-websocket.sh"
echo "✓ Created: connect-websocket.sh"

# Create transaction helper
cat > "$SCRIPTS_DIR/create-transaction.sh" << 'CREATETX'
#!/bin/bash
# Helper to create Hydra transaction

set -e

if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <from-participant> <to-participant> <amount-in-ada> <api-port>"
    echo "Example: $0 alice bob 10 4001"
    exit 1
fi

FROM=$1
TO=$2
AMOUNT_ADA=$3
API_PORT=$4

LOVELACE=$((AMOUNT_ADA * 1000000))

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Creating transaction: $FROM → $TO ($AMOUNT_ADA ADA)"

# Get UTxOs
curl -s 127.0.0.1:$API_PORT/snapshot/utxo | jq > /tmp/head-utxo.json

FROM_ADDR=$(cat "$PROJECT_DIR/credentials/$FROM/${FROM}-funds.addr")
TO_ADDR=$(cat "$PROJECT_DIR/credentials/$TO/${TO}-funds.addr")

jq "with_entries(select(.value.address == \"$FROM_ADDR\"))" \
  /tmp/head-utxo.json > /tmp/${FROM}-utxo.json

TX_IN=$(jq -r 'to_entries[0].key' /tmp/${FROM}-utxo.json)
FROM_BALANCE=$(jq -r 'to_entries[0].value.value.lovelace' /tmp/${FROM}-utxo.json)
CHANGE=$((FROM_BALANCE - LOVELACE))

cardano-cli latest transaction build-raw \
  --tx-in "$TX_IN" \
  --tx-out "${TO_ADDR}+${LOVELACE}" \
  --tx-out "${FROM_ADDR}+${CHANGE}" \
  --fee 0 \
  --out-file /tmp/tx.raw

cardano-cli latest transaction sign \
  --tx-body-file /tmp/tx.raw \
  --signing-key-file "$PROJECT_DIR/credentials/$FROM/${FROM}-funds.sk" \
  --out-file /tmp/tx.signed

CBOR_HEX=$(jq -r '.cborHex' /tmp/tx.signed)

echo ""
echo "Copy and paste this into WebSocket:"
echo ""
echo "{\"tag\":\"NewTx\",\"transaction\":{\"cborHex\":\"$CBOR_HEX\",\"description\":\"\",\"type\":\"Tx ConwayEra\"}}"
echo ""
CREATETX

chmod +x "$SCRIPTS_DIR/create-transaction.sh"
echo "✓ Created: create-transaction.sh"

# Commit funds helper
cat > "$SCRIPTS_DIR/commit-funds.sh" << 'COMMIT'
#!/bin/bash
# Commit funds to Hydra Head

set -e

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <participant> <api-port>"
    echo "Example: $0 alice 4001"
    exit 1
fi

PARTICIPANT=$1
API_PORT=$2

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"

echo "Committing $PARTICIPANT funds to Hydra Head..."

# Get UTxO
cardano-cli query utxo \
  --address $(cat "$CRED_DIR/${PARTICIPANT}-funds.addr") \
  --testnet-magic 1 \
  --out-file /tmp/${PARTICIPANT}-utxo.json

# Draft commit
curl -X POST 127.0.0.1:$API_PORT/commit \
  --data @/tmp/${PARTICIPANT}-utxo.json \
  > /tmp/${PARTICIPANT}-commit-draft.json

# Sign
cardano-cli latest transaction sign \
  --tx-file /tmp/${PARTICIPANT}-commit-draft.json \
  --signing-key-file "$CRED_DIR/${PARTICIPANT}-funds.sk" \
  --testnet-magic 1 \
  --out-file /tmp/${PARTICIPANT}-commit-signed.json

# Submit
cardano-cli latest transaction submit \
  --tx-file /tmp/${PARTICIPANT}-commit-signed.json \
  --testnet-magic 1

echo "✓ Commit transaction submitted"
COMMIT

chmod +x "$SCRIPTS_DIR/commit-funds.sh"
echo "✓ Created: commit-funds.sh"

# Create .gitignore
cat > "$LOCAL_DIR/.gitignore" << 'GITIGNORE'
# Sensitive files
credentials/
persistence-*/
*.sk
*.vk
*.addr

# Temp files
protocol-parameters.json
*.json
*.raw
*.signed

# OS files
.DS_Store
Thumbs.db
GITIGNORE

echo "✓ Created: .gitignore"

echo ""

# ============================================================================
# Installation Complete
# ============================================================================

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                    INSTALLATION COMPLETED! ✓                           ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Installation Summary:"
echo "  • Global binaries: $GLOBAL_BIN_DIR"
echo "  • Local project: $LOCAL_DIR"
echo "  • Scripts: $SCRIPTS_DIR"
echo "  • Credentials: $CREDENTIALS_DIR"
echo ""
echo "Next Steps:"
echo ""
echo "1. Reload your shell:"
echo "   source ~/.bashrc"
echo ""
echo "2. Navigate to project directory:"
echo "   cd $LOCAL_DIR"
echo ""
echo "3. Generate keys:"
echo "   ./scripts/generate-keys.sh alice"
echo "   ./scripts/generate-keys.sh bob"
echo ""
echo "4. Fund addresses from faucet"
echo ""
echo "5. Setup protocol parameters:"
echo "   ./scripts/setup-protocol-params.sh"
echo ""
echo "6. Start Hydra nodes:"
echo "   ./scripts/start-hydra-node.sh alice bob"
echo "   ./scripts/start-hydra-node.sh bob alice"
echo ""
echo "Installation complete! 🎉"
