// src/utils/jwt.util.ts

import jwt from "jsonwebtoken";
import environment from "../config/environment";
import { Response } from "express";

const JWT_SECRET =
  environment.JWT.SECRET || "your-super-secret-key-change-this";
const JWT_EXPIRES_IN = "7d"; // 7 days

export interface JwtPayload {
  userId: number;
  walletAddress: string;
}

export class JwtUtil {
  static generateToken(payload: JwtPayload): string {
    // ✅ Make sure to pass the payload object correctly
    return jwt.sign(
      {
        userId: payload.userId, // ✅ Explicitly include userId
        walletAddress: payload.walletAddress, // ✅ Explicitly include walletAddress
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRES_IN,
      }
    );
  }

  static verifyToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      // ✅ Extract and return only the payload we need
      return {
        userId: decoded.userId,
        walletAddress: decoded.walletAddress,
      };
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  static decodeToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (!decoded || !decoded.userId || !decoded.walletAddress) {
        return null;
      }
      return {
        userId: decoded.userId,
        walletAddress: decoded.walletAddress,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Set authentication cookie with proper settings
   */
  public static setAuthCookie(res: Response, token: string): void {
    const cookieName = environment.JWT.COOKIE_NAME || "auth_token";
    const isProduction = environment.NODE_ENV === "production";

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  /**
   * Clear authentication cookie
   */
  public static clearAuthCookie(res: Response): void {
    const cookieName = environment.JWT.COOKIE_NAME || "auth_token";
    const isProduction = environment.NODE_ENV === "production";

    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      path: "/",
    });
  }
}
