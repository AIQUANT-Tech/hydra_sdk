#!/bin/bash
# Decommit UTxO from Hydra Head back to L1 (without closing Head)

set -e

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
    echo "Usage: $0 <participant> <api-port> [utxo-ref] [destination-address]"
    exit 1
fi

PARTICIPANT=$1
API_PORT=$2
SPECIFIC_UTXO=$3
DEST_ADDR=$4

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"

# Get participant's address and signing key
WALLET_ADDR=$(cat "$CRED_DIR/${PARTICIPANT}-funds.addr")
WALLET_SK="$CRED_DIR/${PARTICIPANT}-funds.sk"

# Use destination address if provided, otherwise use wallet address
FINAL_DEST_ADDR="${DEST_ADDR:-$WALLET_ADDR}"

echo "═══════════════════════════════════════════════════════════════"
echo "DECOMMIT UTxO FROM HYDRA HEAD TO L1"
echo "═══════════════════════════════════════════════════════════════"
echo "Participant: $PARTICIPANT"
echo "Wallet Address: $WALLET_ADDR"
echo "Destination: $FINAL_DEST_ADDR"
echo ""

# Step 1: Check if we can connect to Hydra node
echo "Step 1: Connecting to Hydra node..."

if ! curl -s --max-time 5 http://127.0.0.1:$API_PORT/snapshot/utxo > /dev/null 2>&1; then
    echo "❌ Cannot connect to Hydra node at port $API_PORT"
    echo "   Make sure the node is running"
    exit 1
fi

echo "✅ Connected to Hydra node"

# Step 2: Query UTxOs in the Hydra Head for this participant
echo ""
echo "Step 2: Querying UTxOs in Hydra Head..."
curl -s http://127.0.0.1:$API_PORT/snapshot/utxo > /tmp/${PARTICIPANT}-head-utxos.json

# Check if response is valid JSON
if ! jq empty /tmp/${PARTICIPANT}-head-utxos.json 2>/dev/null; then
    echo "❌ Invalid response from Hydra API"
    echo "Response:"
    cat /tmp/${PARTICIPANT}-head-utxos.json
    exit 1
fi

# Filter UTxOs owned by this participant
jq --arg addr "$WALLET_ADDR" \
    'with_entries(select(.value.address == $addr))' \
    /tmp/${PARTICIPANT}-head-utxos.json > /tmp/${PARTICIPANT}-owned-utxos.json

UTXO_COUNT=$(jq 'length' /tmp/${PARTICIPANT}-owned-utxos.json)

if [ "$UTXO_COUNT" -eq 0 ]; then
    echo "❌ No UTxOs found in Head for $PARTICIPANT"
    echo "   Address: $WALLET_ADDR"
    echo ""
    echo "All UTxOs in Head:"
    jq '.' /tmp/${PARTICIPANT}-head-utxos.json
    exit 1
fi

echo "✅ Found $UTXO_COUNT UTxO(s) owned by $PARTICIPANT in Head"

# Step 3: Select UTxO to decommit
echo ""
echo "Step 3: Selecting UTxO to decommit..."

if [ -n "$SPECIFIC_UTXO" ]; then
    UTXO_REF="$SPECIFIC_UTXO"
    UTXO_DATA=$(jq --arg ref "$UTXO_REF" '.[$ref] // empty' /tmp/${PARTICIPANT}-owned-utxos.json)
    
    if [ -z "$UTXO_DATA" ] || [ "$UTXO_DATA" == "null" ]; then
        echo "❌ Specified UTxO not found: $UTXO_REF"
        echo ""
        echo "Available UTxOs:"
        jq -r 'to_entries[] | "\(.key): \((.value.value.lovelace / 1000000) | floor) ADA"' \
            /tmp/${PARTICIPANT}-owned-utxos.json
        exit 1
    fi
else
    UTXO_REF=$(jq -r 'to_entries[0].key' /tmp/${PARTICIPANT}-owned-utxos.json)
    UTXO_DATA=$(jq --arg ref "$UTXO_REF" '.[$ref]' /tmp/${PARTICIPANT}-owned-utxos.json)
fi

LOVELACE=$(echo "$UTXO_DATA" | jq -r '.value.lovelace')
ADA=$(echo "scale=6; $LOVELACE / 1000000" | bc)

echo "  UTxO: $UTXO_REF"
echo "  Amount: $LOVELACE Lovelace ($ADA ADA)"

# Step 4: Build decommit transaction
echo ""
echo "Step 4: Building decommit transaction..."

cardano-cli conway transaction build-raw \
    --tx-in "$UTXO_REF" \
    --tx-out "${FINAL_DEST_ADDR}+${LOVELACE}" \
    --fee 0 \
    --out-file /tmp/${PARTICIPANT}-decommit.json

echo "✅ Transaction built"

# Step 5: Sign the transaction
echo ""
echo "Step 5: Signing transaction..."

cardano-cli conway transaction sign \
    --tx-file /tmp/${PARTICIPANT}-decommit.json \
    --signing-key-file "$WALLET_SK" \
    --out-file /tmp/${PARTICIPANT}-decommit-signed.json

echo "✅ Transaction signed"

# Step 6: Submit to Hydra decommit endpoint
echo ""
echo "Step 6: Submitting decommit to Hydra Head..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:$API_PORT/decommit \
    --header "Content-Type: application/json" \
    --data @/tmp/${PARTICIPANT}-decommit-signed.json)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
    echo "❌ Decommit request failed (HTTP $HTTP_CODE)"
    echo ""
    echo "Response:"
    echo "$BODY"
    echo ""
    echo "Debugging info:"
    echo "  UTxO: $UTXO_REF"
    echo "  Amount: $LOVELACE"
    echo "  Destination: $FINAL_DEST_ADDR"
    echo ""
    echo "Transaction:"
    cat /tmp/${PARTICIPANT}-decommit-signed.json | jq '.'
    echo ""
    echo "Possible causes:"
    echo "  1. Hydra version doesn't support decommit (need 0.13.0+)"
    echo "  2. Another decommit is in progress"
    echo "  3. Head is not in Open state"
    echo ""
    echo "Check Hydra logs:"
    echo "  tail -100 $PROJECT_DIR/hydra-${PARTICIPANT}.log"
    
    rm -f /tmp/${PARTICIPANT}-*.json
    exit 1
fi

echo "✅ Decommit request submitted successfully"

if [ -n "$BODY" ] && [ "$BODY" != "" ]; then
    echo ""
    echo "Response:"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
fi

# Cleanup
rm -f /tmp/${PARTICIPANT}-*.json

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Decommit submitted"
echo "═══════════════════════════════════════════════════════════════"
echo "Amount: $ADA ADA"
echo "Destination: $FINAL_DEST_ADDR"
echo ""
echo "Monitor WebSocket for DecommitFinalized event"
