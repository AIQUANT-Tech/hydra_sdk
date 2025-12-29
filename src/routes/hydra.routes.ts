import { Router, Request, Response } from "express";
import { HydraService } from "../services/hydra.service";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import environment from "../config/environment";
import { CardanoService } from "../services/cardano.service";

const execAsync = promisify(exec);
const router = Router();

export const createHydraRoutes = (
  hydraService: HydraService,
  cardanoService: CardanoService
) => {
  let platformAddress: string;
  let platformPeerAddress: string;

  // Initialize platform credentials
  const initCredentials = async () => {
    try {
      // Funds
      platformAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.ADDRESS_FILE
      );
      platformPeerAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.PEER_ADDRESS_FILE
      );

      console.log("✅ Platform wallet credentials loaded");
    } catch (error) {
      console.error("❌ Failed to load platform credentials:", error);
      throw error;
    }
  };

  // Call initialization immediately (async, fire-and-forget)
  initCredentials();

  // Initialize Hydra Head
  router.post("/init", (req: Request, res: Response) => {
    try {
      hydraService.initHead();
      res.json({
        success: true,
        message: "Head initialization started",
        nextStep:
          "Commit funds from both participants using POST /api/hydra/commit",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Commit funds to Hydra Head
  router.post("/commit", async (req: Request, res: Response) => {
    const { participant, apiPort } = req.body;

    if (!participant) {
      return res.status(400).json({
        success: false,
        error: "Missing 'participant' field",
      });
    }

    try {
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(projectDir, "bash", "commit-funds.sh");
      const port = apiPort || (participant === "platform" ? "4001" : "4002");

      console.log(`📝 Committing funds for ${participant} on port ${port}...`);

      // Pass full environment including PATH and CARDANO_NODE_SOCKET_PATH
      const { stdout, stderr } = await execAsync(
        `bash ${scriptPath} ${participant} ${port}`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
        }
      );

      console.log("Commit output:", stdout);
      if (stderr) console.warn("Commit stderr:", stderr);

      res.json({
        success: true,
        message: `Funds committed successfully for ${participant}`,
        participant,
        apiPort: port,
        output: stdout,
      });
    } catch (error: any) {
      console.error("Commit error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stderr: error.stderr,
        hint: "Make sure cardano-cli is in PATH",
      });
    }
  });

  // Commit all participants
  router.post("/commit-all", async (req: Request, res: Response) => {
    try {
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(projectDir, "bash", "commit-funds.sh");

      console.log("📝 Committing funds for all participants...");

      // Commit platform
      console.log("1. Committing platform...");
      const platform = await execAsync(`bash ${scriptPath} platform 4001`, {
        cwd: projectDir,
        env: {
          ...process.env,
          PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
          CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Commit platform-peer
      console.log("2. Committing platform-peer...");
      const platformPeer = await execAsync(
        `bash ${scriptPath} platform-peer 4002`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
        }
      );

      res.json({
        success: true,
        message: "Funds committed successfully for all participants",
        commits: [
          { participant: "platform", port: 4001, output: platform.stdout },
          {
            participant: "platform-peer",
            port: 4002,
            output: platformPeer.stdout,
          },
        ],
      });
    } catch (error: any) {
      console.error("Commit all error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stderr: error.stderr,
      });
    }
  });

  router.post("/commit-script-utxo", async (req: Request, res: Response) => {
    try {
      console.log("api called");

      await hydraService.commitScriptUtxo();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Close Hydra Head
  router.post("/close", (req: Request, res: Response) => {
    try {
      hydraService.closeHead();
      res.json({
        success: true,
        message: "Head closing initiated",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Fanout (distribute funds after close)
  router.post("/fanout", (req: Request, res: Response) => {
    try {
      hydraService.fanout();
      res.json({
        success: true,
        message: "Fanout initiated",
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Get status of BOTH nodes
  router.get("/status", async (req, res) => {
    try {
      const url = `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT1}/snapshot/utxo`;

      const [node1Res, node2Res] = await Promise.allSettled([
        axios.get(url),
        axios.get(
          url.replace(
            environment.HYDRA.PORT1.toString(),
            environment.HYDRA.PORT2.toString()
          )
        ),
      ]);

      const node1Status = node1Res.status === "fulfilled";
      const node2Status = node2Res.status === "fulfilled";

      const utxos: Record<string, any> =
        node1Status && (node1Res as any).value.data
          ? (node1Res as any).value.data
          : {};

      // addresses for each participant (configure these)
      let platformUtxoCount = 0;
      let peerUtxoCount = 0;
      let platformLovelace = 0;
      let peerLovelace = 0;

      Object.values(utxos).forEach((output: any) => {
        const lovelace = output.value?.lovelace || 0;
        if (output.address === platformAddress) {
          platformUtxoCount++;
          platformLovelace += lovelace;
        } else if (output.address === platformPeerAddress) {
          peerUtxoCount++;
          peerLovelace += lovelace;
        }
      });

      res.json({
        success: true,
        nodes: {
          platform: {
            connected: node1Status,
            apiUrl: `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT1}`,
            wsUrl: environment.HYDRA.WS_URL,
            snapshot: {
              utxoCount: platformUtxoCount,
              totalLovelace: platformLovelace,
              totalAda: (platformLovelace / 1_000_000).toFixed(6),
            },
          },
          platformPeer: {
            connected: node2Status,
            apiUrl: `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT2}`,
            wsUrl: environment.HYDRA.WS_URL_PEER,
            snapshot: {
              utxoCount: peerUtxoCount,
              totalLovelace: peerLovelace,
              totalAda: (peerLovelace / 1_000_000).toFixed(6),
            },
          },
        },
        utxos: utxos,
        overall: {
          bothNodesRunning: node1Status && node2Status,
          healthStatus: node1Status && node2Status ? "healthy" : "degraded",
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Internal transaction route
  router.post("/internal-transaction", async (req: Request, res: Response) => {
    const { from, to, amount } = req.body;

    if (!from || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: from, to, amount (in ADA)",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount must be greater than 0",
      });
    }

    try {
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(projectDir, "bash", "create-transaction.sh");

      // Determine API port based on 'from' participant
      const apiPort = from === "platform" ? "4001" : "4002";

      console.log(
        `💸 Creating internal transaction: ${from} → ${to} (${amount} ADA)`
      );

      const { stdout, stderr } = await execAsync(
        `bash ${scriptPath} ${from} ${to} ${amount} ${apiPort}`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
        }
      );

      if (stderr) console.warn("Transaction creation stderr:", stderr);

      // Extract the transaction JSON from script output
      const txJsonMatch = stdout.match(/\{.*"tag":"NewTx".*\}/s);

      if (!txJsonMatch) {
        console.error("Transaction stdout:", stdout);
        throw new Error(
          "Failed to extract transaction JSON from script output. Check script stderr for details."
        );
      }

      const txJson = JSON.parse(txJsonMatch[0]);

      // Ensure we get the cborHex string and submit only the cborHex to the sender node
      const cborHex =
        txJson?.transaction?.cborHex ||
        (txJson?.cborHex ? txJson.cborHex : null);

      if (!cborHex) {
        console.error("txJson:", txJson);
        throw new Error("No cborHex found in transaction JSON");
      }

      // CRITICAL: Submit transaction to the SENDER's node WebSocket
      console.log(`📡 Submitting transaction (cborHex) to ${from}'s node...`);
      hydraService.submitTransaction(cborHex, from);

      res.json({
        success: true,
        message: `Transaction submitted: ${from} → ${to} (${amount} ADA)`,
        transaction: {
          from,
          to,
          amount: {
            ada: amount,
            lovelace: amount * 1_000_000,
          },
          submittedTo: `${from} node`,
          txData: txJson,
        },
        note: "Transaction will be confirmed in the next snapshot (~few seconds)",
      });
    } catch (error: any) {
      console.error("Internal transaction error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stderr: error.stderr,
        hint: `Ensure ${from}'s WebSocket is connected, head is open, and cardano-cli is on PATH`,
      });
    }
  });

  // ----------------- incremental commit endpoint -----------------
  router.post("/commit-incremental", async (req: Request, res: Response) => {
    const { participant, apiPort } = req.body;
    if (!participant) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'participant' field" });
    }
    const port = apiPort || (participant === "platform" ? "4001" : "4002");
    try {
      // Commit platform
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(projectDir, "bash", "commit-funds.sh");

      console.log(`📝 Committing funds for ${participant}...`);
      const platform = await execAsync(
        `bash ${scriptPath} ${participant} ${port}`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
        }
      );

      res.status(200).json({
        success: true,
        message: `Funds committed for ${participant}`,
        stdout: platform.stdout,
        stderr: platform.stderr,
      });
    } catch (error: any) {
      console.error("commit-incremental error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stderr: error.stderr,
        hint: "Ensure cardano-cli is on PATH and node socket path is set",
      });
    }
  });

  // ----------------- decommit endpoint -----------------
  router.post("/decommit-utxo", async (req: Request, res: Response) => {
    const { owner, apiPort, txin, dest } = req.body;
    if (!owner) {
      return res
        .status(400)
        .json({ success: false, error: "Missing 'owner' field" });
    }
    const port = apiPort || (owner === "platform" ? "4001" : "4002");

    try {
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(projectDir, "bash", "decommit-utxo.sh");
      const args = [owner, port];
      if (txin) args.push(txin);
      if (dest) args.push(dest);

      const { stdout, stderr } = await execAsync(
        `bash ${scriptPath} ${args.map((a) => `'${a}'`).join(" ")}`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
          maxBuffer: 20 * 1024 * 1024,
        }
      );

      if (stderr) console.warn("decommit stderr:", stderr);

      res.json({
        success: true,
        message: `Decommit request submitted for ${owner}`,
        output: stdout,
      });
    } catch (error: any) {
      console.error("decommit error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        stderr: error.stderr,
        hint: "Make sure the owner has a UTxO in the head, cardano-cli is on PATH, and signing key exists",
      });
    }
  });

  // Script transaction route (spend script UTxO inside head)
  router.post("/script-transaction", async (req: Request, res: Response) => {
    const { to, amount } = req.body;

    if (!to || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: to, amount (ADA)",
      });
    }

    try {
      const projectDir = path.resolve(__dirname, "../../");
      const scriptPath = path.join(
        projectDir,
        "bash",
        "create-script-transaction.sh"
      );

      const apiPort = "4001";

      const { stdout, stderr } = await execAsync(
        `bash ${scriptPath} ${to} ${amount} ${apiPort}`,
        {
          cwd: projectDir,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CARDANO_NODE_SOCKET_PATH: process.env.CARDANO_NODE_SOCKET_PATH,
          },
          maxBuffer: 20 * 1024 * 1024,
        }
      );

      if (stderr) console.warn("script stderr:", stderr);

      const match = stdout.match(/\{[\s\S]*"tag"\s*:\s*"NewTx"[\s\S]*\}/);
      if (!match) {
        throw new Error("Failed to extract NewTx JSON from script output");
      }

      const txJson = JSON.parse(match[0]);

      // ✅ THIS IS CRITICAL
      const cborHex = txJson.transaction.cborHex;
      if (!cborHex || typeof cborHex !== "string") {
        throw new Error("Invalid cborHex extracted");
      }

      // ✅ submit ONLY the hex
      hydraService.submitTransaction(cborHex, "platform");

      res.json({
        success: true,
        message: "Script transaction submitted to Hydra",
      });
    } catch (err: any) {
      console.error("script-transaction error:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  });

  return router;
};
