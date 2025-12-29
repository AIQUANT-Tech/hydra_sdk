#!/usr/bin/env bash
set -euo pipefail
set -x

API_PORT=${1:-4001}
CARDANO_TESTNET_MAGIC=${CARDANO_TESTNET_MAGIC:-1}
NETWORK="--testnet-magic ${CARDANO_TESTNET_MAGIC}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUTUS_DIR="$ROOT_DIR/plutus"
CRED_DIR="$ROOT_DIR/credentials/platform"

SCRIPT_ADDR=$(cat "$PLUTUS_DIR/script.addr")
SCRIPT_TXIN=$(cat /tmp/script-txin.txt)

TMP_UTXO_CTX=/tmp/script-utxo-context.json
TMP_BLUEPRINT=/tmp/script-blueprint.json
TMP_COMMIT_REQ=/tmp/commit-request.json
TMP_COMMIT_TX=/tmp/commit-tx.json
TMP_SIGNED=/tmp/commit-signed.json

echo "===== commit-script-utxo.sh ====="

# 1️⃣ Query script address UTxOs
cardano-cli query utxo \
  --address "$SCRIPT_ADDR" \
  $NETWORK \
  --output-json > /tmp/all-script-utxos.json

# 2️⃣ Extract ONLY the script UTxO we are committing
jq --arg txin "$SCRIPT_TXIN" \
  '{ ($txin): .[$txin] }' \
  /tmp/all-script-utxos.json > "$TMP_UTXO_CTX"

# sanity check
if jq -e 'length == 0' "$TMP_UTXO_CTX" >/dev/null; then
  echo "❌ Script UTxO not found in address"
  exit 1
fi

# 3️⃣ Build blueprint tx (already created earlier)
if [ ! -f "$TMP_BLUEPRINT" ]; then
  echo "❌ Missing blueprint tx"
  exit 1
fi

# 4️⃣ Build commit request SAFELY (NO argjson)
jq -n \
  --slurpfile utxo "$TMP_UTXO_CTX" \
  --slurpfile blueprint "$TMP_BLUEPRINT" \
  '{ utxo: $utxo[0], blueprintTx: $blueprint[0] }' \
  > "$TMP_COMMIT_REQ"

# 5️⃣ Send commit request to Hydra
curl -s -X POST \
  --data @"$TMP_COMMIT_REQ" \
  http://127.0.0.1:$API_PORT/commit \
  > "$TMP_COMMIT_TX"

# 6️⃣ Sign (fund key + party key)
cardano-cli conway transaction sign \
  --tx-body-file "$TMP_COMMIT_TX" \
  --signing-key-file "$CRED_DIR/platform-funds.sk" \
  --signing-key-file "$CRED_DIR/platform-node.sk" \
  --out-file "$TMP_SIGNED"

# 7️⃣ Submit
cardano-cli conway transaction submit \
  --tx-file "$TMP_SIGNED" \
  $NETWORK

echo "✅ Script UTxO committed successfully"

# #!/usr/bin/env bash
# set -euo pipefail
# set -x

# API_PORT=${1:-4001}
# CARDANO_TESTNET_MAGIC=${CARDANO_TESTNET_MAGIC:-1}
# NETWORK="--testnet-magic ${CARDANO_TESTNET_MAGIC}"

# ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# PLUTUS_DIR="$ROOT_DIR/plutus"
# CRED_DIR="$ROOT_DIR/credentials/platform"

# TMP_SCRIPT_TXIN="/tmp/script-txin.txt"
# BLUEPRINT_FILE="/tmp/script-blueprint.json"
# COMMIT_REQUEST="/tmp/commit-request.json"
# COMMIT_TX="/tmp/commit-tx.json"
# SIGNED_COMMIT="/tmp/commit-signed.json"

# echo "===== commit-script-utxo.sh ====="

# if [ ! -f "$TMP_SCRIPT_TXIN" ]; then
#   echo "❌ Missing $TMP_SCRIPT_TXIN"
#   exit 1
# fi

# SCRIPT_TXIN=$(cat "$TMP_SCRIPT_TXIN")
# SCRIPT_ADDR=$(cat "$PLUTUS_DIR/script.addr")

