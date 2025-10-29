import { NextFunction, Request, Response } from "express";
import environment from "../config/environment";
import jwt from "jsonwebtoken";

// Auth middleware - verify JWT token
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Grab the token from cookies (default cookie name: 'token', can be overridden)
  const cookieName = environment.JWT.COOKIE_NAME || "token";
  const token = req.cookies?.[cookieName];

  if (!token) {
    res
      .status(401)
      .json({ message: "Missing authentication token in cookies" });
    return;
  }

  try {
    const decoded = jwt.verify(token, environment.JWT.SECRET) as any;
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};
