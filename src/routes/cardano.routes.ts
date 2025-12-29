import { Router, Request, Response } from "express";
import { CardanoService } from "../services/cardano.service";
import environment from "../config/environment";
import sequelize from "../config/db.config";
import Balance from "../models/balance.model";
import User from "../models/user.model";
import Transaction from "../models/transaction.model";
import { BalanceType } from "../types/balance.types";
import {
  TransactionLayer,
  TransactionStatus,
  TransactionType,
} from "../types/transaction.types";
import { authenticateJWT, AuthRequest } from "../middleware/auth.middleware";

export const cardanoRoutes = (cardanoService: CardanoService) => {
  const router = Router();

  // Platform wallet addresses (read from credential files)
  let platformAddress: string;
  let platformPeerAddress: string;
  let platformSigningKey: string;
  let platformPeerSigningKey: string;
  let platformNodeAddress: string;
  let platformPeerNodeAddress: string;
  let platformNodeSigningKey: string;
  let platformPeerNodeSigningKey: string;

  // Initialize platform credentials
  const initCredentials = async () => {
    try {
      // Funds
      platformAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.ADDRESS_FILE
      );
      platformPeerAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.PEER_ADDRESS_FILE
      );
      platformSigningKey = environment.PLATFORM.CARDANO_SIGNING_KEY;
      platformPeerSigningKey = environment.PLATFORM.HYDRA_SIGNING_KEY;

      // Node
      platformNodeAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.NODE_ADDRESS_FILE
      );
      platformPeerNodeAddress = await cardanoService.readAddressFromFile(
        environment.PLATFORM.PEER_NODE_ADDRESS_FILE
      );
      platformNodeSigningKey = environment.PLATFORM.NODE_SIGNING_KEY;
      platformPeerNodeSigningKey = environment.PLATFORM.PEER_NODE_SIGNING_KEY;

      console.log("✅ Platform wallet credentials loaded");
    } catch (error) {
      console.error("❌ Failed to load platform credentials:", error);
      throw error;
    }
  };

  // Call initialization immediately (async, fire-and-forget)
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
   * GET /api/cardano/platform/fund/balance
   * Get platform funds wallet balance (funds addr + peer funds addr)
   */
  router.get("/platform/fund/balance", async (req: Request, res: Response) => {
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
   * GET /api/cardano/platform/node/balance
   * Get platform node wallet balance
   */
  router.get("/platform/node/balance", async (req: Request, res: Response) => {
    try {
      const { balance, utxos } = await cardanoService.getAddressBalance(
        platformNodeAddress
      );
      const { balance: peerBalance, utxos: peerUtxos } =
        await cardanoService.getAddressBalance(platformPeerNodeAddress);

      res.json({
        success: true,
        data: {
          address: platformNodeAddress,
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
          peerAddress: platformPeerNodeAddress,
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
        error: "Failed to query platform node balance",
        message: error.message,
      });
    }
  });

  /**
   * POST /api/cardano/address/funds/balance
   * Query balance for any address
   * Body: { address: string }
   */
  router.post("/address/funds/balance", async (req: Request, res: Response) => {
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

  // ─────────────────────────────────────────────────────────────
  // DEPOSIT CONFIRMATION (frontend sends txHash, txIndex, amount)
  // ─────────────────────────────────────────────────────────────
  /**
   * POST /api/cardano/deposit/confirm
   *
   * Body:
   *  {
   *    address: string;      // user's wallet address (must match user.wallet_address)
   *    txHash: string;       // tx hash that sent funds TO platformAddress
   *    txIndex: number;      // output index in that tx
   *    amount: number;       // expected amount in lovelace
   *  }
   *
   * Flow:
   *  - Verify user exists by wallet_address
   *  - Query UTxOs at platformAddress
   *  - Check that txHash exists and has at least `amount` lovelace
   *  - Idempotent: if Transaction(type=DEPOSIT, tx_hash=txHash) already exists, do not double-credit
   *  - Create Transaction row (DEPOSIT, L1, COMPLETED)
   *  - Add to Balance.AVAILABLE (ADA) for that user
   */
  router.post(
    "/deposit/confirm",
    authenticateJWT,
    async (req: AuthRequest, res: Response) => {
      try {
        const { txHash, amount } = req.body;
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: "User not authenticated",
          });
        }
        const address = req.user.walletAddress;

        if (!address || !txHash || amount === undefined) {
          return res.status(400).json({
            success: false,
            error: "address, txHash and amount are required",
          });
        }

        const user = await User.findOne({
          where: { walletAddress: address },
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User with the provided address not found",
          });
        }

        // amount comes from UI in ADA (e.g. 5), convert to lovelace
        const amountAda = Number(amount);
        if (Number.isNaN(amountAda) || amountAda <= 0) {
          return res.status(400).json({
            success: false,
            error: "Amount must be a positive number (in ADA)",
          });
        }

        const expectedLovelace = Math.round(amountAda * 1_000_000);

        // Idempotency: if we already processed this deposit tx, don't double credit
        const existingTx = await Transaction.findOne({
          where: {
            tx_hash: txHash,
            type: TransactionType.DEPOSIT,
          },
        });

        if (existingTx) {
          const currentBalance = await Balance.getAvailableBalance(
            user.id,
            null,
            null
          );
          return res.json({
            success: true,
            credited: false,
            message: "Deposit already processed",
            data: {
              availableBalanceLovelace: currentBalance,
            },
          });
        }

        // Query UTxOs at platformAddress (where user sends deposits)
        console.log(platformAddress);

        const { utxos } = await cardanoService.getAddressBalance(
          platformAddress
        );

        console.log(utxos);

        // All UTxOs from this txHash
        const candidateUtxos = utxos.filter((u) => u.txHash === txHash);

        if (candidateUtxos.length === 0) {
          return res.status(400).json({
            success: false,
            error: `No UTxOs from txHash ${txHash} found at platform address`,
          });
        }

        // Try to find a single UTxO with enough lovelace
        const matchingByAmount = candidateUtxos.filter(
          (u) => u.amount.lovelace >= expectedLovelace
        );

        let utxo: (typeof candidateUtxos)[number];

        if (matchingByAmount.length === 1) {
          utxo = matchingByAmount[0];
        } else if (matchingByAmount.length === 0) {
          return res.status(400).json({
            success: false,
            error: `No UTxO from txHash ${txHash} has at least ${expectedLovelace} lovelace at platform address`,
          });
        } else {
          return res.status(400).json({
            success: false,
            error:
              "Multiple UTxOs from this txHash match the amount; cannot safely determine which deposit to credit",
          });
        }

        // DB tx: log + credit balance (always in lovelace)
        let newBalance = 0;

        await sequelize.transaction(async (t) => {
          const txRow = await Transaction.create(
            {
              user_id: user.id,
              type: TransactionType.DEPOSIT,
              status: TransactionStatus.COMPLETED,
              layer: TransactionLayer.L1,
              // store lovelace in DB
              amount: expectedLovelace,
              fee: 0,
              asset_policy_id: "",
              asset_name: "ada.lovelace",
              from_address: user.walletAddress ?? null,
              to_address: platformAddress,
              tx_hash: txHash,
              metadata: {
                tx_index: utxo.txIndex,
                utxo_amount: utxo.amount.lovelace,
                amount_ada: amountAda,
              },
              completed_at: new Date(),
            },
            { transaction: t }
          );

          await Balance.addBalance(
            user.id,
            expectedLovelace,
            BalanceType.AVAILABLE,
            txRow.id,
            t,
            null,
            null
          );

          newBalance = expectedLovelace;
          console.log(newBalance);
        });

        res.json({
          success: true,
          credited: true,
          data: {
            availableBalance: newBalance,
          },
        });
      } catch (error: any) {
        console.error("deposit/confirm error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to confirm deposit",
          message: error.message,
        });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // WITHDRAW (platform -> user)
  // ─────────────────────────────────────────────────────────────
  /**
   * POST /api/cardano/withdraw
   *
   * Body:
   *  {
   *    address: string;      // user's wallet address (must match user.wallet_address)
   *    amount?: number;      // in lovelace; if omitted, withdraw FULL available ADA balance
   *  }
   *
   * Flow:
   *  - Find user by address
   *  - Determine available ADA (BalanceType.AVAILABLE, policy=null, asset=null)
   *  - If amount provided, check <= available
   *  - In DB transaction:
   *      * create Transaction row (WITHDRAWAL, PROCESSING)
   *      * subtract from available balance
   *  - Call cardanoService.sendPayment(platformAddress -> user.address) for amount
   *  - On success:
   *      * mark Transaction COMPLETED, set tx_hash
   *  - On failure:
   *      * create FAILED transaction log
   *      * re-credit user AVAILABLE balance
   */
  router.post(
    "/withdraw",
    authenticateJWT,
    async (req: AuthRequest, res: Response) => {
      try {
        const { amount } = req.body;
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: "User not authenticated",
          });
        }
        const address = req.user.walletAddress;
        const platformFee = 2_000_000; // 2 ADA

        if (!address) {
          return res.status(400).json({
            success: false,
            error: "Address is required",
          });
        }

        const user = await User.findOne({
          where: { walletAddress: address },
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User with the provided address not found",
          });
        }

        // Get user's available ADA (policy=null, asset=null)
        const available = await Balance.getAvailableBalance(
          user.id,
          null,
          null
        );

        if (available <= 0) {
          return res.status(400).json({
            success: false,
            error: "No available balance for withdrawal",
          });
        }

        let requestedAmount =
          amount !== undefined ? Number(amount * 1000000) : available;
        if (Number.isNaN(requestedAmount) || requestedAmount <= 0) {
          return res.status(400).json({
            success: false,
            error: "Invalid withdrawal amount",
          });
        }

        if (requestedAmount > available) {
          return res.status(400).json({
            success: false,
            error: "Requested amount exceeds available balance",
          });
        }

        // We'll create a processing transaction and subtract balance first
        let txRow: Transaction;

        try {
          txRow = await sequelize.transaction(async (t) => {
            // create transaction log
            const row = await Transaction.create(
              {
                user_id: user.id,
                type: TransactionType.WITHDRAWAL,
                status: TransactionStatus.PROCESSING,
                layer: TransactionLayer.L1,
                amount: requestedAmount,
                fee: 0,
                asset_policy_id: "",
                asset_name: "ada.lovelace",
                from_address: platformAddress,
                to_address: address,
                metadata: {},
              },
              { transaction: t }
            );

            // subtract from available balance
            await Balance.subtractBalance(
              user.id,
              requestedAmount,
              BalanceType.AVAILABLE,
              row.id,
              t,
              null,
              null
            );

            // return created row so sequelize.transaction resolves to it
            return row;
          });
        } catch (dbError: any) {
          console.error("withdraw db reserve error:", dbError);
          return res.status(500).json({
            success: false,
            error: "Failed to reserve funds for withdrawal",
            message: dbError.message,
          });
        }

        // Now call cardano-cli via CardanoService to send the payment
        let txId: string | null = null;

        try {
          txId = await cardanoService.sendPayment(
            platformAddress,
            address,
            requestedAmount,
            platformSigningKey,
            platformFee
          );

          // mark transaction completed
          await txRow.update({
            status: TransactionStatus.COMPLETED,
            tx_hash: txId,
            fee: platformFee,
            completed_at: new Date(),
          });

          const remaining = await Balance.getAvailableBalance(
            user.id,
            null,
            null
          );

          return res.json({
            success: true,
            data: {
              txId,
              withdrawn: requestedAmount,
              remainingBalance: remaining,
            },
          });
        } catch (sendErr: any) {
          console.error("withdraw sendPayment error:", sendErr);

          // On failure, refund the user in DB and mark tx as failed
          try {
            await sequelize.transaction(async (t) => {
              // re-credit balance
              await Balance.addBalance(
                user.id,
                requestedAmount,
                BalanceType.AVAILABLE,
                txRow.id,
                t,
                null,
                null
              );

              await txRow!.update(
                {
                  status: TransactionStatus.FAILED,
                  error_message: sendErr.message,
                },
                { transaction: t }
              );
            });
          } catch (rollbackErr) {
            console.error("withdraw rollback error:", rollbackErr);
          }

          return res.status(500).json({
            success: false,
            error: "Failed to send payment transaction",
            message: sendErr.message,
          });
        }
      } catch (error: any) {
        console.error("withdraw route error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to process withdrawal",
          message: error.message,
        });
      }
    }
  );

  // locks utxo's to smart contract from platform address
  router.post(
    "/lock-utxos",
    authenticateJWT,
    async (req: AuthRequest, res: Response) => {
      try {
        const txHash = await cardanoService.lockUtxos();
        res.status(200).json({ success: true, data: txHash });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: "Failed to lock utxos",
          message: error.message,
        });
      }
    }
  );

  // unlocks utxo's to smart contract from platform address
  router.post(
    "/unlock-utxos",
    authenticateJWT,
    async (req: AuthRequest, res: Response) => {
      try {
        const txHash = await cardanoService.unlockUtxos();
        res.status(200).json({ success: true, data: txHash });
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: "Failed to lock utxos",
          message: error.message,
        });
      }
    }
  );

  return router;
};
