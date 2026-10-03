import { Request, Response, NextFunction } from "express";
import { db } from "../db/database";
import { UserPlan } from "../config/dailyLimitsConfig";

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  name: string;
  isGuest: boolean;
  tier: UserPlan;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Extracts session token and populates req.user.
 * Seamlessly supports both Guest Mode and Registered User sessions.
 */
export async function authenticateSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)rsr_session=([^;]+)/);
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }

    if (token) {
      const session = await db.getSession(token);
      if (session) {
        const user = await db.findUserById(session.userId);
        if (user) {
          const effectiveTier = user.isGuest ? "guest" : (await db.getUserEffectiveTier(user.id));
          req.user = {
            userId: user.id,
            email: user.email,
            name: user.name,
            isGuest: user.isGuest,
            tier: effectiveTier,
          };
          return next();
        }
      }
    }

    // Default to Guest context with session identifier or IP-derived guest ID
    const guestSessionHeader = req.headers["x-guest-session"] as string;
    const guestCookie = req.headers.cookie?.match(/(?:^|;\s*)rsr_guest=([^;]+)/)?.[1];
    const guestSession = guestSessionHeader || guestCookie;

    const forwarded = req.headers["x-forwarded-for"] as string;
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "local";
    const guestHash = Buffer.from(clientIp).toString("hex").slice(0, 12);
    const guestUserId = guestSession ? `guest_${guestSession}` : `guest_${guestHash}`;

    req.user = {
      userId: guestUserId,
      name: "Guest User",
      isGuest: true,
      tier: "guest",
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guard middleware for routes requiring a registered, non-guest account.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.isGuest) {
    res.status(401).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "You must be signed in to perform this action.",
      },
    });
    return;
  }
  next();
}
