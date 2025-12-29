// src/models/user.model.ts

import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/db.config";

// Define attributes interface
export interface UserAttributes {
  id: number;
  walletAddress: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Define creation attributes (id is optional on creation)
interface UserCreationAttributes extends Optional<UserAttributes, "id"> {}

// ✅ FIX: Remove class field declarations - let Sequelize manage them
export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  // ✅ Only declare types, don't initialize values
  declare id: number;
  declare walletAddress: string;
  declare displayName?: string;
  declare email?: string;
  declare avatarUrl?: string;
  declare bio?: string;
  declare lastLoginAt?: Date;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    walletAddress: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: "wallet_address",
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "display_name",
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    avatarUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: "avatar_url",
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_login_at",
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    underscored: true,
  }
);

export default User;
