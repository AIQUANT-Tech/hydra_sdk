// src/routes/auth.routes.ts

import { Response, Router } from "express";
import { User } from "../models/user.model";
import { JwtUtil } from "../utils/jwt.util";
import { authenticateJWT, AuthRequest } from "../middleware/auth.middleware";

export const authRoutes = () => {
  const router = Router();
  // POST /api/auth/connect - Connect wallet and get JWT
  router.post("/connect", async (req, res) => {
    try {
      const { walletAddress } = req.body;

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: "Wallet address is required",
        });
        return;
      }

      let user = await User.findOne({ where: { walletAddress } });
      let newUser = false;
      if (!user) {
        user = await User.create({
          walletAddress,
          lastLoginAt: new Date(),
        });
        newUser = true;
        console.log(`✅ New user created: ${walletAddress}`);
      } else {
        await user.update({ lastLoginAt: new Date() });
        console.log(`✅ User logged in: ${walletAddress}`);
      }

      // ✅ Use .get() to access properties safely
      const userId = user.get("id") as number;
      const userWalletAddress = user.get("walletAddress") as string;

      const tokenPayload = {
        userId,
        walletAddress: userWalletAddress,
      };

      const token = JwtUtil.generateToken(tokenPayload);

      JwtUtil.setAuthCookie(res, token);

      res.json({
        success: true,
        user: {
          id: userId,
          walletAddress: userWalletAddress,
          displayName: user.get("displayName"),
          email: user.get("email"),
          avatarUrl: user.get("avatarUrl"),
          bio: user.get("bio"),
          createdAt: user.get("createdAt"),
        },
        isNewUser: newUser,
      });
    } catch (error) {
      console.error("Auth error:", error);
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // GET /api/auth/me - Get current user info (protected)
  router.get("/me", authenticateJWT, async (req: AuthRequest, res) => {
    try {
      const user = await User.findByPk(req.user!.userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // PUT /api/auth/profile - Update user profile (protected)
  router.put("/profile", authenticateJWT, async (req: AuthRequest, res) => {
    try {
      const { displayName, email, avatarUrl, bio } = req.body;

      const user = await User.findByPk(req.user!.userId);

      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      // Update only provided fields
      const updates: Partial<User> = {};
      if (displayName !== undefined) updates.displayName = displayName;
      if (email !== undefined) updates.email = email;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (bio !== undefined) updates.bio = bio;

      await user.update(updates);

      res.json({
        success: true,
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          displayName: user.displayName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
        },
        message: "Profile updated successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  });

  // POST /api/auth/logout - Logout
  router.post(
    "/logout",
    authenticateJWT, // Keep this middleware
    async (req: AuthRequest, res: Response) => {
      try {
        // Clear the cookie using the utility method
        JwtUtil.clearAuthCookie(res);

        res.json({
          success: true,
          message: "Logged out successfully",
        });
      } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to logout",
        });
      }
    }
  );

  return router;
};
