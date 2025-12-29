// src/models/transaction.model.ts
import { DataTypes, Model } from "sequelize";
import sequelize from "../config/db.config";
import {
  TransactionAttributes,
  TransactionCreationAttributes,
  TransactionType,
  TransactionStatus,
  TransactionLayer,
} from "../types/transaction.types";
import User from "./user.model";

export class Transaction
  extends Model<TransactionAttributes, TransactionCreationAttributes>
  implements TransactionAttributes
{
  public id!: number;
  public user_id!: number;
  public type!: TransactionType;
  public status!: TransactionStatus;
  public layer!: TransactionLayer;
  public amount!: number; // lovelace
  public fee!: number; // lovelace

  public asset_policy_id?: string | null;
  public asset_name?: string | null;

  public from_address?: string | null;
  public to_address?: string | null;
  public tx_hash?: string | null;
  public hydra_tx_id?: string | null;
  public locker_utxo?: string | null;

  public metadata?: object | null;
  public error_message?: string | null;

  // timestamps (explicit snake_case fields)
  public created_at!: Date;
  public updated_at!: Date;
  public completed_at?: Date | null;

  // associations
  public readonly user?: User;

  // --------- Helpers ---------

  public static async findByUserId(
    userId: number,
    limit: number = 50
  ): Promise<Transaction[]> {
    return this.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit,
    });
  }

  public static async findByTxHash(
    txHash: string
  ): Promise<Transaction | null> {
    return this.findOne({ where: { tx_hash: txHash } });
  }

  public static async findPending(userId?: number): Promise<Transaction[]> {
    const where: any = { status: TransactionStatus.PENDING };
    if (userId) where.user_id = userId;
    return this.findAll({ where, order: [["created_at", "ASC"]] });
  }

  public async markCompleted(txHash?: string | null): Promise<void> {
    this.status = TransactionStatus.COMPLETED;
    this.completed_at = new Date();
    if (txHash) this.tx_hash = txHash;
    await this.save();
  }

  public async markFailed(errorMessage: string): Promise<void> {
    this.status = TransactionStatus.FAILED;
    this.error_message = errorMessage;
    await this.save();
  }

  // override toJSON if you prefer to only expose snake_case timestamps
  public toJSON(): Partial<Transaction> {
    const values = { ...this.get() } as any;
    // remove any Sequelize internal fields if present
    delete values.createdAt;
    delete values.updatedAt;
    return values;
  }
}

Transaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    type: {
      type: DataTypes.ENUM(...Object.values(TransactionType)),
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(...Object.values(TransactionStatus)),
      allowNull: false,
      defaultValue: TransactionStatus.PENDING,
    },

    layer: {
      type: DataTypes.ENUM(...Object.values(TransactionLayer)),
      allowNull: false,
    },

    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: { min: 0 },
    },

    fee: {
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

    from_address: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    to_address: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    tx_hash: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },

    hydra_tx_id: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    locker_utxo: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },

    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },

    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // include snake_case timestamp columns so TypeScript ModelAttributes match your TransactionAttributes
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
    tableName: "transactions",
    // Disable Sequelize auto timestamps to avoid duplication of createdAt/updatedAt
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["tx_hash"] },
      { fields: ["status"] },
      { fields: ["type"] },
      { fields: ["created_at"] },
    ],
    hooks: {
      beforeCreate: (instance: Transaction) => {
        const now = new Date();
        (instance as any).created_at = now;
        (instance as any).updated_at = now;
      },
      beforeUpdate: (instance: Transaction) => {
        (instance as any).updated_at = new Date();
      },
    },
  }
);

// associations
Transaction.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(Transaction, { foreignKey: "user_id", as: "transactions" });

export default Transaction;
