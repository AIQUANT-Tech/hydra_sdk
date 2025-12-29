import { Response, Router } from "express";
import { authenticateJWT, AuthRequest } from "../middleware/auth.middleware";
import Balance from "../models/balance.model";
import { BalanceType } from "../types/balance.types";

export const balanceRoutes = () => {
  const router = Router();

  // GET /api/balance - Get user balance
  router.get("/", authenticateJWT, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.userId;
      const walletAddress = req.user?.walletAddress;

      if (!userId || !walletAddress) {
        res.status(401).json({
          success: false,
          error: "User not authenticated",
        });
        return;
      }

      const balance = await Balance.findOne({
        where: {
          user_id: userId,
          type: BalanceType.AVAILABLE,
        },
      });

      if (!balance) {
        res.status(404).json({
          success: false,
          error: "Balance not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        balance: balance.amount,
      });
    } catch (error) {
      console.error("❌ Error getting balance:", error);
      res.status(500).json({
        success: false,
        error: "Error getting balance",
      });
    }
  });

  return router;
};
