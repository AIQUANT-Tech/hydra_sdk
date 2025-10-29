import { Router, Request, Response } from "express";
import { HydraService } from "../services/hydra.service";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import environment from "../config/environment";

const execAsync = promisify(exec);
const router = Router();

export const createHydraRoutes = (hydraService: HydraService) => {
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
      const scriptPath = path.join(projectDir, "scripts", "commit-funds.sh");
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
      const scriptPath = path.join(projectDir, "scripts", "commit-funds.sh");

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

  // Get current snapshot (UTxOs from BOTH nodes)
  router.get("/snapshot", async (req: Request, res: Response) => {
    try {
      // Fetch from both nodes
      const url1 = `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT1}/snapshot/utxo`;
      const url2 = `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT2}/snapshot/utxo`;

      const [response1, response2] = await Promise.all([
        axios.get(url1).catch((e) => ({ data: {} })),
        axios.get(url2).catch((e) => ({ data: {} })),
      ]);

      const utxos1 = response1.data;
      const utxos2 = response2.data;

      // Combine UTxOs (they should be identical since they're in same head)
      const allUtxos = { ...utxos1 };

      // Parse UTxO data
      const utxoList = Object.entries(allUtxos).map(
        ([txIn, output]: [string, any]) => {
          const lovelace = output.value?.lovelace || 0;

          return {
            txIn,
            address: output.address,
            lovelace,
            ada: (lovelace / 1_000_000).toFixed(6),
            assets: Object.keys(output.value || {})
              .filter((key) => key !== "lovelace")
              .map((policyId) => ({
                policyId,
                tokens: output.value[policyId],
              })),
            datum: output.datum || output.inlineDatum || null,
          };
        }
      );

      const totalLovelace = utxoList.reduce(
        (sum, utxo) => sum + utxo.lovelace,
        0
      );

      res.json({
        success: true,
        data: {
          utxos: utxoList,
          summary: {
            totalUtxos: utxoList.length,
            totalLovelace,
            totalAda: (totalLovelace / 1_000_000).toFixed(6),
          },
          nodes: {
            platform: {
              url: url1,
              utxoCount: Object.keys(utxos1).length,
              status: response1.data ? "connected" : "disconnected",
            },
            platformPeer: {
              url: url2,
              utxoCount: Object.keys(utxos2).length,
              status: response2.data ? "connected" : "disconnected",
            },
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Get status of BOTH nodes
  router.get("/status", async (req: Request, res: Response) => {
    try {
      // Check both nodes
      const checks = await Promise.allSettled([
        axios.get(
          `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT1}/snapshot/utxo`
        ),
        axios.get(
          `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT2}/snapshot/utxo`
        ),
      ]);

      const node1Status = checks[0].status === "fulfilled";
      const node2Status = checks[1].status === "fulfilled";

      let utxoData1 = null;
      let utxoData2 = null;

      if (node1Status) {
        const utxos = (checks[0] as any).value.data;
        const totalLovelace = Object.values(utxos).reduce(
          (sum: number, output: any) => sum + (output.value?.lovelace || 0),
          0
        );
        utxoData1 = {
          utxoCount: Object.keys(utxos).length,
          totalLovelace,
          totalAda: (totalLovelace / 1_000_000).toFixed(6),
        };
      }

      if (node2Status) {
        const utxos = (checks[1] as any).value.data;
        const totalLovelace = Object.values(utxos).reduce(
          (sum: number, output: any) => sum + (output.value?.lovelace || 0),
          0
        );
        utxoData2 = {
          utxoCount: Object.keys(utxos).length,
          totalLovelace,
          totalAda: (totalLovelace / 1_000_000).toFixed(6),
        };
      }

      res.json({
        success: true,
        nodes: {
          platform: {
            connected: node1Status,
            apiUrl: `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT1}`,
            wsUrl: environment.HYDRA.WS_URL,
            snapshot: utxoData1 || { error: "Not connected or head not open" },
          },
          platformPeer: {
            connected: node2Status,
            apiUrl: `http://${environment.HYDRA.HOST}:${environment.HYDRA.PORT2}`,
            wsUrl: environment.HYDRA.WS_URL_PEER,
            snapshot: utxoData2 || { error: "Not connected or head not open" },
          },
        },
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

  return router;
};
