# Cardano Node + Mithril Installation Guide

## Quick Start

Run this command:

```bash
cd scripts
chmod +x install-cardano-node.sh
./install-cardano-node.sh
```

## What Gets Installed

1. **Mithril Client** - For fast blockchain synchronization
2. **Cardano Node** - Full Cardano blockchain node
3. **Cardano CLI** - Command-line interface for Cardano
4. **Preprod Config Files** - Network configuration for testnet
5. **Blockchain Database** - Downloaded via Mithril snapshot (~20GB)

## Installation Directory Structure

```
$HOME/cardano-node/
├── bin/
│   ├── mithril-client
│   ├── cardano-node
│   └── cardano-cli
├── preprod/
│   ├── config.json
│   ├── topology.json
│   ├── byron-genesis.json
│   ├── shelley-genesis.json
│   ├── alonzo-genesis.json
│   ├── conway-genesis.json
│   ├── node.socket
│   └── db/              # Blockchain database (~20GB)
└── start-node.sh        # Node startup script
```

## Post-Installation Steps

### 1. Reload Shell Configuration

```bash
source ~/.bashrc    # or source ~/.zshrc for Zsh
```

### 2. Verify Installation

```bash
mithril-client --version
cardano-node --version
cardano-cli --version
```

### 3. Start the Node

**Option A: Using the generated script**

```bash
cd ~/cardano-node
./start-node.sh
```

**Option B: Manual command**

```bash
cardano-node run \
  --topology ~/cardano-node/preprod/topology.json \
  --database-path ~/cardano-node/preprod/db \
  --socket-path ~/cardano-node/preprod/node.socket \
  --config ~/cardano-node/preprod/config.json
```

**Keep this terminal running!**

### 4. Check Sync Status

**In a new terminal:**

```bash
export CARDANO_NODE_SOCKET_PATH=~/cardano-node/preprod/node.socket
cardano-cli query tip --testnet-magic 1
```

Wait until `"syncProgress": "100.00"`

Expected output:

```json
{
  "block": 4040143,
  "epoch": 248,
  "era": "Conway",
  "syncProgress": "100.00"
}
```

## Mithril Fast Sync Benefits

| Method               | Time          | Disk I/O  | Network |
| -------------------- | ------------- | --------- | ------- |
| **Traditional Sync** | 2-7 days      | Very High | High    |
| **Mithril Snapshot** | 10-30 minutes | Low       | Medium  |

Mithril reduces sync time by **99%+** by downloading certified blockchain snapshots.

## Environment Variables

Automatically set in your `~/.bashrc`:

```bash
export PATH="$HOME/cardano-node/bin:$PATH"
export CARDANO_NODE_SOCKET_PATH="$HOME/cardano-node/preprod/node.socket"
```

For Mithril (used during installation):

```bash
export GENESIS_VERIFICATION_KEY=$(curl -s https://raw.githubusercontent.com/input-output-hk/mithril/main/mithril-infra/configuration/release-preprod/genesis.vkey)
export AGGREGATOR_ENDPOINT=https://aggregator.release-preprod.api.mithril.network/aggregator
```

## Troubleshooting

### Issue: "cardano-cli: command not found"

**Solution:**

```bash
source ~/.bashrc
# or
export PATH="$HOME/cardano-node/bin:$PATH"
```

### Issue: "Cannot find socket file"

**Solution:**

```bash
export CARDANO_NODE_SOCKET_PATH=~/cardano-node/preprod/node.socket
```

### Issue: Database corruption

**Solution:**

```bash
rm -rf ~/cardano-node/preprod/db
cd ~/cardano-node/preprod
mithril-client cardano-db download latest
```

### Issue: Node not syncing

**Check:**

- Node is running
- Internet connection stable
- Enough disk space (50GB+ free)

## Commands Reference

### Query Blockchain Tip

```bash
cardano-cli query tip --testnet-magic 1
```

### Query Address Balance

```bash
cardano-cli query utxo \
  --address addr_test1... \
  --testnet-magic 1
```

### Check Protocol Parameters

```bash
cardano-cli query protocol-parameters \
  --testnet-magic 1 \
  --out-file protocol.json
```

### List Mithril Snapshots

```bash
mithril-client cardano-db snapshot list
```

### Download Latest Snapshot

```bash
cd ~/cardano-node/preprod
mithril-client cardano-db download latest
```

## System Requirements

- **OS:** Ubuntu 20.04+ or similar Linux distribution
- **RAM:** 8GB minimum, 16GB recommended
- **Disk:** 50GB free space
- **Network:** Stable broadband connection
- **CPU:** 2+ cores recommended

## For Hydra Head Protocol

After node is fully synced, you can use it with Hydra:

```bash
export CARDANO_NODE_SOCKET_PATH=~/cardano-node/preprod/node.socket

# Start Hydra node
hydra-node \
  --node-socket $CARDANO_NODE_SOCKET_PATH \
  --testnet-magic 1 \
  # ... other Hydra parameters
```

## Uninstall

To completely remove:

```bash
rm -rf ~/cardano-node
# Remove from ~/.bashrc:
nano ~/.bashrc  # Delete the Cardano Node Path section
source ~/.bashrc
```

## Resources

- **Cardano Docs:** https://docs.cardano.org
- **Mithril Docs:** https://mithril.network/doc
- **Hydra Docs:** https://hydra.family/head-protocol/docs
- **Cardano Explorer (Preprod):** https://preprod.cardanoscan.io

---

**Installation Script Version:** 1.0  
**Date:** October 24, 2025  
**Tested On:** Ubuntu 20.04, Cardano Node 10.1.3, Mithril latest
