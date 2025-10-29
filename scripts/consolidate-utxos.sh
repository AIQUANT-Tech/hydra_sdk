
#!/usr/bin/env bash

# Script to consolidate all UTxOs from a Cardano address into a single UTxO
# Usage: ./consolidate-utxos.sh <credentials-path>
# Example: ./consolidate-utxos.sh credentials/alice/alice-funds

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path-to-credential-without-extension>"
  echo "Example: $0 credentials/alice/alice-funds"
  echo "Example: $0 credentials/bob/bob-node"
  exit 1
fi

CREDENTIAL_PATH=$1
ADDRESS="${CREDENTIAL_PATH}.addr"
SKEY="${CREDENTIAL_PATH}.sk"

# Check if files exist
if [ ! -f "$ADDRESS" ]; then
  echo "Error: Address file not found: $ADDRESS"
  exit 1
fi

if [ ! -f "$SKEY" ]; then
  echo "Error: Signing key file not found: $SKEY"
  exit 1
fi

ADDR=$(cat "$ADDRESS")
echo "Address: $ADDR"
echo ""

# Query UTxOs
echo "Querying UTxOs..."
UTXO_JSON=$(cardano-cli query utxo --address "$ADDR" --testnet-magic 1 --out-file /dev/stdout)

# Parse UTxOs and build transaction inputs
UTXO_LIST=""
TOTAL_LOVELACE=0
UTXO_COUNT=0

while IFS= read -r line; do
  # Skip header lines
  if [[ "$line" == "TxHash"* ]] || [[ "$line" == "---"* ]] || [[ -z "$line" ]]; then
    continue
  fi

  TXHASH=$(echo "$line" | awk '{print $1}')
  TXIX=$(echo "$line" | awk '{print $2}')
  LOVELACE=$(echo "$line" | awk '{print $3}')

  if [ ! -z "$TXHASH" ] && [ "$TXHASH" != "TxHash" ]; then
    UTXO_LIST="${UTXO_LIST} --tx-in ${TXHASH}#${TXIX}"
    TOTAL_LOVELACE=$((TOTAL_LOVELACE + LOVELACE))
    UTXO_COUNT=$((UTXO_COUNT + 1))
  fi
done < <(cardano-cli query utxo --address "$ADDR" --testnet-magic 1)

if [ $UTXO_COUNT -eq 0 ]; then
  echo "Error: No UTxOs found at address"
  exit 1
fi

echo "Found $UTXO_COUNT UTxO(s) with total: $TOTAL_LOVELACE lovelace"
echo ""

# Create temporary files
TMP_RAW=$(mktemp)
TMP_SIG=$(mktemp)

# Get protocol parameters if not exists
if [ ! -f "protocol.json" ]; then
  echo "Downloading protocol parameters..."
  cardano-cli query protocol-parameters --testnet-magic 1 --out-file protocol.json
fi

# Build raw transaction to calculate fee
cardano-cli latest transaction build-raw \
    ${UTXO_LIST} \
    --tx-out "$ADDR+${TOTAL_LOVELACE}" \
    --fee 0 \
    --out-file "$TMP_RAW"

FEE=$(cardano-cli latest transaction calculate-min-fee \
    --tx-body-file "$TMP_RAW" \
    --tx-in-count ${UTXO_COUNT} \
    --tx-out-count 1 \
    --testnet-magic 1 \
    --witness-count 1 \
    --protocol-params-file protocol.json | awk '{print $1}')

TOTAL_LOVELACE_TO_SEND=$((TOTAL_LOVELACE - FEE))

echo ""
echo "*******************************************************************************************"
echo "Building transaction..."
echo "  Input UTxOs: $UTXO_COUNT"
echo "  Total Input: $TOTAL_LOVELACE lovelace ($(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE/1000000}") ADA)"
echo "  Fee: $FEE lovelace ($(awk "BEGIN {printf \"%.6f\", $FEE/1000000}") ADA)"
echo "  Output: $TOTAL_LOVELACE_TO_SEND lovelace ($(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE_TO_SEND/1000000}") ADA)"
echo "*******************************************************************************************"
sleep 1

# Build final raw transaction with correct fee
cardano-cli latest transaction build-raw \
    ${UTXO_LIST} \
    --tx-out "$ADDR+$TOTAL_LOVELACE_TO_SEND" \
    --fee "$FEE" \
    --out-file "$TMP_RAW"

echo "*******************************************************************************************"
echo "Signing transaction..."
echo "*******************************************************************************************"
sleep 1

# Sign the transaction
cardano-cli latest transaction sign \
    --signing-key-file "$SKEY" \
    --testnet-magic 1 \
    --tx-body-file "$TMP_RAW" \
    --out-file "$TMP_SIG"

echo "*******************************************************************************************"
echo "Submitting transaction..."
echo "*******************************************************************************************"
sleep 1

# Submit the transaction
cardano-cli latest transaction submit \
    --testnet-magic 1 \
    --tx-file "$TMP_SIG"

TX_ID=$(cardano-cli latest transaction txid --tx-file "$TMP_SIG")
echo ""
echo "✅ Transaction successful!"
echo "Transaction ID: $TX_ID"
echo "CardanoScan: https://preprod.cardanoscan.io/transaction/$TX_ID"
echo ""
echo "Consolidated all UTxOs into 1 UTxO at: $ADDR"

# Cleanup
rm -f "$TMP_RAW" "$TMP_SIG"