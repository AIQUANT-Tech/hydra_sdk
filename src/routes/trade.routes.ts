import { Router } from "express";
import { HydraService } from "../services/hydra.service";

const router = Router();

export const createTradeRoutes = (hydraService: HydraService) => {
  return router;
};
