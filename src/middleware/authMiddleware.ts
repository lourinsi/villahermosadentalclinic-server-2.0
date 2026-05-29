import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this-in-production";

export interface AuthRequest extends Request {
  user?: any;
}

// middleware to verify token and attach user info to request
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Allow seeding requests through without authentication
  if (req.body?.isSeeding === true && req.headers["x-seeding-key"] === "seeding-mode") {
    // Create a system admin user for seeding operations
    req.user = {
      id: "system-seeder",
      name: "System Seeder",
      username: "seeder",
      role: "admin",
      email: "seeder@system.local"
    };
    return next();
  }

  const token = (req as any).cookies?.authToken || req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Authentication token missing" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    console.error("[AUTH MIDDLEWARE] token error", err);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

// middleware factory to enforce one of the provided roles
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Permission denied" });
    }
    next();
  };
};
