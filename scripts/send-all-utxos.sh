#!/usr/bin/env bash

# Script to send all UTxOs from one address to another address
# Usage: ./send-all-utxos.sh <source-credentials-path> <destination-address>

set -e  # Exit on error

# Color codes for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ "$#" -ne 2 ]; then
  echo -e "${RED}Usage: $0 <source-credentials-path> <destination-address>${NC}"
  echo ""
  echo "Examples:"
  echo "  $0 credentials/alice/alice-funds addr_test1vzt2qhe09vqaq6q6jdxf93trepxxs3ul24reftlg27s0wjczplx0j"
  echo "  $0 credentials/bob/bob-node addr_test1vq7tww9ffm24z2djypakm27wv0fhdhy6r0zkwjvr0tppqncknnpdt"
  exit 1
fi

SOURCE_CREDENTIAL=$1
DESTINATION_ADDR=$2

SOURCE_ADDR_FILE="${SOURCE_CREDENTIAL}.addr"
SOURCE_SKEY="${SOURCE_CREDENTIAL}.sk"

# Validate source files exist
if [ ! -f "$SOURCE_ADDR_FILE" ]; then
  echo -e "${RED}Error: Source address file not found: $SOURCE_ADDR_FILE${NC}"
  exit 1
fi

if [ ! -f "$SOURCE_SKEY" ]; then
  echo -e "${RED}Error: Source signing key file not found: $SOURCE_SKEY${NC}"
  exit 1
fi

SOURCE_ADDR=$(cat "$SOURCE_ADDR_FILE")

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║               SEND ALL UTXOs TO ANOTHER ADDRESS                        ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${YELLOW}Source Address:${NC}"
echo "  $SOURCE_ADDR"
echo ""
echo -e "${YELLOW}Destination Address:${NC}"
echo "  $DESTINATION_ADDR"
echo ""

# Confirm addresses are different
if [ "$SOURCE_ADDR" == "$DESTINATION_ADDR" ]; then
  echo -e "${RED}Error: Source and destination addresses are the same!${NC}"
  echo "Use ./consolidate-utxos.sh if you want to consolidate to the same address."
  exit 1
fi

# Query UTxOs
echo -e "${YELLOW}Querying UTxOs...${NC}"
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
done < <(cardano-cli query utxo --address "$SOURCE_ADDR" --testnet-magic 1)

if [ $UTXO_COUNT -eq 0 ]; then
  echo -e "${RED}Error: No UTxOs found at source address${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Found $UTXO_COUNT UTxO(s) with total: $TOTAL_LOVELACE lovelace ($(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE/1000000}") ADA)${NC}"
echo ""

# Confirmation prompt
echo -e "${YELLOW}⚠️  You are about to send ALL UTxOs from source to destination!${NC}"
echo -n "Are you sure you want to continue? (yes/no): "
read CONFIRMATION

if [ "$CONFIRMATION" != "yes" ]; then
  echo -e "${RED}Transaction cancelled by user.${NC}"
  exit 0
fi

echo ""

# Create temporary files
TMP_RAW=$(mktemp)
TMP_SIG=$(mktemp)

# Get protocol parameters if not exists
if [ ! -f "protocol.json" ]; then
  echo -e "${YELLOW}Downloading protocol parameters...${NC}"
  cardano-cli query protocol-parameters --testnet-magic 1 --out-file protocol.json
fi

# Build raw transaction to calculate fee
cardano-cli latest transaction build-raw \
    ${UTXO_LIST} \
    --tx-out "$DESTINATION_ADDR+${TOTAL_LOVELACE}" \
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
echo -e "${GREEN}Building transaction...${NC}"
echo "*******************************************************************************************"
echo "  Input UTxOs: $UTXO_COUNT"
echo "  Total Input: $TOTAL_LOVELACE lovelace ($(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE/1000000}") ADA)"
echo "  Fee: $FEE lovelace ($(awk "BEGIN {printf \"%.6f\", $FEE/1000000}") ADA)"
echo "  Amount to Send: $TOTAL_LOVELACE_TO_SEND lovelace ($(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE_TO_SEND/1000000}") ADA)"
echo "*******************************************************************************************"
sleep 1

# Build final raw transaction with correct fee
cardano-cli latest transaction build-raw \
    ${UTXO_LIST} \
    --tx-out "$DESTINATION_ADDR+$TOTAL_LOVELACE_TO_SEND" \
    --fee "$FEE" \
    --out-file "$TMP_RAW"

echo ""
echo "*******************************************************************************************"
echo -e "${GREEN}Signing transaction...${NC}"
echo "*******************************************************************************************"
sleep 1

# Sign the transaction
cardano-cli latest transaction sign \
    --signing-key-file "$SOURCE_SKEY" \
    --testnet-magic 1 \
    --tx-body-file "$TMP_RAW" \
    --out-file "$TMP_SIG"

echo ""
echo "*******************************************************************************************"
echo -e "${GREEN}Submitting transaction...${NC}"
echo "*******************************************************************************************"
sleep 1

# Submit the transaction
cardano-cli latest transaction submit \
    --testnet-magic 1 \
    --tx-file "$TMP_SIG"

TX_ID=$(cardano-cli latest transaction txid --tx-file "$TMP_SIG")

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}✅ TRANSACTION SUCCESSFUL!${NC}                                          ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}Transaction ID:${NC}"
echo "  $TX_ID"
echo ""
echo -e "${GREEN}CardanoScan:${NC}"
echo "  https://preprod.cardanoscan.io/transaction/$TX_ID"
echo ""
echo -e "${GREEN}Summary:${NC}"
echo "  • Sent: $(awk "BEGIN {printf \"%.6f\", $TOTAL_LOVELACE_TO_SEND/1000000}") ADA"
echo "  • Fee: $(awk "BEGIN {printf \"%.6f\", $FEE/1000000}") ADA"
echo "  • From: $SOURCE_ADDR"
echo "  • To: $DESTINATION_ADDR"
echo ""

# Cleanup
rm -f "$TMP_RAW" "$TMP_SIG"
