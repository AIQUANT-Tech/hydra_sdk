import { Router, Request, Response } from "express";
import { HydraService } from "../services/hydra.service";
import { CardanoService } from "../services/cardano.service";

const router = Router();

export const createHealthRoutes = (
  hydraService: HydraService,
  cardanoService: CardanoService
) => {
  // Health check endpoint
  router.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      hydra: hydraService.getNodeStatus(),
      cardano: cardanoService.getNodeStatus(),
    });
  });

  // Liveness probe
  router.get("/ping", (req: Request, res: Response) => {
    res.json({ message: "pong" });
  });

  return router;
};
