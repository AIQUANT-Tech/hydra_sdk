#!/bin/bash
# Check wallet balance

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <address-file-path>"
  echo "Example: $0 credentials/alice/alice-funds.addr"
  exit 1
fi

ADDRESS_FILE=$1

if [ ! -f "$ADDRESS_FILE" ]; then
    echo "Error: Address file not found: $ADDRESS_FILE"
    exit 1
fi

ADDRESS=$(cat "$ADDRESS_FILE")

echo "Address: $ADDRESS"
echo ""

cardano-cli query utxo \
  --address "$ADDRESS" \
  --testnet-magic 1
