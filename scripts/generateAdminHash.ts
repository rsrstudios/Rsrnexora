#!/usr/bin/env tsx
/**
 * RSR Nexora - Secure Server-Side Admin Password Hash Generator
 * 
 * STRICT SECURITY INVARIANTS:
 * 1. Cryptographic parameters and format match server/security/adminAuth.ts exactly:
 *    - Algorithm: Node.js crypto.scrypt
 *    - Salt Length: 16 bytes (32 hex characters, freshly generated per invocation)
 *    - Derived Key Length: 64 bytes (128 hex characters)
 *    - Format: ADMIN_PASSWORD_HASH=<salt_hex>:<hash_hex>
 * 2. In non-interactive mode, accepts password ONLY through secure environment variable ADMIN_PASSWORD.
 * 3. Never logs, outputs, or stores the plaintext password anywhere.
 * 4. Outputs strictly the resulting:
 *      ADMIN_PASSWORD_HASH=<salt>:<hash>
 * 5. Wipes and deletes ADMIN_PASSWORD from process memory as soon as practical.
 * 6. Preserves interactive TTY mode when run in an interactive terminal.
 */

import crypto from "crypto";
import readline from "readline";

const SALT_LEN = 16; // 16 bytes = 32 hex chars
const KEY_LEN = 64;   // 64 bytes = 128 hex chars
const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 128;

/**
 * Derives a scrypt hash using the exact parameters used by RSR Nexora admin authentication.
 * Accepts either string or Buffer, and zeroes Buffer immediately after derivation.
 */
export function hashAdminPassword(password: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!password) {
      return reject(new Error("Password cannot be empty."));
    }

    let buf: Buffer;
    let isAllocatedLocally = false;

    if (Buffer.isBuffer(password)) {
      buf = password;
    } else {
      if (typeof password !== "string" || !password.trim()) {
        return reject(new Error("Password cannot be empty."));
      }
      buf = Buffer.from(password.trim(), "utf8");
      isAllocatedLocally = true;
    }

    if (buf.length < MIN_PASSWORD_LEN) {
      if (isAllocatedLocally) buf.fill(0);
      return reject(new Error(`Password must be at least ${MIN_PASSWORD_LEN} characters long.`));
    }

    if (buf.length > MAX_PASSWORD_LEN) {
      if (isAllocatedLocally) buf.fill(0);
      return reject(new Error(`Password exceeds maximum allowable length of ${MAX_PASSWORD_LEN} characters.`));
    }

    // Fresh 16-byte random salt for every single invocation
    const salt = crypto.randomBytes(SALT_LEN).toString("hex");

    crypto.scrypt(buf, salt, KEY_LEN, (err, derivedKey) => {
      // Clear password memory immediately
      if (isAllocatedLocally) {
        buf.fill(0);
      }
      if (err) return reject(err);

      const hash = derivedKey.toString("hex");
      resolve(`${salt}:${hash}`);
    });
  });
}

/**
 * Prompts the user in an interactive terminal without echoing input characters to stdout.
 */
function promptHidden(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const isMuted = { value: false };

    // Intercept stdout writes to prevent echoing secrets
    (rl as any)._writeToOutput = function (stringToWrite: string) {
      if (isMuted.value) {
        // Suppress plaintext echoing; do not display entered characters
        return;
      }
      process.stdout.write(stringToWrite);
    };

    process.stderr.write(promptText);
    isMuted.value = true;

    rl.question("", (answer) => {
      isMuted.value = false;
      process.stderr.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Main server-side execution entry point.
 */
async function main() {
  let passwordBuffer: Buffer | null = null;

  // 1. Check for secure server-side environment variable ADMIN_PASSWORD
  if (process.env.ADMIN_PASSWORD) {
    const rawVal = process.env.ADMIN_PASSWORD;
    // Wipe immediately from process.env to prevent environment inspection
    delete process.env.ADMIN_PASSWORD;
    passwordBuffer = Buffer.from(rawVal.trim(), "utf8");
  }

  // 2. Interactive TTY fallback if no ADMIN_PASSWORD was provided and running in an interactive terminal
  if (!passwordBuffer && Boolean(process.stdin.isTTY)) {
    process.stderr.write("\n=======================================================\n");
    process.stderr.write("   RSR Nexora - Server-Side Admin Password Generator   \n");
    process.stderr.write("=======================================================\n");
    process.stderr.write("Enter the new admin password. Characters will not be echoed.\n\n");

    const p1 = await promptHidden("Enter admin password: ");
    if (!p1 || p1.trim().length < MIN_PASSWORD_LEN) {
      process.stderr.write(`\nError: Password must be at least ${MIN_PASSWORD_LEN} characters long.\n`);
      process.exit(1);
    }

    const p2 = await promptHidden("Confirm admin password: ");
    if (p1 !== p2) {
      process.stderr.write("\nError: Passwords do not match. Aborting.\n");
      process.exit(1);
    }

    passwordBuffer = Buffer.from(p1.trim(), "utf8");
  }

  // 3. If still no password, output error to stderr and exit
  if (!passwordBuffer) {
    process.stderr.write("Error: Missing required ADMIN_PASSWORD environment variable.\n\n");
    process.stderr.write("Non-interactive usage:\n");
    process.stderr.write("  ADMIN_PASSWORD='USER_SUPPLIED_PASSWORD' npm run admin:hash\n\n");
    process.stderr.write("Interactive usage (terminal with TTY):\n");
    process.stderr.write("  npm run admin:hash\n");
    process.exit(1);
  }

  try {
    const hashOutput = await hashAdminPassword(passwordBuffer);

    // Overwrite password memory with zeroes immediately
    passwordBuffer.fill(0);
    passwordBuffer = null;

    // Strict requirement: Output ONLY: ADMIN_PASSWORD_HASH=<salt>:<hash>
    process.stdout.write(`ADMIN_PASSWORD_HASH=${hashOutput}\n`);
    process.exit(0);
  } catch (err: any) {
    if (passwordBuffer) {
      passwordBuffer.fill(0);
      passwordBuffer = null;
    }
    process.stderr.write(`Error generating hash: ${err?.message || err}\n`);
    process.exit(1);
  }
}

// Execute if run directly from CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

