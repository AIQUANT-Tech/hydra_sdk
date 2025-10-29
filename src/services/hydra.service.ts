import WebSocket from "ws";
import { EventEmitter } from "events";

export class HydraService extends EventEmitter {
  public ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(wsUrl: string) {
    super();
    this.wsUrl = wsUrl;
  }

  connect(): void {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on("open", () => {
      console.log("✅ Connected to Hydra node");
      this.reconnectAttempts = 0;
      this.emit("connected");
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error("Failed to parse Hydra message:", error);
      }
    });

    this.ws.on("close", () => {
      console.warn("⚠️  Hydra WebSocket closed");
      this.reconnect();
    });

    this.ws.on("error", (error) => {
      console.error("Hydra WebSocket error:", error);
    });
  }

  private handleMessage(message: any): void {
    console.log("Hydra event:", message.tag);

    switch (message.tag) {
      case "Greetings":
        this.emit("greetings", message);
        break;
      case "HeadIsOpen":
        this.emit("head-open", message);
        break;
      case "TxValid":
        this.emit("tx-valid", message);
        break;
      case "SnapshotConfirmed":
        this.emit("snapshot-confirmed", message);
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

  sendCommand(command: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    } else {
      throw new Error("WebSocket not connected");
    }
  }

  initHead(): void {
    this.sendCommand({ tag: "Init" });
  }

  submitTransaction(cborHex: string): void {
    this.sendCommand({
      tag: "NewTx",
      transaction: {
        cborHex,
        description: "",
        type: "Tx ConwayEra",
      },
    });
  }

  closeHead(): void {
    this.sendCommand({ tag: "Close" });
  }

  fanout(): void {
    this.sendCommand({ tag: "Fanout" });
  }

  private reconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), 5000);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
