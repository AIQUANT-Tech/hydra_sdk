import {
  DataTypes,
  Model,
  Transaction as SequelizeTransaction,
  Op,
  WhereOptions,
} from "sequelize";
import sequelize from "../config/db.config";
import {
  BalanceAttributes,
  BalanceCreationAttributes,
  BalanceType,
} from "../types/balance.types";
import { User } from "./user.model";
import Transaction from "./transaction.model";

export class Balance
  extends Model<BalanceAttributes, BalanceCreationAttributes>
  implements BalanceAttributes
{
  public id!: number;
  public user_id!: number;
  public type!: BalanceType;
  public amount!: number;
  public asset_policy_id?: string;
  public asset_name?: string;
  public last_updated_tx_id?: number;
  public created_at!: Date;
  public updated_at!: Date;

  // Associations
  public readonly user?: User;
  public readonly last_transaction?: Transaction;

  // Get user's available ADA balance
  public static async getAvailableBalance(userId: number): Promise<number> {
    const balance = await this.findOne({
      where: {
        user_id: userId,
        type: BalanceType.AVAILABLE,
        [Op.or]: [
          { asset_policy_id: null },
          { asset_policy_id: { [Op.is]: null } },
        ],
      } as WhereOptions<BalanceAttributes>,
    });
    return balance?.amount || 0;
  }

  // Get user's locked ADA balance
  public static async getLockedBalance(userId: number): Promise<number> {
    const balance = await this.findOne({
      where: {
        user_id: userId,
        type: BalanceType.LOCKED,
        [Op.or]: [
          { asset_policy_id: null },
          { asset_policy_id: { [Op.is]: null } },
        ],
      } as WhereOptions<BalanceAttributes>,
    });
    return balance?.amount || 0;
  }

  // Get user's total balance (all types)
  public static async getTotalBalance(userId: number): Promise<number> {
    const balances = await this.findAll({
      where: {
        user_id: userId,
        [Op.or]: [
          { asset_policy_id: null },
          { asset_policy_id: { [Op.is]: null } },
        ],
      } as WhereOptions<BalanceAttributes>,
    });
    return balances.reduce((sum, b) => sum + b.amount, 0);
  }

  // Get all balances for a user (including native tokens)
  public static async getUserBalances(userId: number): Promise<Balance[]> {
    return this.findAll({
      where: { user_id: userId },
      order: [["type", "ASC"]],
    });
  }

  // Add amount to balance
  public static async addBalance(
    userId: number,
    amount: number,
    type: BalanceType = BalanceType.AVAILABLE,
    transactionId?: number,
    transaction?: SequelizeTransaction
  ): Promise<Balance> {
    const [balance] = await this.findOrCreate({
      where: {
        user_id: userId,
        type,
        [Op.or]: [
          { asset_policy_id: null },
          { asset_policy_id: { [Op.is]: null } },
        ],
      } as WhereOptions<BalanceAttributes>,
      defaults: {
        user_id: userId,
        type,
        amount: 0,
      },
      transaction,
    });

    balance.amount += amount;
    if (transactionId) {
      balance.last_updated_tx_id = transactionId;
    }
    await balance.save({ transaction });

    return balance;
  }

  // Subtract amount from balance
  public static async subtractBalance(
    userId: number,
    amount: number,
    type: BalanceType = BalanceType.AVAILABLE,
    transactionId?: number,
    transaction?: SequelizeTransaction
  ): Promise<Balance> {
    const balance = await this.findOne({
      where: {
        user_id: userId,
        type,
        [Op.or]: [
          { asset_policy_id: null },
          { asset_policy_id: { [Op.is]: null } },
        ],
      } as WhereOptions<BalanceAttributes>,
      transaction,
    });

    if (!balance) {
      throw new Error("Balance not found");
    }

    if (balance.amount < amount) {
      throw new Error("Insufficient balance");
    }

    balance.amount -= amount;
    if (transactionId) {
      balance.last_updated_tx_id = transactionId;
    }
    await balance.save({ transaction });

    return balance;
  }

  // Lock balance (move from available to locked)
  public static async lockBalance(
    userId: number,
    amount: number,
    transactionId?: number
  ): Promise<void> {
    await sequelize.transaction(async (t) => {
      await this.subtractBalance(
        userId,
        amount,
        BalanceType.AVAILABLE,
        transactionId,
        t
      );
      await this.addBalance(
        userId,
        amount,
        BalanceType.LOCKED,
        transactionId,
        t
      );
    });
  }

  // Unlock balance (move from locked to available)
  public static async unlockBalance(
    userId: number,
    amount: number,
    transactionId?: number
  ): Promise<void> {
    await sequelize.transaction(async (t) => {
      await this.subtractBalance(
        userId,
        amount,
        BalanceType.LOCKED,
        transactionId,
        t
      );
      await this.addBalance(
        userId,
        amount,
        BalanceType.AVAILABLE,
        transactionId,
        t
      );
    });
  }

  // Transfer balance between users
  public static async transferBalance(
    fromUserId: number,
    toUserId: number,
    amount: number,
    transactionId?: number
  ): Promise<void> {
    await sequelize.transaction(async (t) => {
      await this.subtractBalance(
        fromUserId,
        amount,
        BalanceType.AVAILABLE,
        transactionId,
        t
      );
      await this.addBalance(
        toUserId,
        amount,
        BalanceType.AVAILABLE,
        transactionId,
        t
      );
    });
  }
}

// Initialize model
Balance.init(
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
      type: DataTypes.ENUM(...Object.values(BalanceType)),
      allowNull: false,
    },
    amount: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
    asset_policy_id: {
      type: DataTypes.STRING(56),
      allowNull: true,
      comment: "Policy ID for native tokens, null for ADA",
    },
    asset_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Asset name for native tokens, null for ADA",
    },
    last_updated_tx_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "transactions",
        key: "id",
      },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "balances",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ["user_id"],
      },
      {
        fields: ["type"],
      },
      {
        fields: ["user_id", "type", "asset_policy_id"],
      },
    ],
  }
);

// Define associations
Balance.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

User.hasMany(Balance, {
  foreignKey: "user_id",
  as: "balances",
});

Balance.belongsTo(Transaction, {
  foreignKey: "last_updated_tx_id",
  as: "last_transaction",
});

export default Balance;
