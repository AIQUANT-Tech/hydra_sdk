import { Optional } from "sequelize";

export enum BalanceType {
  AVAILABLE = "available", // can be used for trading/withdrawals
  LOCKED = "locked", // locked for orders / in-progress operations
  RESERVED = "reserved", // reserved for fees or other purposes
}

export interface BalanceAttributes {
  id: number;
  user_id: number;
  type: BalanceType;
  amount: number; // in lovelace or token units (be consistent across services)
  asset_policy_id?: string | null; // null for ADA
  asset_name?: string | null; // null for ADA
  last_updated_tx_id?: number | null;

  created_at: Date;
  updated_at: Date;
}

export interface BalanceCreationAttributes
  extends Optional<
    BalanceAttributes,
    "id" | "last_updated_tx_id" | "created_at" | "updated_at"
  > {}
