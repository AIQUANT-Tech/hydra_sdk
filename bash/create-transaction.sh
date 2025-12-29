#!/bin/bash
# Helper to create Hydra transaction - FIXED: uses ALL UTXOs like L1 script

set -e

if [ "$#" -ne 4 ]; then
    echo "Usage: $0 <from-participant> <to-participant> <amount-in-ada> <api-port>"
    echo "Example: $0 platform platform-peer 10 4001"
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

# FIXED: Get ALL sender UTXOs (like L1 send-all-utxos)
jq "with_entries(select(.value.address == \"$FROM_ADDR\"))" \
  /tmp/head-utxo.json > /tmp/${FROM}-utxo.json

# ONE LINE CHANGE: Get ALL tx-ins instead of just first
TX_INS=$(jq -r 'to_entries[] | "--tx-in \(.key)"' /tmp/${FROM}-utxo.json)
TOTAL_BALANCE=$(jq -r '[to_entries[].value.value.lovelace] | map(tonumber) | add' /tmp/${FROM}-utxo.json)
CHANGE=$((TOTAL_BALANCE - LOVELACE))

echo "Using $TX_INS"
echo "Total balance: $TOTAL_BALANCE, sending $LOVELACE, change: $CHANGE"

cardano-cli latest transaction build-raw \
  $TX_INS \
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