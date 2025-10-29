import { SignOptions } from "jsonwebtoken";
import environment from "../config/environment";
import jwt from "jsonwebtoken";
import { Response } from "express";

export interface JWTPayload {
  role: string;
  id?: number;
  email?: string;
}

export function generateJWTToken({ role, id, email }: JWTPayload): string {
  const payload: JWTPayload = { role };
  if (id) payload.id = id;
  if (email) payload.email = email;

  const secret = environment.JWT.SECRET!;
  const options: SignOptions = { expiresIn: "1d" };
  return jwt.sign(payload, secret, options);
}

/**
 * Generate a Cookie string for the JWT token
 */
export function setAuthCookie(res: Response, token: string): void {
  const cookieName = environment.JWT.COOKIE_NAME || "token";
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: environment.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000, // 1 day in milliseconds
  });
}
