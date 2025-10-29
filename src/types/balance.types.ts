import { Optional } from "sequelize";

export enum BalanceType {
  AVAILABLE = "available", // Available for trading/withdrawal
  LOCKED = "locked", // Locked in trades or pending transactions
  RESERVED = "reserved", // Reserved for fees or other purposes
}

export interface BalanceAttributes {
  id: number;
  user_id: number;
  type: BalanceType;
  amount: number; // in lovelace
  asset_policy_id?: string; // For native tokens (null for ADA)
  asset_name?: string; // For native tokens (null for ADA)
  last_updated_tx_id?: number; // Reference to last transaction that updated this
  created_at: Date;
  updated_at: Date;
}

export interface BalanceCreationAttributes
  extends Optional<BalanceAttributes, "id" | "created_at" | "updated_at"> {}
