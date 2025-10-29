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
  L1 = "l1", // Cardano mainnet
  L2 = "l2", // Hydra head
}

export interface TransactionAttributes {
  id: number;
  user_id: number;
  type: TransactionType;
  status: TransactionStatus;
  layer: TransactionLayer;
  amount: number; // in lovelace
  fee: number; // in lovelace
  from_address?: string;
  to_address?: string;
  tx_hash?: string; // L1 transaction hash
  hydra_tx_id?: string; // L2 transaction ID
  metadata?: object;
  error_message?: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface TransactionCreationAttributes
  extends Optional<
    TransactionAttributes,
    "id" | "status" | "fee" | "created_at" | "updated_at"
  > {}
