#!/bin/bash
# Stop only Hydra nodes, NOT cardano-node

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🛑 Stopping Hydra nodes..."

# Stop via PID files
for node in platform platform-peer; do
    PID_FILE="$PROJECT_DIR/.hydra-${node}.pid"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            # Get the process name to verify it's hydra-node
            PROC_NAME=$(ps -p $PID -o comm= 2>/dev/null)
            if [[ "$PROC_NAME" == *"hydra-node"* ]]; then
                if kill $PID 2>/dev/null; then
                    echo "  ✅ Stopped $node (PID: $PID)"
                else
                    echo "  ⚠️  Failed to stop $node (PID: $PID)"
                fi
            else
                echo "  ⚠️  PID $PID is not a hydra-node process, skipping"
            fi
        else
            echo "  ℹ️  Process $node (PID: $PID) not running"
        fi
        rm "$PID_FILE"
    else
        echo "  ℹ️  No PID file found for $node"
    fi
done

# Fallback: kill ONLY hydra-node processes by name (not by port)
# This ensures we don't accidentally kill cardano-node
pkill -f "hydra-node.*platform" 2>/dev/null || true

# Alternative: Kill by ports ONLY if you're sure these are hydra-node ports
# Uncomment if needed, but be careful with port 4001 if cardano-node uses it
# lsof -ti:5001,5002 2>/dev/null | xargs kill -9 2>/dev/null || true

echo "✅ Hydra nodes shutdown complete"
echo "ℹ️  Cardano node is still running"
