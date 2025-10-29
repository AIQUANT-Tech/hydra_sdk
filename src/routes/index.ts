import { Router } from "express";
import { HydraService } from "../services/hydra.service";
import { CardanoService } from "../services/cardano.service";
import { createHealthRoutes } from "./health.routes";
import { createHydraRoutes } from "./hydra.routes";
import { createTradeRoutes } from "./trade.routes";
import { createUserRoutes } from "./user.routes";
import { cardanoRoutes } from "./cardano.routes";

export const createRoutes = (
  hydraService: HydraService,
  cardanoService: CardanoService
): Router => {
  const router = Router();

  // Mount route modules
  router.use("/", createHealthRoutes(hydraService));
  router.use("/api/hydra", createHydraRoutes(hydraService));
  router.use("/api", createTradeRoutes(hydraService));
  router.use("/api/users", createUserRoutes());
  router.use("/api/cardano", cardanoRoutes(cardanoService));

  // 404 handler
  router.use("*", (req, res) => {
    res.status(404).json({
      success: false,
      message: "Route not found",
    });
  });

  return router;
};
