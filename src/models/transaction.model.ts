import { DataTypes, Model } from "sequelize";
import sequelize from "../config/db.config";
import {
  TransactionAttributes,
  TransactionCreationAttributes,
  TransactionType,
  TransactionStatus,
  TransactionLayer,
} from "../types/transaction.types";
import { User } from "./user.model";

export class Transaction
  extends Model<TransactionAttributes, TransactionCreationAttributes>
  implements TransactionAttributes
{
  public id!: number;
  public user_id!: number;
  public type!: TransactionType;
  public status!: TransactionStatus;
  public layer!: TransactionLayer;
  public amount!: number;
  public fee!: number;
  public from_address?: string;
  public to_address?: string;
  public tx_hash?: string;
  public hydra_tx_id?: string;
  public metadata?: object;
  public error_message?: string;
  public created_at!: Date;
  public updated_at!: Date;
  public completed_at?: Date;

  // Association with User
  public readonly user?: User;

  // Static method to find by user
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

  // Static method to find by tx hash
  public static async findByTxHash(
    txHash: string
  ): Promise<Transaction | null> {
    return this.findOne({ where: { tx_hash: txHash } });
  }

  // Static method to find pending transactions
  public static async findPending(userId?: number): Promise<Transaction[]> {
    const where: any = { status: TransactionStatus.PENDING };
    if (userId) where.user_id = userId;

    return this.findAll({
      where,
      order: [["created_at", "ASC"]],
    });
  }

  // Instance method to mark as completed
  public async markCompleted(txHash?: string): Promise<void> {
    this.status = TransactionStatus.COMPLETED;
    this.completed_at = new Date();
    if (txHash) this.tx_hash = txHash;
    await this.save();
  }

  // Instance method to mark as failed
  public async markFailed(errorMessage: string): Promise<void> {
    this.status = TransactionStatus.FAILED;
    this.error_message = errorMessage;
    await this.save();
  }
}

// Initialize model
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
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    type: {
      type: DataTypes.ENUM(...Object.values(TransactionType)),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(TransactionStatus)),
      defaultValue: TransactionStatus.PENDING,
      allowNull: false,
    },
    layer: {
      type: DataTypes.ENUM(...Object.values(TransactionLayer)),
      allowNull: false,
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    fee: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
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
      type: DataTypes.STRING(100),
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
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "transactions",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["tx_hash"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["type"],
      },
      {
        fields: ["created_at"],
      },
    ],
  }
);

// Define associations
Transaction.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

User.hasMany(Transaction, {
  foreignKey: "user_id",
  as: "transactions",
});

export default Transaction;
