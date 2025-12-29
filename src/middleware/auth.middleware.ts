// src/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from "express";
import { JwtUtil } from "../utils/jwt.util";
import { User } from "../models/user.model";
import environment from "../config/environment";

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    walletAddress: string;
  };
}

export const authenticateJWT = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const cookieName = environment.JWT.COOKIE_NAME || "auth_token";
    const token = req.cookies?.[cookieName];

    if (!token) {
      res
        .status(401)
        .json({ message: "Missing authentication token in cookies" });
      return;
    }

    const payload = JwtUtil.verifyToken(token);

    // ✅ Check if payload has required fields
    if (!payload.userId || !payload.walletAddress) {
      console.error("❌ Invalid payload structure:", payload);
      res.status(401).json({
        success: false,
        error: "Invalid token payload",
      });
      return;
    }

    // Verify user still exists and is active
    const user = await User.findByPk(payload.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // Attach user info to request
    req.user = {
      userId: payload.userId,
      walletAddress: payload.walletAddress,
    };

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};
