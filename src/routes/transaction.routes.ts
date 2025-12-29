import { Response, Router } from "express";
import { authenticateJWT, AuthRequest } from "../middleware/auth.middleware";
import Transaction from "../models/transaction.model";

export const transactionRoutes = () => {
  const router = Router();

  // GET /api/transaction - Get user transactions
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

      const transactions = await Transaction.findAll({
        where: {
          user_id: userId,
        },
      });

      res.status(200).json({
        success: true,
        data: transactions,
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
