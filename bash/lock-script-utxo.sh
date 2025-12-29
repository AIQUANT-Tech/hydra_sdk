#!/usr/bin/env bash
set -euo pipefail
set -x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUTUS_DIR="$ROOT_DIR/plutus"
CRED_DIR="$ROOT_DIR/credentials/platform"

SCRIPT="$PLUTUS_DIR/always-true.plutus"
DATUM="$PLUTUS_DIR/datum.json"
CARDANO_TESTNET_MAGIC=${CARDANO_TESTNET_MAGIC:-1}
NETWORK="--testnet-magic ${CARDANO_TESTNET_MAGIC}"

SCRIPT_ADDR_FILE="$PLUTUS_DIR/script.addr"
TMP_DIR="/tmp/hydra-lock"
mkdir -p "$TMP_DIR"

echo "===== lock-script-utxo.sh ====="
cardano-cli address build --payment-script-file "$SCRIPT" $NETWORK --out-file "$SCRIPT_ADDR_FILE"
SCRIPT_ADDR=$(cat "$SCRIPT_ADDR_FILE")
FUND_ADDR=$(cat "$CRED_DIR/platform-funds.addr")

# build TX_IN_ARGS from all UTxOs (your existing logic)
UTXO_JSON=$(cardano-cli query utxo --address "$FUND_ADDR" $NETWORK --output-json)
TX_IN_ARGS=$(echo "$UTXO_JSON" | jq -r 'keys[] | "--tx-in " + .')
if [ -z "$TX_IN_ARGS" ]; then echo "❌ No UTxOs found"; exit 1; fi

cardano-cli conway transaction build \
  $TX_IN_ARGS \
  --tx-out "$SCRIPT_ADDR+10000000" \
  --tx-out-inline-datum-file "$DATUM" \
  --change-address "$FUND_ADDR" \
  $NETWORK \
  --out-file "$TMP_DIR/lock-script.raw"

cardano-cli conway transaction sign \
  --tx-body-file "$TMP_DIR/lock-script.raw" \
  --signing-key-file "$CRED_DIR/platform-funds.sk" \
  --out-file "$TMP_DIR/lock-script.signed"

# compute txid of the signed tx
TXID=$(cardano-cli conway transaction txid --tx-file "$TMP_DIR/lock-script.signed")
echo "Built TXID: $TXID"

# submit
cardano-cli conway transaction submit --tx-file "$TMP_DIR/lock-script.signed" $NETWORK
echo "Submitted txid: $TXID"

# wait until the script address has an output from this txid and capture the exact txin (txid#txix)
SCRIPT_TXIN_FILE="/tmp/script-txin.txt"
MAX_RETRIES=20
SLEEP=3
i=0
while [ $i -lt $MAX_RETRIES ]; do
  # query all utxos at script address
  OUT_JSON=$(cardano-cli query utxo --address "$SCRIPT_ADDR" $NETWORK --output-json)
  # find key that begins with TXID
  FOUND=$(echo "$OUT_JSON" | jq -r --arg txid "$TXID" 'keys[] | select(startswith($txid))' || true)
  if [ -n "$FOUND" ]; then
    echo "Found script UTxO from tx $TXID : $FOUND"
    echo "$FOUND" > "$SCRIPT_TXIN_FILE"
    break
  fi
  i=$((i+1))
  echo "Waiting for script UTxO to appear... retry $i/$MAX_RETRIES"
  sleep $SLEEP
done

if [ ! -s "$SCRIPT_TXIN_FILE" ]; then
  echo "❌ Failed to find script UTxO for tx $TXID after $((MAX_RETRIES*SLEEP))s"
  echo "Dumping script address UTxOs for debugging:"
  cardano-cli query utxo --address "$SCRIPT_ADDR" $NETWORK --output-json | jq .
  exit 1
fi

echo "✅ Script UTxO locked and txin recorded at $SCRIPT_TXIN_FILE"