// src/models/balance.model.ts

import {
  DataTypes,
  Model,
  Optional,
  Transaction as SequelizeTx,
} from "sequelize";
import sequelize from "../config/db.config";
import { BalanceType } from "../types/balance.types";

export interface BalanceAttributes {
  id: number;
  user_id: number;

  type: BalanceType; // AVAILABLE, LOCKED, etc.
  amount: number;

  asset_policy_id?: string | null;
  asset_name?: string | null;

  created_at: Date;
  updated_at: Date;
}

export interface BalanceCreationAttributes
  extends Optional<
    BalanceAttributes,
    "id" | "asset_policy_id" | "asset_name" | "created_at" | "updated_at"
  > {}

export class Balance
  extends Model<BalanceAttributes, BalanceCreationAttributes>
  implements BalanceAttributes
{
  declare id: number;
  declare user_id: number;
  declare type: BalanceType;
  declare amount: number;

  declare asset_policy_id: string | null;
  declare asset_name: string | null;

  declare created_at: Date;
  declare updated_at: Date;

  // ─────────────────────────────────────────────
  // STATIC HELPERS
  // ─────────────────────────────────────────────

  static async getAvailableBalance(
    userId: number,
    policyId: string | null,
    assetName: string | null
  ): Promise<number> {
    const row = await Balance.findOne({
      where: {
        user_id: userId,
        type: BalanceType.AVAILABLE,
        asset_policy_id: policyId,
        asset_name: assetName,
      },
    });

    return row ? row.amount : 0;
  }

  // atomic add
  static async addBalance(
    userId: number,
    amount: number,
    type: BalanceType,
    txId: number | null,
    t: SequelizeTx,
    policyId: string | null = null,
    assetName: string | null = null
  ) {
    return Balance.upsertRow(
      userId,
      amount,
      type,
      txId,
      t,
      policyId,
      assetName,
      true
    );
  }

  // atomic subtract
  static async subtractBalance(
    userId: number,
    amount: number,
    type: BalanceType,
    txId: number | null,
    t: SequelizeTx,
    policyId: string | null = null,
    assetName: string | null = null
  ) {
    return Balance.upsertRow(
      userId,
      -amount,
      type,
      txId,
      t,
      policyId,
      assetName,
      true
    );
  }

  // core upsert
  static async upsertRow(
    userId: number,
    delta: number,
    type: BalanceType,
    txId: number | null,
    t: SequelizeTx,
    policyId: string | null,
    assetName: string | null,
    allowNegative = false
  ) {
    const row = await Balance.findOne({
      where: {
        user_id: userId,
        type,
        asset_policy_id: policyId,
        asset_name: assetName,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!row) {
      if (delta < 0 && !allowNegative) {
        throw new Error("Insufficient balance");
      }

      return Balance.create(
        {
          user_id: userId,
          type,
          amount: Math.max(delta, 0),
          asset_policy_id: policyId,
          asset_name: assetName,
        },
        { transaction: t }
      );
    }

    const newAmount = row.amount + delta;
    if (newAmount < 0 && !allowNegative) {
      throw new Error("Insufficient balance");
    }

    row.amount = newAmount;
    await row.save({ transaction: t });

    return row;
  }
}

// ─────────────────────────────────────────────
// MODEL INIT (FIXED FOR TIMESTAMPS)
// ─────────────────────────────────────────────

Balance.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    type: {
      type: DataTypes.ENUM(...Object.values(BalanceType)),
      allowNull: false,
    },

    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
    },

    asset_policy_id: {
      type: DataTypes.STRING(56),
      allowNull: true,
    },

    asset_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },

    // ✔ REQUIRED FOR NOT NULL FIX
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "balances",
    underscored: true,
    timestamps: true, // Sequelize auto-updates updated_at
    indexes: [
      { fields: ["user_id"] },
      { fields: ["type"] },
      { fields: ["asset_policy_id", "asset_name"] },
    ],
  }
);

export default Balance;
