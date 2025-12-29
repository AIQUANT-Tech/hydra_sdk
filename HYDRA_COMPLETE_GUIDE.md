# Hydra Head Protocol - Complete Installation & Usage Guide

## 📖 Table of Contents

1. [Quick Start](#-quick-start)
2. [Installation Directory Structure](#-installation-directory-structure)
3. [Prerequisites](#-prerequisites)
4. [Step 1: Generate Keys](#-step-1-generate-keys)
5. [Step 2: Fund Addresses](#-step-2-fund-addresses)
6. [Step 3: Setup Protocol Parameters](#-step-3-setup-protocol-parameters)
7. [Step 4: Start Hydra Nodes](#-step-4-start-hydra-nodes)
8. [Step 5: Initialize Hydra Head](#-step-5-initialize-hydra-head)
9. [Step 6: Commit Funds](#-step-6-commit-funds)
10. [Step 7: Perform Instant Transactions](#-step-7-perform-instant-transactions)
11. [Step 8: Close the Head](#-step-8-close-the-head)
12. [Performance Comparison](#-performance-comparison)
13. [Utility Scripts Reference](#-utility-scripts-reference)
14. [Troubleshooting](#-troubleshooting)
15. [Advanced Usage](#-advanced-usage)
16. [Resources](#-resources)
17. [Security Notes](#-security-notes)
18. [Quick Command Reference](#-quick-command-reference)

---

## 🚀 Quick Start

Install everything with one command:

```bash
cd bash
chmod +x install-hydra.sh
cd ../
./bash/install-hydra.sh
```

Then reload your shell:

```bash
source ~/.bashrc
```

---

## 📁 Installation Directory Structure

```
└── 📁hydra
    └── 📁credentials
        └── 📁alice
            ├── alice-funds.addr
            ├── alice-funds.sk
            ├── alice-funds.vk
            ├── alice-hydra.sk
            ├── alice-hydra.vk
            ├── alice-node.addr
            ├── alice-node.sk
            ├── alice-node.vk
        └── 📁bob
            ├── bob-funds.addr
            ├── bob-funds.sk
            ├── bob-funds.vk
            ├── bob-hydra.sk
            ├── bob-hydra.vk
            ├── bob-node.addr
            ├── bob-node.sk
            ├── bob-node.vk
        └── 📁carol
            ├── carol-funds.addr
            ├── carol-funds.sk
            ├── carol-funds.vk
            ├── carol-hydra.sk
            ├── carol-hydra.vk
            ├── carol-node.addr
            ├── carol-node.sk
            ├── carol-node.vk
    └── 📁bash
        ├── commit-funds.sh
        ├── connect-websocket.sh
        ├── consolidate-utxos.sh
        ├── create-transaction.sh
        ├── generate-keys.sh
        ├── install-cardano-node.sh
        ├── install-hydra.sh
        ├── send-all-utxos.sh
        ├── setup-protocol-params.sh
        ├── start-hydra-node.sh
        ├── wallet-balance.sh
    ├── .gitignore
    ├── CARDANO_INSTALLATION_README.md
    ├── Hydra_Complete_Guide.md
    ├── HYDRA_COMPLETE_GUIDE.md
    └── protocol-parameters.json
```

---

## 📋 Prerequisites

### 1. Cardano Node Must Be Running

Before using Hydra, you need a synced Cardano node. To install look cardano node installation guide readme

---

## 🔑 Step 1: Generate Keys

Generate keys for each participant:

```bash
cd bash
# Generate Alice's keys
./generate-keys.sh alice

# Generate Bob's keys
./generate-keys.sh bob

# Optional: Generate Carol's keys for 3-party head
./generate-keys.sh carol
cd ../
```

Each participant gets:

- Hydra signing & verification keys
- Cardano node signing, verification & address
- Cardano funds signing, verification & address

---

## 💰 Step 2: Fund Addresses

### Get Addresses

```bash
# Alice's addresses
cd bash
cat ../credentials/alice/alice-node.addr    # For transaction fees
cat ../credentials/alice/alice-funds.addr   # To commit to head

# Bob's addresses
cat ../credentials/bob/bob-node.addr
cat ../credentials/bob/bob-funds.addr
cd ../
```

### Request Test ADA

Visit: **https://docs.cardano.org/cardano-testnet/tools/faucet**

Fund each address:

- **Node addresses:** 100 tADA each (for on-chain transaction fees)
- **Funds addresses:** 100 tADA each (amount to commit to Hydra Head)

### Verify Funding

```bash
cd bash
./wallet-balance.sh ../credentials/alice/alice-node.addr
./wallet-balance.sh ../credentials/alice/alice-funds.addr
./wallet-balance.sh ../credentials/bob/bob-node.addr
./wallet-balance.sh ../credentials/bob/bob-funds.addr
cd ../
```

---

## ⚙️ Step 3: Setup Protocol Parameters

Configure zero fees for Hydra transactions:

```bash
cd bash
./setup-protocol-params.sh
cd ../
```

This creates `protocol-parameters.json` with zero transaction fees.

---

## 🚦 Step 4: Start Hydra Nodes

### Terminal 1: Start Alice's Node

```bash
cd bash
./start-hydra-node.sh alice bob
```

**Keep this terminal running!**

### Terminal 2: Start Bob's Node

```bash
cd bash
./start-hydra-node.sh bob alice
```

**Keep this terminal running!**

### Verify Connection

Check both terminals for:

```json
{ "network": { "tag": "PeerConnected", "peer": "bob-node" }, "tag": "Network" }
```

---

## 🌐 Step 5: Initialize Hydra Head

### Terminal 3: Connect to Alice's WebSocket

```bash
cd bash
./connect-websocket.sh alice
```

You'll see:

```json
{"tag":"Greetings","headStatus":"Idle",...}
```

### Terminal 4: Connect to Bob's WebSocket

```bash
cd bash
./connect-websocket.sh bob
```

You'll see:

```json
{"tag":"Greetings","headStatus":"Idle",...}
```

### Initialize the Head

Type in the WebSocket:

```json
{ "tag": "Init" }
```

Press **Enter**. You'll see:

```json
{"tag":"HeadIsInitializing",...}
```

---

## 💸 Step 6: Commit Funds

### Terminal 5: Commit Alice's Funds

```bash
cd bash
./commit-funds.sh alice 4001
cd ../
```

### Terminal 5: Commit Bob's Funds

```bash
cd bash
./commit-funds.sh bob 4002
cd ../
```

### Wait for Head to Open

Watch Terminal 3 (WebSocket). After ~20-40 seconds:

```json
{"tag":"HeadIsOpen","utxo":{...}}
```

🎉 **The Hydra Head is now OPEN!**

---

## ⚡ Step 7: Perform Instant Transactions

### Method 1: Using Helper Script

```bash
# Alice sends 10 ADA to Bob
cd bash
./create-transaction.sh alice bob 10 4001
cd ../
```

Copy the output and paste into Alice's WebSocket (Terminal 3).

```bash
# Bob sends 20 ADA to Alice
cd bash
./create-transaction.sh bob alice 20 4002
cd ../
```

Copy the output and paste into Bob's WebSocket (Terminal 4).

### Method 2: Manual Transaction

```bash

# Get UTxOs
curl -s 127.0.0.1:4001/snapshot/utxo | jq > head-utxo.json

# Select Alice's UTxO
FROM_ADDR=$(cat credentials/alice/alice-funds.addr)
jq "with_entries(select(.value.address == \"$FROM_ADDR\"))" \
  head-utxo.json > alice-utxo.json

# Build transaction (10 ADA to Bob)
LOVELACE=10000000
TX_IN=$(jq -r 'to_entries[0].key' alice-utxo.json)
BALANCE=$(jq -r 'to_entries[0].value.value.lovelace' alice-utxo.json)
CHANGE=$((BALANCE - LOVELACE))

cardano-cli latest transaction build-raw \
  --tx-in "$TX_IN" \
  --tx-out "$(cat credentials/bob/bob-funds.addr)+${LOVELACE}" \
  --tx-out "$(cat credentials/alice/alice-funds.addr)+${CHANGE}" \
  --fee 0 \
  --out-file tx.raw

# Sign
cardano-cli latest transaction sign \
  --tx-body-file tx.raw \
  --signing-key-file credentials/alice/alice-funds.sk \
  --out-file tx.signed

# Extract CBOR and submit via WebSocket
CBOR_HEX=$(jq -r '.cborHex' tx.signed)
echo "{\"tag\":\"NewTx\",\"transaction\":{\"cborHex\":\"$CBOR_HEX\",\"description\":\"\",\"type\":\"Tx ConwayEra\"}}"
```

### Expected Response

Instant confirmation in WebSocket:

```json
{"tag":"TxValid","transactionId":"..."}
{"tag":"SnapshotConfirmed","snapshot":{...}}
```

⚡ **Transaction confirmed in MILLISECONDS with ZERO fees!**

### Verify Balances

```bash
curl -s 127.0.0.1:4001/snapshot/utxo | jq
```

---

## 🔒 Step 8: Close the Head

### Initiate Close

In WebSocket (Terminal 3):

```json
{ "tag": "Close" }
```

You'll see:

```json
{ "tag": "HeadIsClosed", "contestationDeadline": "..." }
```

### Wait for Contestation Period

Default: 600 seconds (10 minutes)

Can be reduced by starting nodes with `--contestation-period 60s`

Watch for:

```json
{ "tag": "ReadyToFanout" }
```

### Fanout (Distribute Funds)

In WebSocket:

```json
{ "tag": "Fanout" }
```

Wait ~20 seconds for on-chain confirmation.

### Verify Final Balances

```bash
cd bash
./wallet-balance.sh ../credentials/alice/alice-funds.addr
./wallet-balance.sh ../credentials/bob/bob-funds.addr
cd ../
```

🎉 **Funds successfully settled back to Cardano Layer 1!**

---

## 📊 Performance Comparison

| Metric               | Cardano L1  | Hydra L2         |
| -------------------- | ----------- | ---------------- |
| **Transaction Time** | 20+ seconds | Milliseconds     |
| **Transaction Fee**  | ~0.17 ADA   | **0 ADA**        |
| **Throughput**       | ~7 tx/s     | Hundreds of tx/s |
| **Finality**         | ~20 seconds | **Instant**      |

---

## 🛠️ Utility Scripts Reference

### Key Generation

```bash
cd bash
./generate-keys.sh <participant-name>
cd ../
```

### Check Balance

```bash
cd bash
./wallet-balance.sh <address-file-path>
```

### Setup Protocol Parameters

```bash
cd bash
./setup-protocol-params.sh
```

### Start Hydra Node

```bash
cd bash
./start-hydra-node.sh <participant> <peer1> [peer2...]
```

### Connect WebSocket

```bash
cd bash
./connect-websocket.sh <participant>
```

### Create Transaction

```bash
cd bash
./create-transaction.sh <from> <to> <amount-ada> <api-port>
```

### Commit Funds

```bash
cd bash
./commit-funds.sh <participant> <api-port>
```

---

## 🔧 Troubleshooting

### Issue: "hydra-node: command not found"

**Solution:**

```bash
source ~/.bashrc
# or
export PATH="$HOME/hydra/bin:$PATH"
```

### Issue: "Cannot connect to Cardano node socket"

**Solution:**

```bash
export CARDANO_NODE_SOCKET_PATH=~/cardano-node/preprod/node.socket
# Verify Cardano node is running
cardano-cli query tip --testnet-magic 1
```

### Issue: Peers not connecting

**Check:**

- Both nodes are running
- Correct peer ports specified
- Firewall not blocking ports 5001, 5002

### Issue: Commit transaction fails

**Check:**

- Address has sufficient funds (100+ ADA)
- Cardano node is synced (100%)
- Protocol parameters file exists

### Issue: Transaction invalid in head

**Check:**

- Using correct addresses (those committed to head)
- Sufficient balance in head
- Transaction properly signed with correct key

---

## 🎯 Advanced Usage

### Reduce Contestation Period

For faster closing (testing only):

```bash
# Terminal 1: Start Alice with 60s contestation period
cd bash
./start-hydra-node.sh alice bob --contestation-period 60s

# Terminal 2: Start Bob with 60s contestation period
cd bash
./start-hydra-node.sh bob alice --contestation-period 60s

```

**Note:** All participants must use the same contestation period!

### 3-Party Hydra Head

```bash
# Generate keys
cd bash
./generate-keys.sh alice
./generate-keys.sh bob
./generate-keys.sh carol

# Start nodes (all three must specify all peers)
./start-hydra-node.sh alice bob carol
./start-hydra-node.sh bob alice carol
./start-hydra-node.sh carol alice bob

# Commit from all three participants
./commit-funds.sh alice 4001
./commit-funds.sh bob 4002
./commit-funds.sh carol 4003
```

---

## 📚 Resources

- **Hydra Documentation:** [https://hydra.family/head-protocol/docs](https://hydra.family/head-protocol/docs)
- **Cardano Testnet Faucet:** [https://docs.cardano.org/cardano-testnet/tools/faucet](https://docs.cardano.org/cardano-testnet/tools/faucet)
- **Hydra GitHub:** [https://github.com/cardano-scaling/hydra](https://github.com/cardano-scaling/hydra)
- **Cardano Developer Portal:** [https://developers.cardano.org](https://developers.cardano.org)

---

## 🔐 Security Notes

- **Private keys** are stored in `~/hydra/credentials/`. Keep them secure!
- **Never share** `.sk` (signing key) files
- Use **testnet only** for learning and development
- For **mainnet**, use hardware wallets and secure key management

---

## 📝 Quick Command Reference

```bash
# Installation
cd bash
./install-hydra.sh

# Setup
./generate-keys.sh alice
./generate-keys.sh bob
./setup-protocol-params.sh

# Start (3 terminals)
./start-hydra-node.sh alice bob           # Terminal 1
./start-hydra-node.sh bob alice           # Terminal 2
./connect-websocket.sh alice              # Terminal 3

# Initialize & Commit (Terminal 4 & 5)
# In WebSocket: {"tag":"Init"}
./commit-funds.sh alice 4001
./commit-funds.sh bob 4002

# Transact
./create-transaction.sh alice bob 10 4001

# Close
# In WebSocket: {"tag":"Close"}
# Wait for ReadyToFanout
# In WebSocket: {"tag":"Fanout"}
```

---

**Version:** 2.0  
**Date:** October 24, 2025  
**Tested On:** Ubuntu 20.04, Cardano Preprod, Hydra 0.22.4
