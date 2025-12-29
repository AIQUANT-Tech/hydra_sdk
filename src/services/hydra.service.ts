import WebSocket from "ws";
import { EventEmitter } from "events";
import { exec, spawn } from "child_process";

interface HydraNode {
  name: string;
  wsUrl: string;
  ws: WebSocket | null;
  reconnectAttempts: number;
}

export class HydraService extends EventEmitter {
  private nodes: Map<string, HydraNode> = new Map();
  private maxReconnectAttempts = 5;

  // ✅ REQUIRED for smart contracts & DEX
  private headUtxo: Map<string, any> = new Map();

  private transactionHistory: any[] = [];

  constructor(platformWsUrl: string, platformPeerWsUrl: string) {
    super();

    this.nodes.set("platform", {
      name: "platform",
      wsUrl: platformWsUrl,
      ws: null,
      reconnectAttempts: 0,
    });

    this.nodes.set("platform-peer", {
      name: "platform-peer",
      wsUrl: platformPeerWsUrl,
      ws: null,
      reconnectAttempts: 0,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Connection logic                                                    */
  /* ------------------------------------------------------------------ */

  connect(): void {
    this.nodes.forEach((node) => this.connectNode(node));
  }

  private connectNode(node: HydraNode): void {
    console.log(`🔌 Connecting to ${node.name} at ${node.wsUrl}...`);
    node.ws = new WebSocket(node.wsUrl);

    node.ws.on("open", () => {
      console.log(`✅ Connected to Hydra node: ${node.name}`);
      node.reconnectAttempts = 0;
      this.emit("connected", { node: node.name });

      // ✅ ask for current UTxO immediately
      this.requestUtxo(node.name);
    });

    node.ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, node.name);
      } catch (err) {
        console.error(`Failed to parse message from ${node.name}`, err);
      }
    });

    node.ws.on("close", () => {
      console.warn(`⚠️ ${node.name} WebSocket closed`);
      this.reconnectNode(node);
    });

    node.ws.on("error", (err) => {
      console.error(`${node.name} WebSocket error`, err);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Hydra message handling                                              */
  /* ------------------------------------------------------------------ */

  private handleMessage(message: any, nodeName: string): void {
    console.log(`[${nodeName}] Hydra event: ${message.tag}`);

    switch (message.tag) {
      case "Greetings":
        this.emit("greetings", { ...message, node: nodeName });
        break;

      case "HeadIsOpen":
        this.emit("head-open", { ...message, node: nodeName });
        break;

      case "SnapshotConfirmed":
        // ✅ snapshot contains UTxO diff
        this.applySnapshot(message.snapshot?.utxo);
        this.emit("snapshot-confirmed", { ...message, node: nodeName });
        break;

      case "GetUTxOResponse":
        this.replaceUtxo(message.utxo);
        break;

      case "TxValid":
        this.transactionHistory.push({
          timestamp: new Date().toISOString(),
          txId: message.transaction?.txId,
          status: "valid",
          node: nodeName,
        });

        this.emit("tx-valid", message);
        break;

      case "TxInvalid":
        // 🔴 VERY IMPORTANT FOR SCRIPT DEBUGGING
        this.transactionHistory.push({
          timestamp: new Date().toISOString(),
          txId: message.transaction?.txId,
          status: "invalid",
          reason: message.validationError,
          node: nodeName,
        });

        console.error("❌ TxInvalid:", message.validationError);
        this.emit("tx-invalid", message);
        break;

      case "HeadIsClosed":
        this.emit("head-closed", message);
        break;

      case "ReadyToFanout":
        this.emit("ready-fanout", message);
        break;

      default:
        this.emit("message", message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* UTxO management (CRITICAL FOR DEX)                                  */
  /* ------------------------------------------------------------------ */

  private replaceUtxo(utxo: Record<string, any>): void {
    this.headUtxo.clear();
    Object.entries(utxo).forEach(([key, value]) => {
      this.headUtxo.set(key, value);
    });
  }

  private applySnapshot(diff: Record<string, any>): void {
    if (!diff) return;

    Object.entries(diff).forEach(([key, value]) => {
      if (value === null) {
        this.headUtxo.delete(key);
      } else {
        this.headUtxo.set(key, value);
      }
    });
  }

  getHeadUtxo(): Record<string, any> {
    return Object.fromEntries(this.headUtxo.entries());
  }

  requestUtxo(nodeName: string): void {
    this.sendCommandToNode(nodeName, { tag: "GetUTxO" });
  }

  /* ------------------------------------------------------------------ */
  /* Transaction submission                                             */
  /* ------------------------------------------------------------------ */

  sendCommandToNode(nodeName: string, command: any): void {
    const node = this.nodes.get(nodeName);
    if (!node || !node.ws || node.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Node ${nodeName} not connected`);
    }

    node.ws.send(JSON.stringify(command));
  }

  submitTransaction(cborHex: string, sender: string): void {
    this.sendCommandToNode(sender, {
      tag: "NewTx",
      transaction: {
        cborHex,
        description: "",
        type: "Tx ConwayEra",
      },
    });
  }

  // ✅ semantic alias for smart contracts
  submitScriptTx(cborHex: string, sender: string): void {
    this.submitTransaction(cborHex, sender);
  }

  /* ------------------------------------------------------------------ */
  /* Head lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  initHead(): void {
    this.sendCommandToNode("platform", { tag: "Init" });
  }

  closeHead(): void {
    this.sendCommandToNode("platform", { tag: "Close" });
  }

  fanout(): void {
    this.sendCommandToNode("platform", { tag: "Fanout" });
  }

  /* ------------------------------------------------------------------ */
  /* Utilities                                                          */
  /* ------------------------------------------------------------------ */

  getTransactionHistory(): any[] {
    return this.transactionHistory;
  }

  getNodeStatus(): any[] {
    return Array.from(this.nodes.values()).map((n) => ({
      name: n.name,
      connected: n.ws?.readyState === WebSocket.OPEN,
      reconnectAttempts: n.reconnectAttempts,
    }));
  }

  async commitScriptUtxo() {
    try {
      // 1. Lock script on L1
      await this.run("bash bash/lock-script-utxo.sh");

      // 2. Build blueprint
      await this.run("bash bash/build-script-blueprint.sh");

      // 3. Platform commits script UTxO
      console.log("1. Committing script utxo...");
      await this.run("bash bash/commit-script-utxo.sh 4001");

      // Commit platform
      console.log("2. Committing platform-peer...");
      await this.run("bash bash/commit-funds.sh platform-peer 4002");
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private run(cmd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`\n▶️ Executing: ${cmd}`);

      const child = spawn("bash", ["-lc", cmd], {
        stdio: ["inherit", "pipe", "pipe"],
      });

      child.stdout.on("data", (data) => {
        process.stdout.write(`[bash] ${data}`);
      });

      child.stderr.on("data", (data) => {
        process.stderr.write(`[bash][err] ${data}`);
      });

      child.on("close", (code) => {
        if (code === 0) {
          console.log(`✅ Command finished: ${cmd}`);
          resolve();
        } else {
          reject(new Error(`❌ Command failed (${code}): ${cmd}`));
        }
      });
    });
  }

  private reconnectNode(node: HydraNode): void {
    if (node.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnect attempts reached for ${node.name}`);
      return;
    }

    node.reconnectAttempts++;
    setTimeout(() => this.connectNode(node), 5000);
  }

  disconnect(): void {
    this.nodes.forEach((node) => node.ws?.close());
  }
}

export default HydraService;
