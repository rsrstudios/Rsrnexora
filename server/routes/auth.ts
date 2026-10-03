import { Router } from "express";
import { db } from "../db/database";
import { hashPassword, verifyPassword, generateSessionToken } from "../security/crypto";
import { sanitizeEmail } from "../security/sanitizer";
import { authRateLimiter } from "../middleware/rateLimiter";
import { config } from "../config/env";

export const authRouter = Router();

// Apply strict rate limiting on all auth attempts
authRouter.use(authRateLimiter);

// POST /api/auth/register - Secure Account Registration
authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password, name, confirmPassword } = req.body;

    const rawEmail = typeof email === "string" ? email.trim() : "";
    const rawPassword = typeof password === "string" ? password : "";

    // 1. Missing fields check
    if (!rawEmail || !rawPassword) {
      res.status(400).json({
        error: {
          code: "MISSING_FIELDS",
          message: "Please provide both an email address and a password.",
        },
      });
      return;
    }

    // 2. Validate email format
    const cleanEmail = sanitizeEmail(rawEmail);
    if (!cleanEmail) {
      res.status(400).json({
        error: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address.",
        },
      });
      return;
    }

    // 3. Confirm password validation (when provided)
    if (confirmPassword !== undefined && confirmPassword !== rawPassword) {
      res.status(400).json({
        error: {
          code: "PASSWORD_MISMATCH",
          message: "Passwords do not match. Please verify both passwords.",
        },
      });
      return;
    }

    // 4. Password strength / length requirements
    if (rawPassword.length < 8) {
      res.status(400).json({
        error: {
          code: "WEAK_PASSWORD",
          message: "Password must be at least 8 characters long.",
        },
      });
      return;
    }

    if (rawPassword.length > 128) {
      res.status(400).json({
        error: {
          code: "PASSWORD_TOO_LONG",
          message: "Password exceeds maximum allowable length of 128 characters.",
        },
      });
      return;
    }

    // 5. Duplicate account check
    const existingUser = await db.findUserByEmail(cleanEmail);
    if (existingUser) {
      res.status(409).json({
        error: {
          code: "USER_ALREADY_EXISTS",
          message: "An account with this email address already exists.",
        },
      });
      return;
    }

    // 6. Cryptographic Salt & Hash using scrypt
    const { hash, salt } = await hashPassword(rawPassword);
    const displayName = (typeof name === "string" && name.trim()) ? name.trim().slice(0, 50) : cleanEmail.split("@")[0];

    let user;
    try {
      user = await db.createUser({
        email: cleanEmail,
        name: displayName,
        passwordHash: hash,
        passwordSalt: salt,
        isGuest: false,
      });
    } catch (dbErr: any) {
      console.error("[Auth] Database user creation error:", dbErr?.message || dbErr);
      if (dbErr?.message && dbErr.message.includes("already exists")) {
        res.status(409).json({
          error: {
            code: "USER_ALREADY_EXISTS",
            message: "An account with this email address already exists.",
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: "DATABASE_ERROR",
          message: "Account creation failed due to a database error. Please try again.",
        },
      });
      return;
    }

    // 7. Create session token
    const token = generateSessionToken();
    const forwarded = req.headers["x-forwarded-for"] as string;
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";

    try {
      await db.createSession({
        userId: user.id,
        token,
        maxAgeMs: config.sessionMaxAgeMs,
        ipAddress,
        userAgent: req.headers["user-agent"] || "unknown",
      });
    } catch (sessErr: any) {
      console.error("[Auth] Session creation error:", sessErr?.message || sessErr);
      res.status(500).json({
        error: {
          code: "SESSION_CREATION_FAILED",
          message: "Account created, but session could not be established. Please sign in.",
        },
      });
      return;
    }

    res.cookie("rsr_session", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.sessionMaxAgeMs,
    });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isGuest: false,
        syncEnabled: true,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/guest - Initialize or verify guest session
authRouter.post("/guest", async (req, res, next) => {
  try {
    const token = generateSessionToken();
    const guestUser = await db.createUser({
      name: "Guest User",
      isGuest: true,
    });
    const forwarded = req.headers["x-forwarded-for"] as string;
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";
    await db.createSession({
      userId: guestUser.id,
      token,
      maxAgeMs: config.sessionMaxAgeMs,
      ipAddress,
      userAgent: req.headers["user-agent"] || "unknown",
    });

    res.cookie("rsr_session", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.sessionMaxAgeMs,
    });

    res.json({
      success: true,
      token,
      user: {
        id: guestUser.id,
        name: guestUser.name,
        isGuest: true,
        syncEnabled: false,
        createdAt: guestUser.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login - Secure Login with constant-time verification
authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const cleanEmail = sanitizeEmail(email);
    if (!cleanEmail || !password || typeof password !== "string") {
      res.status(400).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Please provide both valid email and password.",
        },
      });
      return;
    }

    const user = await db.findUserByEmail(cleanEmail);
    if (!user) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    const isValid = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!isValid) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    // Issue new session token
    const token = generateSessionToken();
    const forwarded = req.headers["x-forwarded-for"] as string;
    const ipAddress = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "unknown";

    await db.createSession({
      userId: user.id,
      token,
      maxAgeMs: config.sessionMaxAgeMs,
      ipAddress,
      userAgent: req.headers["user-agent"] || "unknown",
    });

    res.cookie("rsr_session", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: config.sessionMaxAgeMs,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isGuest: false,
        syncEnabled: true,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout - Invalidate Session
authRouter.post("/logout", async (req, res, next) => {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)rsr_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (token) {
      await db.deleteSession(token);
    }

    res.clearCookie("rsr_session", {
      httpOnly: true,
      sameSite: "lax",
    });

    res.json({ success: true, message: "Logged out successfully." });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/session - Verify current session or report guest state
authRouter.get("/session", async (req, res, next) => {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)rsr_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) {
      res.status(401).json({
        authenticated: false,
        isGuest: true,
        user: {
          id: "guest-user",
          name: "Guest User",
          isGuest: true,
          syncEnabled: false,
        },
      });
      return;
    }

    const session = await db.getSession(token);

    if (!session) {
      res.status(401).json({
        authenticated: false,
        isGuest: true,
        user: {
          id: "guest-user",
          name: "Guest User",
          isGuest: true,
          syncEnabled: false,
        },
      });
      return;
    }

    const user = await db.findUserById(session.userId);
    if (!user) {
      res.status(401).json({
        authenticated: false,
        isGuest: true,
        user: {
          id: "guest-user",
          name: "Guest User",
          isGuest: true,
          syncEnabled: false,
        },
      });
      return;
    }

    res.json({
      authenticated: true,
      isGuest: Boolean(user.isGuest),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isGuest: Boolean(user.isGuest),
        syncEnabled: !user.isGuest,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me - Direct authenticated user endpoint
authRouter.get("/me", async (req, res, next) => {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)rsr_session=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        },
      });
      return;
    }

    const session = await db.getSession(token);
    if (!session) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Session is invalid or expired.",
        },
      });
      return;
    }

    const user = await db.findUserById(session.userId);
    if (!user) {
      res.status(401).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "User account could not be found.",
        },
      });
      return;
    }

    res.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isGuest: Boolean(user.isGuest),
        syncEnabled: !user.isGuest,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

