#!/usr/bin/env bash
set -euo pipefail
set -x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUTUS_DIR="$ROOT_DIR/plutus"
SCRIPT="$PLUTUS_DIR/always-true.plutus"

CARDANO_TESTNET_MAGIC=${CARDANO_TESTNET_MAGIC:-1}
NETWORK="--testnet-magic ${CARDANO_TESTNET_MAGIC}"

SCRIPT_ADDR=$(cat "$PLUTUS_DIR/script.addr")
OUT_BLUEPRINT="/tmp/script-blueprint.json"
TMP_SCRIPT_TXIN="/tmp/script-txin.txt"

echo "===== build-script-blueprint.sh ====="
if [ ! -f "$TMP_SCRIPT_TXIN" ]; then
  echo "❌ Missing $TMP_SCRIPT_TXIN; run lock-script-utxo.sh first"
  exit 1
fi

SCRIPT_TXIN=$(cat "$TMP_SCRIPT_TXIN")
echo "Using SCRIPT_TXIN from file: $SCRIPT_TXIN"

cardano-cli conway transaction build-raw \
  --tx-in "$SCRIPT_TXIN" \
  --tx-in-script-file "$SCRIPT" \
  --tx-in-inline-datum-present \
  --tx-in-redeemer-file "$PLUTUS_DIR/redeemer.json" \
  --tx-in-execution-units '(1000000,100000)' \
  --fee 0 \
  --out-file "$OUT_BLUEPRINT"

echo "$SCRIPT_TXIN" > "$TMP_SCRIPT_TXIN"  # keep file for commit step
echo "✅ Blueprint created: $OUT_BLUEPRINT"