import { Router, Request, Response } from "express";
import { CardanoService } from "../services/cardano.service";
import environment from "../config/environment";
import Balance from "../models/balance.model";
import User from "../models/user.model";

export const cardanoRoutes = (cardanoService: CardanoService) => {
  const router = Router();

  // Platform wallet addresses (read from credential files)
  let platformAddress: string;
  let platformPeerAddress: string;
  let platformSigningKey: string;
  let platformPeerSigningKey: string;

  // Initialize platform credentials
  const initCredentials = async () => {
    try {
      platformAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.ADDRESS_FILE
      );
      platformPeerAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.PEER_ADDRESS_FILE
      );
      platformPeerSigningKey = environment.PLATFORM.HYDRA_SIGNING_KEY;
      platformSigningKey = environment.PLATFORM.CARDANO_SIGNING_KEY;
      console.log("✅ Platform wallet credentials loaded");
    } catch (error) {
      console.error("❌ Failed to load platform credentials:", error);
      throw error;
    }
  };

  // Call initialization immediately
  initCredentials();

  /**
   * GET /api/cardano/health
   * Check Cardano node connection and sync status
   */
  router.get("/health", async (req: Request, res: Response) => {
    try {
      const tip = await cardanoService.queryTip();
      res.json({
        success: true,
        data: {
          connected: true,
          slot: tip.slot,
          block: tip.block,
          epoch: tip.epoch,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to connect to Cardano node",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/cardano/platform/address
   * Get platform wallet address
   */
  router.get("/platform/address", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: {
          address: platformAddress,
          peerAddress: platformPeerAddress,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to retrieve platform address",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/cardano/platform/balance
   * Get platform wallet balance
   */
  router.get("/platform/balance", async (req: Request, res: Response) => {
    try {
      const { balance, utxos } = await cardanoService.getAddressBalance(
        platformAddress
      );
      const { balance: peerBalance, utxos: peerUtxos } =
        await cardanoService.getAddressBalance(platformPeerAddress);

      res.json({
        success: true,
        data: {
          address: platformAddress,
          balance: {
            lovelace: balance,
            ada: balance / 1_000_000,
          },
          utxoCount: utxos.length || 0,
          utxos: utxos.map((utxo) => ({
            txHash: utxo.txHash,
            txIndex: utxo.txIndex,
            amount: utxo.amount,
          })),
          peerAddress: platformPeerAddress,
          peerBalance: {
            lovelace: peerBalance,
            ada: peerBalance / 1_000_000,
          },
          peerUtxos: peerUtxos.map((utxo) => ({
            txHash: utxo.txHash,
            txIndex: utxo.txIndex,
            amount: utxo.amount,
          })),
          peerUtxoCount: peerUtxos.length || 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to query platform balance",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/cardano/address/balance
   * Query balance for any address
   * Body: { address: string }
   */
  router.post("/address/balance", async (req: Request, res: Response) => {
    try {
      const { address } = req.body;

      if (!address) {
        return res.status(400).json({
          success: false,
          error: "Address is required",
        });
      }

      const { balance, utxos } = await cardanoService.getAddressBalance(
        address
      );

      res.json({
        success: true,
        data: {
          address,
          balance: {
            lovelace: balance,
            ada: balance / 1_000_000,
          },
          utxoCount: utxos.length,
          utxos: utxos.map((utxo) => ({
            txHash: utxo.txHash,
            txIndex: utxo.txIndex,
            amount: utxo.amount,
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to query address balance",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/cardano/protocol-parameters
   * Get current protocol parameters
   */
  router.get("/protocol-parameters", async (req: Request, res: Response) => {
    try {
      const params = await cardanoService.getProtocolParameters();

      res.json({
        success: true,
        data: params,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to get protocol parameters",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/cardano/protocol-parameters/update
   * Update protocol parameters from network
   */
  router.post(
    "/protocol-parameters/update",
    async (req: Request, res: Response) => {
      try {
        const params = await cardanoService.updateProtocolParameters();

        res.json({
          success: true,
          message: "Protocol parameters updated successfully",
          data: params,
        });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: "Failed to update protocol parameters",
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/cardano/tip
   * Get current chain tip
   */
  router.get("/tip", async (req: Request, res: Response) => {
    try {
      const tip = await cardanoService.queryTip();

      res.json({
        success: true,
        data: tip,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to query chain tip",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/cardano/deposit
   * This endpoint detects deposits to platform address and credits user in Hydra
   * Body: {
   *   userId: number,
   *   expectedAmount?: number (in lovelace, optional for validation)
   * }
   */

  /**
   * POST /api/cardano/withdraw
   * Execute a withdrawal from Layer 2 to Layer 1
   * Send funds from platform wallet to user's address
   * Body: {
   *   address: string (user's Cardano address)
   * }
   */
  router.post("/withdraw", async (req: Request, res: Response) => {
    try {
      const { address } = req.body;
      if (!address) {
        return res.status(400).json({
          success: false,
          error: "Address is required",
        });
      }
      //   find how much amount user has deposited with out hft plaform address
      const user = await User.findOne({ where: { wallet_address: address } });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User with the provided address not found",
        });
      }
      const balanceRecord = await Balance.findOne({
        where: {
          user_id: user?.id,
          type: "DEPOSIT",
        },
      });
      if (!balanceRecord || balanceRecord.amount <= 0) {
        return res.status(404).json({
          success: false,
          error: "User with the provided address not found",
        });
      }
      const tx = await cardanoService.sendPayment(
        platformAddress,
        user?.wallet_address || "",
        balanceRecord?.amount || 0,
        platformSigningKey
      );
      res.json({
        success: true,
        data: tx,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to send payment transaction",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/cardano/monitor/deposits/start
   * Start monitoring deposits to platform address
   * Query params: ?interval=10000 (polling interval in ms)
   */

  return router;
};
