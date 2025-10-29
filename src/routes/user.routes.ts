import { Router, Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import User from "../models/user.model";
import Balance from "../models/balance.model";
import environment from "../config/environment";
import { authenticateToken } from "../middleware/auth.middleware";
import { generateJWTToken, setAuthCookie } from "../utils/helper";

const router = Router();

// JWT Secret - should be in environment variables
const JWT_SECRET = environment.JWT.SECRET || "your-secret-key-change-this";
const JWT_EXPIRES_IN = "1d";

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }
  next();
};

export const createUserRoutes = () => {
  /**
   * POST /api/users/register
   * Register a new user
   */
  router.post(
    "/register",
    [
      body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Valid email required"),
      body("password")
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters"),
      body("wallet_address")
        .optional()
        .isString()
        .withMessage("Wallet address must be a string"),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { email, password, wallet_address } = req.body;

        // create username from email prefix
        const username = req.body.username || email.split("@")[0];
        console.log(username);

        // Check if user exists (including soft-deleted)
        const existingEmail = await User.findOne({
          where: { email },
          paranoid: false, // Include soft-deleted users
        });

        if (existingEmail) {
          if (existingEmail.deletedAt) {
            // User was soft-deleted, restore and update
            await existingEmail.restore();

            // Update with new information
            existingEmail.username = username;
            existingEmail.password = password; // Will be hashed by beforeUpdate hook
            if (wallet_address) {
              existingEmail.wallet_address = wallet_address;
            }
            await existingEmail.save();

            // Generate and set JWT token
            const token = generateJWTToken(existingEmail);
            setAuthCookie(res, token);

            return res.status(201).json({
              success: true,
              message: "Account restored and updated successfully",
            });
          }

          return res.status(400).json({
            success: false,
            error: "Email already registered",
          });
        }

        const existingUsername = await User.findOne({
          where: { username },
          paranoid: false,
        });

        if (existingUsername) {
          if (existingUsername.deletedAt) {
            return res.status(400).json({
              success: false,
              error:
                "Username was previously used by a deleted account. Please choose a different username or contact support to restore your account.",
            });
          }

          return res.status(400).json({
            success: false,
            error: "Username already taken",
          });
        }

        if (wallet_address) {
          const existingWallet = await User.findOne({
            where: { wallet_address },
            paranoid: false,
          });

          if (existingWallet) {
            if (existingWallet.deletedAt) {
              return res.status(400).json({
                success: false,
                error:
                  "Wallet address was previously used by a deleted account. Please use a different wallet or contact support.",
              });
            }

            return res.status(400).json({
              success: false,
              error: "Wallet address already registered",
            });
          }
        }

        // Create new user
        const user = await User.create({
          email,
          username,
          password,
          wallet_address,
        });

        // Generate and set JWT token
        const token = generateJWTToken(user);
        setAuthCookie(res, token);

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          data: {
            user: user.toJSON(),
            token,
          },
        });
      } catch (error: any) {
        console.error("Registration error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to register user",
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/users/login
   * Login user
   */
  router.post(
    "/login",
    [
      body("email").notEmpty().withMessage("Email required"),
      body("password").notEmpty().withMessage("Password required"),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const { email, password } = req.body;

        // Find user by email or username
        let user = await User.findByEmail(email);
        if (!user) {
          user = await User.findByUsername(email);
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            error: "Invalid credentials",
          });
        }

        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            error: "Invalid credentials",
          });
        }

        // If admin found, it means it is admin trying to sign in
        // 2. Create JWT
        const token = generateJWTToken({
          role: user.role,
          id: user.id,
          email: user.email,
        });

        // 3. Set cookie
        setAuthCookie(res, token);

        // 4. Respond
        res.status(200).json({
          message: "User signed in successfully",
          role: user.role,
          id: user.id,
          email: user.email,
          success: true,
        });
      } catch (error: any) {
        console.error("Login error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to login",
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/users/logout
   * Logout user
   */
  router.post(
    "/logout",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        // For JWT, logout is handled client-side by deleting the token.
        // Optionally, implement token blacklisting here.
        const cookieName = environment.JWT.COOKIE_NAME || "token";

        // Clear the cookie
        res.clearCookie(cookieName, {
          httpOnly: true,
          secure: environment.NODE_ENV === "production",
          sameSite: "lax",
        });

        res.json({
          success: true,
          message: "Logout successful",
        });
      } catch (error: any) {
        console.error("Logout error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to logout",
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/users/me
   * Get current user profile
   */
  router.get("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const user = await User.findByPk(userId, {
        include: [
          {
            model: Balance,
            as: "balances",
          },
        ],
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      res.json({
        success: true,
        data: {
          user: user.toJSON(),
        },
      });
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user profile",
        message: error.message,
      });
    }
  });

  /**
   * GET /api/users/:id
   * Get user by ID (public info only)
   */
  router.get(
    "/:id",
    [param("id").isInt().withMessage("Valid user ID required")],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const userId = parseInt(req.params.id);

        const user = await User.findByPk(userId, {
          attributes: ["id", "username", "wallet_address", "created_at"],
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        res.json({
          success: true,
          data: {
            user: user.toJSON(),
          },
        });
      } catch (error: any) {
        console.error("Get user error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to get user",
          message: error.message,
        });
      }
    }
  );

  /**
   * PUT /api/users/me
   * Update current user profile
   */
  router.put(
    "/me",
    authenticateToken,
    [
      body("email")
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage("Valid email required"),
      body("username")
        .optional()
        .isLength({ min: 3, max: 50 })
        .isAlphanumeric()
        .withMessage("Username must be 3-50 alphanumeric characters"),
      body("wallet_address")
        .optional()
        .isString()
        .withMessage("Wallet address must be a string"),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.id;
        const { email, username, wallet_address } = req.body;

        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        // Check for duplicate email
        if (email && email !== user.email) {
          const existingEmail = await User.findByEmail(email);
          if (existingEmail) {
            return res.status(400).json({
              success: false,
              error: "Email already in use",
            });
          }
          user.email = email;
        }

        // Check for duplicate username
        if (username && username !== user.username) {
          const existingUsername = await User.findByUsername(username);
          if (existingUsername) {
            return res.status(400).json({
              success: false,
              error: "Username already taken",
            });
          }
          user.username = username;
        }

        // Check for duplicate wallet
        if (wallet_address && wallet_address !== user.wallet_address) {
          const existingWallet = await User.findByWalletAddress(wallet_address);
          if (existingWallet) {
            return res.status(400).json({
              success: false,
              error: "Wallet address already in use",
            });
          }
          user.wallet_address = wallet_address;
        }

        await user.save();

        res.json({
          success: true,
          message: "Profile updated successfully",
          data: {
            user: user.toJSON(),
          },
        });
      } catch (error: any) {
        console.error("Update profile error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to update profile",
          message: error.message,
        });
      }
    }
  );

  /**
   * PUT /api/users/me/password
   * Change user password
   */
  router.put(
    "/me/password",
    authenticateToken,
    [
      body("currentPassword")
        .notEmpty()
        .withMessage("Current password required"),
      body("newPassword")
        .isLength({ min: 6 })
        .withMessage("New password must be at least 6 characters"),
    ],
    validateRequest,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.id;
        const { currentPassword, newPassword } = req.body;

        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        // Verify current password
        const isValidPassword = await user.comparePassword(currentPassword);
        if (!isValidPassword) {
          return res.status(401).json({
            success: false,
            error: "Current password is incorrect",
          });
        }

        // Update password
        user.password = newPassword; // Will be hashed by beforeUpdate hook
        await user.save();

        res.json({
          success: true,
          message: "Password changed successfully",
        });
      } catch (error: any) {
        console.error("Change password error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to change password",
          message: error.message,
        });
      }
    }
  );

  // In your routes, use camelCase for timestamp fields
  router.delete(
    "/me",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.id;

        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({
            success: false,
            error: "User not found",
          });
        }

        console.log("Before destroy:", {
          id: user.id,
          username: user.username,
          deletedAt: user.deletedAt, // camelCase now
        });

        // Soft delete
        await user.destroy();

        // Reload to see the updated deletedAt value
        await user.reload({ paranoid: false });

        console.log("After destroy:", {
          id: user.id,
          username: user.username,
          deletedAt: user.deletedAt, // camelCase now
        });

        res.json({
          success: true,
          message: "Account deleted successfully",
        });
      } catch (error: any) {
        console.error("Delete account error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to delete account",
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/users
   * List users (admin only - optional, for future use)
   */
  router.get("/", authenticateToken, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const { count, rows: users } = await User.findAndCountAll({
        attributes: ["id", "username", "wallet_address", "created_at"],
        limit,
        offset,
        order: [["created_at", "DESC"]],
      });

      res.json({
        success: true,
        data: {
          users: users.map((u) => u.toJSON()),
          pagination: {
            total: count,
            page,
            limit,
            totalPages: Math.ceil(count / limit),
          },
        },
      });
    } catch (error: any) {
      console.error("List users error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to list users",
        message: error.message,
      });
    }
  });

  return router;
};

export default createUserRoutes;
