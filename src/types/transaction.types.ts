import { Optional } from "sequelize";

export enum TransactionType {
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
  TRANSFER = "transfer",
  TRADE = "trade",
  FEE = "fee",
}

export enum TransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum TransactionLayer {
  L1 = "l1", // on-chain
  L2 = "l2", // hydra/head (off-chain)
}

export interface TransactionAttributes {
  id: number;
  user_id?: number | null; // platform-level txs may be null
  type: TransactionType;
  status: TransactionStatus;
  layer: TransactionLayer;
  amount: number; // lovelace or token units
  fee: number;

  asset_policy_id?: string | null;
  asset_name?: string | null;

  from_address?: string | null;
  to_address?: string | null;

  tx_hash?: string | null; // L1 tx hash
  hydra_tx_id?: string | null; // L2/hydra id
  locker_utxo?: string | null; // optional reference to a locker UTxO

  metadata?: Record<string, any> | null;
  error_message?: string | null;

  // timestamps (snake_case because underscored: true)
  created_at: Date;
  updated_at: Date;
  completed_at?: Date | null;
}

export interface TransactionCreationAttributes
  extends Optional<
    TransactionAttributes,
    | "id"
    | "user_id"
    | "status"
    | "fee"
    | "asset_policy_id"
    | "asset_name"
    | "from_address"
    | "to_address"
    | "tx_hash"
    | "hydra_tx_id"
    | "locker_utxo"
    | "metadata"
    | "error_message"
    | "created_at"
    | "updated_at"
    | "completed_at"
  > {}
