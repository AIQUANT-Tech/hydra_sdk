#!/bin/bash
# Start BOTH platform Hydra nodes (platform + platform-peer)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║         Starting Platform Hydra Infrastructure (2 Nodes)               ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
if [ -z "$CARDANO_NODE_SOCKET_PATH" ]; then
    echo "❌ CARDANO_NODE_SOCKET_PATH not set"
    exit 1
fi

# Function to start a node
start_node() {
    local PARTICIPANT=$1
    local API_PORT=$2
    local LISTEN_PORT=$3
    local PEER_PORT=$4
    local PEER_NAME=$5
    
    if lsof -Pi :$API_PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "✅ $PARTICIPANT already running on port $API_PORT"
        return 0
    fi
    
    echo "🚀 Starting $PARTICIPANT..."
    
    CRED_DIR="$PROJECT_DIR/credentials/$PARTICIPANT"
    PEER_CRED_DIR="$PROJECT_DIR/credentials/$PEER_NAME"
    PERSISTENCE_DIR="$PROJECT_DIR/persistence-$PARTICIPANT"
    
    # Create persistence directory only if it doesn't exist (preserve existing state)
    if [ ! -d "$PERSISTENCE_DIR" ]; then
        echo "   📁 Creating new persistence directory"
        mkdir -p "$PERSISTENCE_DIR"
    else
        echo "   ♻️  Using existing persistence directory (state preserved)"
    fi
    
    nohup hydra-node \
      --node-id ${PARTICIPANT}-node \
      --persistence-dir "$PERSISTENCE_DIR" \
      --cardano-signing-key "$CRED_DIR/${PARTICIPANT}-node.sk" \
      --hydra-signing-key "$CRED_DIR/${PARTICIPANT}-hydra.sk" \
      --network preprod \
      --ledger-protocol-parameters "$PROJECT_DIR/protocol-parameters.json" \
      --testnet-magic 1 \
      --node-socket "$CARDANO_NODE_SOCKET_PATH" \
      --api-port $API_PORT \
      --listen 127.0.0.1:$LISTEN_PORT \
      --api-host 127.0.0.1 \
      --peer 127.0.0.1:$PEER_PORT \
      --hydra-verification-key "$PEER_CRED_DIR/${PEER_NAME}-hydra.vk" \
      --cardano-verification-key "$PEER_CRED_DIR/${PEER_NAME}-node.vk" \
      --contestation-period 60s \
      > "$PROJECT_DIR/hydra-${PARTICIPANT}.log" 2>&1 &
    
    local PID=$!
    echo "   PID: $PID"
    echo $PID > "$PROJECT_DIR/.hydra-${PARTICIPANT}.pid"
}

# Start both nodes
start_node "platform" 4001 5001 5002 "platform-peer"
sleep 2
start_node "platform-peer" 4002 5002 5001 "platform"

echo ""
echo "⏳ Waiting for nodes to be ready..."
sleep 3

# Verify both are running
PLATFORM_OK=false
PEER_OK=false

for i in {1..20}; do
    if curl -s http://127.0.0.1:4001/snapshot/utxo >/dev/null 2>&1; then
        PLATFORM_OK=true
    fi
    if curl -s http://127.0.0.1:4002/snapshot/utxo >/dev/null 2>&1; then
        PEER_OK=true
    fi
    
    if [ "$PLATFORM_OK" = true ] && [ "$PEER_OK" = true ]; then
        break
    fi
    sleep 1
done

echo ""
if [ "$PLATFORM_OK" = true ] && [ "$PEER_OK" = true ]; then
    echo "╔════════════════════════════════════════════════════════════════════════╗"
    echo "║              Platform Hydra Infrastructure Started!                    ║"
    echo "╚════════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Platform Node:     http://127.0.0.1:4001 (WebSocket: ws://127.0.0.1:4001)"
    echo "Platform-Peer:     http://127.0.0.1:4002 (WebSocket: ws://127.0.0.1:4002)"
    echo ""
    echo "💾 Persistence directories preserved for state recovery"
    exit 0
else
    echo "❌ Failed to start one or both nodes"
    [ "$PLATFORM_OK" = false ] && echo "   Platform node failed"
    [ "$PEER_OK" = false ] && echo "   Platform-peer node failed"
    exit 1
fi

