import express, { Express } from "express";
import dotenv from "dotenv";
import { HydraService } from "./services/hydra.service";
import { CardanoService } from "./services/cardano.service";
import { createRoutes } from "./routes";
import environment from "./config/environment";
import sequelize from "./config/db.config";
import Balance from "./models/balance.model";
import Transaction from "./models/transaction.model";
import User from "./models/user.model";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import cookieParser from "cookie-parser";

const execAsync = promisify(exec);

dotenv.config();

async function stopHydraNodes() {
  try {
    console.log("\n🛑 Stopping Hydra nodes...");
    const scriptPath = path.join(process.cwd(), "scripts/stop-hydra-nodes.sh");
    await execAsync(`bash ${scriptPath}`);
    console.log("✅ Hydra nodes stopped successfully");
  } catch (error: any) {
    console.error("❌ Error stopping Hydra nodes:", error.message);
  }
}

async function startServer() {
  const app: Express = express();
  const port = environment.PORT || 3000;

  // check database connection and sync models
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection OK");

    // Sync in correct order: parent tables first, then children
    await User.sync();
    await Transaction.sync();
    await Balance.sync();

    console.log("✅ Models synced with database");
  } catch (err) {
    console.error("❌ Database init failed:", err);
    process.exit(1);
  }

  // Middleware
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  // Initialize services
  const hydraService = new HydraService(environment.HYDRA.WS_URL);
  const cardanoService = new CardanoService();

  // Connect to Hydra node with retry
  let connected = false;
  for (let i = 0; i < 5; i++) {
    try {
      hydraService.connect();

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout")),
          5000
        );
        hydraService.once("connected", () => {
          clearTimeout(timeout);
          resolve(true);
        });
      });

      connected = true;
      break;
    } catch (error) {
      console.log(`Connection attempt ${i + 1} failed, retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!connected) {
    throw new Error("Failed to connect to Hydra node after multiple attempts");
  }

  // Event listeners
  hydraService.on("head-open", (data) => {
    console.log("🎉 Hydra Head is open!");
  });

  hydraService.on("tx-valid", (data) => {
    console.log("✅ Transaction valid:", data.transactionId);
  });

  hydraService.on("snapshot-confirmed", (data) => {
    console.log("📸 Snapshot confirmed");
  });

  hydraService.on("head-closed", (data) => {
    console.log("🔒 Hydra Head closed");
  });

  // Mount all routes
  app.use(createRoutes(hydraService, cardanoService));

  // Start server
  const server = app.listen(port, () => {
    console.log("");
    console.log(
      "╔════════════════════════════════════════════════════════════════════════╗"
    );
    console.log(
      "║              Hydra Gateway Started Successfully!                      ║"
    );
    console.log(
      "╚════════════════════════════════════════════════════════════════════════╝"
    );
    console.log("");
    console.log(`🌐 Server: http://localhost:${port}`);
    console.log(`📡 Health: http://localhost:${port}/health`);
    console.log(`🔌 Hydra WS: ${process.env.HYDRA_WS_URL}`);
    console.log("");
  });

  // Graceful shutdown handler
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n⚠️  Received ${signal} signal`);
    console.log("🛑 Starting graceful shutdown...");

    // Close HTTP server first
    server.close(async () => {
      console.log("✅ HTTP server closed");

      // Disconnect Hydra WebSocket
      hydraService.disconnect();
      console.log("✅ Hydra WebSocket disconnected");

      // Stop Hydra nodes
      await stopHydraNodes();

      // Close database connections
      try {
        await sequelize.close();
        console.log("✅ Database connections closed");
      } catch (error) {
        console.error("❌ Error closing database:", error);
      }

      console.log("✅ Graceful shutdown complete");
      console.log("ℹ️  Cardano node is still running in background");
      process.exit(0);
    });

    // Force close after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error(
        "❌ Could not close connections in time, forcefully shutting down"
      );
      process.exit(1);
    }, 10000);
  };

  // Register shutdown handlers
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  // Handle uncaught errors
  process.on("uncaughtException", async (error) => {
    console.error("❌ Uncaught Exception:", error);
    await gracefulShutdown("UNCAUGHT_EXCEPTION");
  });

  process.on("unhandledRejection", async (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
    await gracefulShutdown("UNHANDLED_REJECTION");
  });

  return app;
}

// Start the server
startServer().catch(async (error) => {
  console.error("❌ Failed to start server:", error);
  // Try to stop Hydra nodes even if startup fails
  await stopHydraNodes();
  process.exit(1);
});

export default startServer;
