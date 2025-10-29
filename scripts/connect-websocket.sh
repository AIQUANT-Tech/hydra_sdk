#!/bin/bash
# Connect to Hydra node WebSocket

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <participant>"
    echo "Example: $0 platform"
    exit 1
fi

PARTICIPANT=$1

case $PARTICIPANT in
    platform)
        PORT=4001
        ;;
    platform-peer)
        PORT=4002
        ;;
    *)
        echo "Error: Unsupported participant: $PARTICIPANT"
        echo "Supported: platform, platform-peer"
        exit 1
        ;;
esac

echo "Connecting to $PARTICIPANT Hydra node WebSocket..."
echo "Port: $PORT"
echo ""
echo "Commands you can use:"
echo "  {\"tag\":\"Init\"}     - Initialize Hydra Head"
echo "  {\"tag\":\"Close\"}    - Close Hydra Head"
echo "  {\"tag\":\"Fanout\"}   - Distribute funds after close"
echo ""

websocat ws://127.0.0.1:$PORT
