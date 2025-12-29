import { Router } from "express";
import { HydraService } from "../services/hydra.service";
import { CardanoService } from "../services/cardano.service";
import { createHealthRoutes } from "./health.routes";
import { createHydraRoutes } from "./hydra.routes";
import { createTradeRoutes } from "./trade.routes";
import { cardanoRoutes } from "./cardano.routes";
import { authRoutes } from "./auth.routes";
import { balanceRoutes } from "./balance.routes";
import { transactionRoutes } from "./transaction.routes";

export const createRoutes = (
  hydraService: HydraService,
  cardanoService: CardanoService
): Router => {
  const router = Router();

  // Mount route modules
  router.use("/", createHealthRoutes(hydraService, cardanoService));
  router.use("/api/hydra", createHydraRoutes(hydraService, cardanoService));
  router.use("/api", createTradeRoutes(hydraService));
  router.use("/api/cardano", cardanoRoutes(cardanoService));
  router.use("/api/auth", authRoutes());
  router.use("/api/balance", balanceRoutes());
  router.use("/api/transaction", transactionRoutes());

  // 404 handler
  router.use("*", (req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
    });
  });

  return router;
};
