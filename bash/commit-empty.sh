#!/usr/bin/env bash
set -euo pipefail
set -x

API_PORT=${1:-4002}
CARDANO_TESTNET_MAGIC=${CARDANO_TESTNET_MAGIC:-1}
NETWORK="--testnet-magic ${CARDANO_TESTNET_MAGIC}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRED_DIR="$ROOT_DIR/credentials/platform-peer"

COMMIT_REQ=/tmp/peer-commit-req.json
COMMIT_TX=/tmp/peer-commit-tx.json
SIGNED_TX=/tmp/peer-commit-signed.json

ADDR=$(cat "$CRED_DIR/platform-peer-funds.addr")

echo "===== commit-peer-minimal.sh ====="
echo "Address: $ADDR"

# Fetch UTxOs
UTXO_JSON=$(cardano-cli query utxo \
  --address "$ADDR" \
  $NETWORK \
  --output-json)

TXIN=$(echo "$UTXO_JSON" | jq -r 'keys[0]')

if [ -z "$TXIN" ] || [ "$TXIN" = "null" ]; then
  echo "❌ platform-peer has no UTxO to commit"
  exit 1
fi

echo "Using UTxO: $TXIN"

# Build valid commit request (ONE real input)
jq -n --arg txin "$TXIN" '
{
  utxo: {
    ($txin): {}
  },
  blueprintTx: null
}
' > "$COMMIT_REQ"

echo "🚀 Sending commit to Hydra (peer)"
curl -s -X POST \
  --data @"$COMMIT_REQ" \
  http://127.0.0.1:$API_PORT/commit \
  > "$COMMIT_TX"

# Validate response is a tx
jq -e '.type == "Tx ConwayEra"' "$COMMIT_TX" >/dev/null

echo "✍️ Signing peer commit tx"
cardano-cli conway transaction sign \
  --tx-body-file "$COMMIT_TX" \
  --signing-key-file "$CRED_DIR/platform-peer-funds.sk" \
  --out-file "$SIGNED_TX"

echo "🚀 Submitting peer commit tx"
cardano-cli conway transaction submit \
  --tx-file "$SIGNED_TX" \
  $NETWORK

echo "✅ platform-peer committed minimal UTxO"
