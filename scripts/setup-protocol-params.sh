#!/bin/bash
# Setup protocol parameters with zero fees for Hydra

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Querying Cardano protocol parameters..."

cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  | jq '.txFeeFixed = 0 | .txFeePerByte = 0 | .executionUnitPrices.priceMemory = 0 | .executionUnitPrices.priceSteps = 0' \
  > "$PROJECT_DIR/protocol-parameters.json"

echo "✓ Protocol parameters saved to: $PROJECT_DIR/protocol-parameters.json"
echo ""
echo "Fees configured to zero for Hydra transactions"
