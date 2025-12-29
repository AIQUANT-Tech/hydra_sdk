#!/bin/bash
# Check all prerequisites before starting gateway

set -e

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║              Hydra Gateway Pre-Flight Check                            ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0

# 1. Check Cardano Node
echo "1. Checking Cardano Node..."
if [ -z "$CARDANO_NODE_SOCKET_PATH" ]; then
    echo "   ❌ CARDANO_NODE_SOCKET_PATH not set"
    ERRORS=$((ERRORS + 1))
elif [ ! -S "$CARDANO_NODE_SOCKET_PATH" ]; then
    echo "   ❌ Cardano node socket not found: $CARDANO_NODE_SOCKET_PATH"
    echo "      Start cardano-node first"
    ERRORS=$((ERRORS + 1))
else
    if cardano-cli query tip --testnet-magic 1 >/dev/null 2>&1; then
        echo "   ✅ Cardano node is running"
    else
        echo "   ❌ Cardano node not responding"
        ERRORS=$((ERRORS + 1))
    fi
fi

# 2. Check Hydra Node
echo ""
echo "2. Checking Hydra Node..."
if curl -s http://127.0.0.1:4001/snapshot/utxo >/dev/null 2>&1; then
    echo "   ✅ Hydra node is running"
else
    echo "   ⚠️  Hydra node not running, will start automatically"
fi

# 3. Check Platform Credentials
echo ""
echo "3. Checking Platform Credentials..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CRED_DIR="$PROJECT_DIR/credentials/platform"

if [ -f "$CRED_DIR/platform-hydra.sk" ] && [ -f "$CRED_DIR/platform-funds.sk" ]; then
    echo "   ✅ Platform credentials found"
else
    echo "   ❌ Platform credentials missing"
    echo "      Run: cd bash && ./generate-keys.sh platform"
    ERRORS=$((ERRORS + 1))
fi

# 4. Check MySQL
echo ""
echo "4. Checking MySQL Database..."
if command -v mysql >/dev/null 2>&1; then
    echo "   ✅ MySQL client installed"
else
    echo "   ⚠️  MySQL client not found (optional for now)"
fi

# 5. Check Node.js Dependencies
echo ""
echo "5. Checking Node.js Dependencies..."
if [ -d "$PROJECT_DIR/node_modules" ]; then
    echo "   ✅ Node modules installed"
else
    echo "   ❌ Node modules not installed"
    echo "      Run: npm install"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "════════════════════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed! Ready to start."
    exit 0
else
    echo "❌ $ERRORS error(s) found. Fix them before starting."
    exit 1
fi
