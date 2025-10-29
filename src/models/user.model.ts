import {
  DataTypes,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from "sequelize";
import bcrypt from "bcrypt";
import sequelize from "../config/db.config";
import { UserRole } from "../types/user.types";

// User model class with camelCase for TypeScript compatibility
export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  // Regular attributes
  declare id: CreationOptional<number>;
  declare email: string;
  declare username: string;
  declare password: string;
  declare role: CreationOptional<UserRole>;
  declare wallet_address: string | null;
  declare balance: CreationOptional<number>;

  // Timestamp attributes - use camelCase names in TypeScript
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;

  // Instance method to check password
  public async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // Override toJSON to exclude sensitive fields
  public toJSON(): Partial<User> {
    const values = { ...this.get() };
    delete (values as any).password;
    return values;
  }

  // Static method to find by email
  public static async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
  }

  // Static method to find by username
  public static async findByUsername(username: string): Promise<User | null> {
    return this.findOne({ where: { username } });
  }

  // Static method to find by wallet address
  public static async findByWalletAddress(
    walletAddress: string
  ): Promise<User | null> {
    return this.findOne({ where: { wallet_address: walletAddress } });
  }
}

// Initialize model
User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        len: [3, 50],
        isAlphanumeric: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        len: [6, 255],
      },
    },
    role: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      defaultValue: UserRole.USER,
      allowNull: false,
    },
    wallet_address: {
      type: DataTypes.STRING(200),
      allowNull: true,
      unique: true,
    },
    balance: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
    },
    // Add timestamp fields in camelCase
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "created_at", // Map to snake_case column name in database
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "updated_at", // Map to snake_case column name in database
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "deleted_at", // Map to snake_case column name in database
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    underscored: true, // This converts createdAt -> created_at automatically
    paranoid: true,
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user: User) => {
        if (user.changed("password")) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  }
);

export default User;
