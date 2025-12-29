#!/bin/bash
# Commit funds to Hydra Head

set -e

# Source environment
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
fi

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <participant> <api-port>"
    echo "Example: $0 platform 4001"
    exit 1
fi

PARTICIPANT=$1
API_PORT=$2
AMOUNT=$3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"

echo "Committing $PARTICIPANT funds to Hydra Head..."

# Check if address has funds
ADDR=$(cat "$CRED_DIR/${PARTICIPANT}-funds.addr")
echo "Address: $ADDR"

# Get UTxO
cardano-cli query utxo \
  --address "$ADDR" \
  --testnet-magic 1 \
  --out-file /tmp/${PARTICIPANT}-utxo.json

echo "UTxO fetched"

# Check if UTxO is empty
if [ ! -s /tmp/${PARTICIPANT}-utxo.json ] || [ "$(cat /tmp/${PARTICIPANT}-utxo.json)" = "{}" ]; then
    echo "❌ No UTxOs found for $PARTICIPANT"
    echo "   Fund this address from faucet: https://docs.cardano.org/cardano-testnet/tools/faucet"
    exit 1
fi

# Draft commit via Hydra API
echo "Drafting commit transaction..."
curl -s -X POST http://127.0.0.1:$API_PORT/commit \
  --data @/tmp/${PARTICIPANT}-utxo.json \
  > /tmp/${PARTICIPANT}-commit-draft.json

# Check if draft succeeded
if [ ! -s /tmp/${PARTICIPANT}-commit-draft.json ]; then
    echo "❌ Failed to draft commit transaction"
    exit 1
fi

echo "Draft created"

# Sign transaction (use conway era for preprod)
echo "Signing transaction..."
cardano-cli conway transaction sign \
  --tx-file /tmp/${PARTICIPANT}-commit-draft.json \
  --signing-key-file "$CRED_DIR/${PARTICIPANT}-funds.sk" \
  --testnet-magic 1 \
  --out-file /tmp/${PARTICIPANT}-commit-signed.json

echo "Transaction signed"

# Submit transaction
echo "Submitting transaction..."
cardano-cli conway transaction submit \
  --tx-file /tmp/${PARTICIPANT}-commit-signed.json \
  --testnet-magic 1

echo "✅ Commit transaction submitted successfully"

# Cleanup
rm -f /tmp/${PARTICIPANT}-*.json
