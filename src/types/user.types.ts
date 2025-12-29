import { Optional } from "sequelize";

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
}

export interface UserAttributes {
  id: number;
  email: string;
  username: string;
  password: string;
  role: UserRole;
  wallet_address?: string | null;

  // timestamps (Sequelize-managed)
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | "id"
    | "role"
    | "wallet_address"
    | "created_at"
    | "updated_at"
    | "deleted_at"
  > {}
