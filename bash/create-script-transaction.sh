#!/usr/bin/env bash
set -euo pipefail

# quick debug toggle (set -x for debugging)
set -x

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <to-participant> <amount-ada> <api-port>"
  exit 1
fi

TO="$1"
AMOUNT_ADA="$2"
API_PORT="$3"

# validate integer ADA amount
if ! [[ "$AMOUNT_ADA" =~ ^[0-9]+$ ]]; then
  echo "❌ amount-ada must be a non-negative integer (got: $AMOUNT_ADA)"
  exit 1
fi

# no underscores: plain integer multiplication
LOVELACE=$(( AMOUNT_ADA * 1000000 ))

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUTUS_DIR="$ROOT_DIR/plutus"
CRED_DIR="$ROOT_DIR/credentials"

SCRIPT_FILE="$PLUTUS_DIR/always-true.plutus"
SCRIPT_ADDR_FILE="$PLUTUS_DIR/script.addr"
REDEEMER_FILE="$PLUTUS_DIR/redeemer.json"

# basic file checks
for f in "$SCRIPT_FILE" "$SCRIPT_ADDR_FILE" "$REDEEMER_FILE"; do
  if [ ! -f "$f" ]; then
    echo "❌ missing required file: $f"
    exit 1
  fi
done

SCRIPT_ADDR="$(cat "$SCRIPT_ADDR_FILE")"

TO_ADDR_FILE="$CRED_DIR/$TO/${TO}-funds.addr"
PLATFORM_ADDR_FILE="$CRED_DIR/platform/platform-funds.addr"
PLATFORM_SK="$CRED_DIR/platform/platform-funds.sk"

for f in "$TO_ADDR_FILE" "$PLATFORM_ADDR_FILE" "$PLATFORM_SK"; do
  if [ ! -f "$f" ]; then
    echo "❌ missing credential file: $f"
    exit 1
  fi
done

TO_ADDR="$(cat "$TO_ADDR_FILE")"
PLATFORM_ADDR="$(cat "$PLATFORM_ADDR_FILE")"

TMP_UTXO="/tmp/head-utxo.json"
TMP_RAW="/tmp/script_tx.raw"
TMP_SIGNED="/tmp/script_tx.signed"
TMP_CARDANO_VIEW_ERR="/tmp/cardano_view.err"   # kept for debugging if needed

dump_debug() {
  echo "---- DEBUG ----"
  echo "TO=$TO AMOUNT_ADA=$AMOUNT_ADA LOVELACE=$LOVELACE"
  echo "SCRIPT_ADDR=$SCRIPT_ADDR"
  echo "TO_ADDR=$TO_ADDR"
  echo "PLATFORM_ADDR=$PLATFORM_ADDR"
  echo "Files:"
  ls -l "$TMP_RAW" "$TMP_SIGNED" "$TMP_CARDANO_VIEW_ERR" 2>/dev/null || true
  cardano-cli --version 2>/dev/null || true
  echo "---- END DEBUG ----"
}

trap 'echo "Script failed at line $LINENO"; dump_debug' ERR

# 1) fetch snapshot (from the node that runs this head)
curl -s "http://127.0.0.1:${API_PORT}/snapshot/utxo" > "$TMP_UTXO"

# 2) find script utxo
SCRIPT_TXIN=$(jq -r --arg addr "$SCRIPT_ADDR" '
  to_entries[] | select(.value.address == $addr) | .key
' "$TMP_UTXO" | head -n 1 || true)

if [ -z "$SCRIPT_TXIN" ]; then
  echo "❌ No script UTxO found in head for $SCRIPT_ADDR"
  exit 1
fi

# 3) read lovelace
SCRIPT_BALANCE=$(jq -r --arg txin "$SCRIPT_TXIN" '.[$txin].value.lovelace' "$TMP_UTXO" || true)
if [ -z "$SCRIPT_BALANCE" ] || [ "$SCRIPT_BALANCE" = "null" ]; then
  echo "❌ Failed to read script balance for $SCRIPT_TXIN"
  exit 1
fi

CHANGE=$(( SCRIPT_BALANCE - LOVELACE ))
if [ "$CHANGE" -lt 0 ]; then
  echo "❌ Not enough funds in script UTxO (have: $SCRIPT_BALANCE need: $LOVELACE)"
  exit 1
fi

# 4) build raw tx (this is where Plutus is executed)
cardano-cli conway transaction build-raw \
  --tx-in "$SCRIPT_TXIN" \
  --tx-in-script-file "$SCRIPT_FILE" \
  --tx-in-inline-datum-present \
  --tx-in-redeemer-file "$REDEEMER_FILE" \
  --tx-in-execution-units "(1000000,100000)" \
  --tx-out "$TO_ADDR+$LOVELACE" \
  --tx-out "$PLATFORM_ADDR+$CHANGE" \
  --fee 0 \
  --out-file "$TMP_RAW"

# 5) sign
cardano-cli conway transaction sign \
  --tx-body-file "$TMP_RAW" \
  --signing-key-file "$PLATFORM_SK" \
  --out-file "$TMP_SIGNED"

# hide xtrace for binary/secret files
set +x

# 6) ***extract CBOR hex robustly*** (don't call era-less 'transaction view')
# Try xxd first, fallback to hexdump/od if needed.
if command -v xxd >/dev/null 2>&1; then
  CBOR_HEX="$(xxd -p -c 1000000 "$TMP_SIGNED" | tr -d '\n')"
elif command -v hexdump >/dev/null 2>&1; then
  CBOR_HEX="$(hexdump -v -e '/1 "%02x"' "$TMP_SIGNED")"
elif command -v od >/dev/null 2>&1; then
  CBOR_HEX="$(od -An -v -t x1 "$TMP_SIGNED" | tr -d ' \n')"
else
  echo "❌ no binary-to-hex tool found (install xxd or hexdump)"
  dump_debug
  exit 1
fi

if [ -z "$CBOR_HEX" ]; then
  echo "❌ failed to produce CBOR hex from $TMP_SIGNED"
  dump_debug
  exit 1
fi

# 7) output Hydra payload
printf '\n{"tag":"NewTx","transaction":{"cborHex":"%s","description":"script-spend","type":"Tx ConwayEra"}}\n' "$CBOR_HEX"

# restore verbose if you want
set -x
exit 0