# ALL_SCRIPT_UTXOS_JSON=$(cardano-cli query utxo --address "$SCRIPT_ADDR" $NETWORK --output-json)

# # Build a single-entry UTxO context with the exact txin
# UTXO_ENTRY=$(echo "$ALL_SCRIPT_UTXOS_JSON" | jq -c --arg key "$SCRIPT_TXIN" '.[$key] // empty')
# if [ -z "$UTXO_ENTRY" ]; then
#   echo "❌ Could not find $SCRIPT_TXIN in script addr UTxOs. Dumping all:"
#   echo "$ALL_SCRIPT_UTXOS_JSON" | jq .
#   exit 1
# fi

# # If inlineDatum is missing but datumhash is present, inject the datum JSON from plutus/datum.json
# # (assumes you have the original datum JSON locally)
# DATUM_FILE="$PLUTUS_DIR/datum.json"
# if echo "$UTXO_ENTRY" | jq -e '.inlineDatum == null and (.datumhash != null)' >/dev/null 2>&1; then
#   if [ -f "$DATUM_FILE" ]; then
#     DATUM_JSON=$(jq -c '.' "$DATUM_FILE")
#     # create a new UTXO object with inlineDatum injected
#     UTXO_CONTEXT_JSON=$(echo "$ALL_SCRIPT_UTXOS_JSON" | jq -c --arg key "$SCRIPT_TXIN" --argjson datum "$DATUM_JSON" '
#       { ($key) : .[$key] } | .[$key] |= (. + { inlineDatum: $datum }) ')
#     echo "Injected inlineDatum into UTxO context from $DATUM_FILE"
#   else
#     echo "❌ UTxO requires datum but local $DATUM_FILE not found"
#     exit 1
#   fi
# else
#   # either inlineDatum already present or no datum needed
#   UTXO_CONTEXT_JSON=$(echo "$ALL_SCRIPT_UTXOS_JSON" | jq -c --arg key "$SCRIPT_TXIN" '{ ($key) : .[$key] }')
# fi

# # Check blueprint file exists
# if [ ! -f "$BLUEPRINT_FILE" ]; then echo "❌ Missing $BLUEPRINT_FILE"; exit 1; fi
# BLUEPRINT_JSON=$(cat "$BLUEPRINT_FILE")

# # create commit request
# jq -n --argjson utxo "$UTXO_CONTEXT_JSON" --argjson blueprintTx "$BLUEPRINT_JSON" '{ utxo: $utxo, blueprintTx: $blueprintTx }' > "$COMMIT_REQUEST"

# curl -s -X POST --data @"$COMMIT_REQUEST" http://127.0.0.1:${API_PORT}/commit > "$COMMIT_TX" || true

# if [ ! -s "$COMMIT_TX" ]; then
#   echo "❌ Hydra did not return a commit transaction. Dumping request for debugging:"
#   jq . "$COMMIT_REQUEST"
#   exit 1
# fi

# # print required datums/signers succinctly (compatible jq expression)
# jq '{requiredDatums: .requiredDatums, requiredSigners: .requiredSigners}' "$COMMIT_TX" || true
# echo "Full commit tx (trimmed):"
# jq . "$COMMIT_TX"

# # Sign with Cardano keys only
# FUND_KEY="$CRED_DIR/platform-funds.sk"
# PARTY_KEY="$CRED_DIR/platform-node.sk"

# SIGN_CMD=(cardano-cli conway transaction sign --tx-body-file "$COMMIT_TX" --out-file "$SIGNED_COMMIT")
# if [ -f "$FUND_KEY" ]; then SIGN_CMD+=(--signing-key-file "$FUND_KEY"); else echo "❌ Missing $FUND_KEY"; exit 1; fi
# if [ -f "$PARTY_KEY" ]; then SIGN_CMD+=(--signing-key-file "$PARTY_KEY"); fi

# echo "✍️ Running signing command: ${SIGN_CMD[*]}"
# "${SIGN_CMD[@]}"

# echo "🚀 Submitting signed commit..."
# cardano-cli conway transaction submit --tx-file "$SIGNED_COMMIT" $NETWORK

# echo "✅ Script UTxO committed to Hydra Head"
