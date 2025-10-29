#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║           Hydra Gateway Environment Verification                      ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

PROJECT_ROOT="$HOME/Work/hydra-gateway"
cd "$PROJECT_ROOT" || exit 1

# Check .env file
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "   Copy .env.example to .env and configure it"
    exit 1
fi

echo "✅ .env file found"
echo ""

# Load .env
export $(grep -v '^#' .env | xargs)

echo "1. Server Configuration:"
echo "   PORT: $PORT"
echo "   NODE_ENV: $NODE_ENV"
echo ""

echo "2. Cardano Node:"
if [ -S "$CARDANO_NODE_SOCKET_PATH" ]; then
    echo "   ✅ Socket exists: $CARDANO_NODE_SOCKET_PATH"
else
    echo "   ❌ Socket not found: $CARDANO_NODE_SOCKET_PATH"
fi
echo ""

echo "3. Platform Credentials:"
KEYS=(
    "PLATFORM_HYDRA_SIGNING_KEY"
    "PLATFORM_CARDANO_SIGNING_KEY"
    "PLATFORM_CARDANO_ADDRESS"
    "PLATFORM_NODE_SIGNING_KEY"
)

for key in "${KEYS[@]}"; do
    path="${!key}"
    if [ -f "$path" ]; then
        echo "   ✅ $key"
    else
        echo "   ❌ $key: $path not found"
    fi
done
echo ""

echo "4. Platform Addresses:"
if [ -f "$PLATFORM_CARDANO_ADDRESS" ]; then
    echo "   Funds Address: $(cat $PLATFORM_CARDANO_ADDRESS)"
fi
if [ -f "$PLATFORM_NODE_ADDRESS" ]; then
    echo "   Node Address: $(cat $PLATFORM_NODE_ADDRESS)"
fi
echo ""

echo "5. Database Connection:"
if command -v mysql &> /dev/null; then
    if mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" -e "USE $DB_NAME" 2>/dev/null; then
        echo "   ✅ Database '$DB_NAME' accessible"
    else
        echo "   ⚠️  Database '$DB_NAME' not accessible (will be created)"
    fi
else
    echo "   ⚠️  MySQL client not installed"
fi
echo ""

echo "6. Hydra Node Connection:"
if curl -s http://$HYDRA_API_HOST:$HYDRA_API_PORT/snapshot/utxo &>/dev/null; then
    echo "   ✅ Hydra API accessible at $HYDRA_API_HOST:$HYDRA_API_PORT"
else
    echo "   ❌ Hydra node not running"
    echo "      Start with: cd ../hydra/scripts && ./start-hydra-node.sh platform bob"
fi
echo ""

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                    Verification Complete                               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
