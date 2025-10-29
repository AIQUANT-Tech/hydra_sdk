import { Router, Request, Response } from "express";
import { HydraService } from "../services/hydra.service";

const router = Router();

export const createHealthRoutes = (hydraService: HydraService) => {
  // Health check endpoint
  router.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      hydra: {
        connected: hydraService.ws?.readyState === 1,
        url: process.env.HYDRA_WS_URL,
      },
      cardano: {
        network: process.env.CARDANO_NETWORK,
        socketPath: process.env.CARDANO_NODE_SOCKET_PATH,
      },
    });
  });

  // Liveness probe
  router.get("/ping", (req: Request, res: Response) => {
    res.json({ message: "pong" });
  });

  return router;
};
