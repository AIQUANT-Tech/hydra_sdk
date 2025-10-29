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
