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
