/*
 * Dev/admin utility for TOTP secrets that can no longer be decrypted
 * (see docs/PROJECT_GUIDE.md §8.3 and the "2FA verify fails" section of
 * README.md).
 *
 * A stored secret stops authenticating when the key material used to
 * encrypt it is no longer available - typically because
 * JWT_ACCESS_SECRET was rotated while TOTP_ENCRYPTION_KEY was unset, or
 * because the row was written by an environment that shares the database
 * but uses different secrets. Nothing can recover that ciphertext; the
 * account has to re-enroll, this script is the safe way to get there.
 *
 * Usage (from backend/):
 *   npx tsx tests/reset-twofa.ts --check
 *   npx tsx tests/reset-twofa.ts seller@example.com --yes
 *   npx tsx tests/reset-twofa.ts --reencrypt --yes
 *
 *   --check      Report which accounts have 2FA enabled and whether their
 *                stored secret is readable with the current environment.
 *                Prints emails and safe metadata only.
 *   <email>      Clear 2FA (secret + recovery codes) for that ONE account
 *                so it can run POST /auth/2fa/setup again. Requires --yes.
 *   --reencrypt  Re-encrypt every readable secret with the currently
 *                configured key (use after setting TOTP_ENCRYPTION_KEY so
 *                no row is left on the legacy derivation). Requires --yes.
 *
 * The script never prints a TOTP secret, a decrypted value or key
 * material - only emails, statuses and payload lengths.
 */
import mongoose from "mongoose";

import { connectDatabase } from "../src/config/database.js";
import { User } from "../src/models/User.js";
import {
  decryptSecret,
  describeEncryptionKeys,
  describeSecretPayload,
  encryptSecret,
  SecretCipherError,
} from "../src/utils/secretCipher.js";

const USAGE = [
  "Usage:",
  "  npx tsx tests/reset-twofa.ts --check",
  "  npx tsx tests/reset-twofa.ts <email> --yes",
  "  npx tsx tests/reset-twofa.ts --reencrypt --yes",
].join("\n");

const statusOf = (payload: string | null | undefined): string => {
  if (!payload) return "no stored secret";

  try {
    decryptSecret(payload);

    const meta = describeSecretPayload(payload);

    return `readable (format=${meta?.version ?? "legacy"}, iv=${meta?.ivBytes ?? "?"}B, tag=${meta?.authTagBytes ?? "?"}B, ciphertext=${meta?.ciphertextBytes ?? "?"}B)`;
  } catch (error) {
    if (error instanceof SecretCipherError) {
      const meta = describeSecretPayload(payload);

      return `UNREADABLE (${error.reason}, format=${meta?.version ?? "legacy"}, iv=${meta?.ivBytes ?? "?"}B, tag=${meta?.authTagBytes ?? "?"}B, ciphertext=${meta?.ciphertextBytes ?? "?"}B)`;
    }

    return "UNREADABLE (unexpected error)";
  }
};

const loadTwoFactorUsers = async () =>
  User.find({ twoFactorEnabled: true })
    .select("+twoFactorSecretEncrypted +recoveryCodes")
    .exec();

const check = async (): Promise<void> => {
  const users = await loadTwoFactorUsers();

  console.log(
    `Encryption keys (first one encrypts new secrets): ${describeEncryptionKeys()}`,
  );
  console.log(`Accounts with 2FA enabled: ${users.length}`);

  for (const user of users) {
    console.log(
      `  - ${user.email}: ${statusOf(user.twoFactorSecretEncrypted)}`,
    );
  }

  const unreadable = users.filter((user) => {
    if (!user.twoFactorSecretEncrypted) return true;

    try {
      decryptSecret(user.twoFactorSecretEncrypted);
      return false;
    } catch {
      return true;
    }
  });

  if (unreadable.length > 0) {
    console.log("");
    console.log(
      "Accounts that must reset 2FA (cannot decrypt their stored secret):",
    );

    for (const user of unreadable) {
      console.log(`  npx tsx tests/reset-twofa.ts ${user.email} --yes`);
    }
  }
};

const resetOne = async (email: string): Promise<void> => {
  const user = await User.findOne({
    email: email.toLowerCase(),
  })
    .select("+twoFactorSecretEncrypted")
    .exec();

  if (!user) {
    console.error(`No account found for ${email}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Account: ${user.email} (role=${user.role}, 2FA enabled=${user.twoFactorEnabled === true})`,
  );
  console.log(`Stored secret: ${statusOf(user.twoFactorSecretEncrypted)}`);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        twoFactorEnabled: false,
        twoFactorSecretEncrypted: null,
        recoveryCodes: [],
      },
    },
  );

  console.log("");
  console.log("2FA cleared for this account (only this account was touched).");
  console.log("Next steps for the seller:");
  console.log(
    "  1. POST /api/v1/auth/login                        (password step)",
  );
  console.log(
    "  2. POST /api/v1/auth/2fa/setup                    (with the access token; returns a new secret + recovery codes)",
  );
  console.log("  3. Scan the otpauth:// QR with the authenticator app");
  console.log("  4. POST /api/v1/auth/2fa/enable with a fresh 6-digit code");
};

const reencrypt = async (): Promise<void> => {
  const users = await loadTwoFactorUsers();

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const payload = user.twoFactorSecretEncrypted;

    if (!payload) {
      skipped += 1;
      continue;
    }

    try {
      const secret = decryptSecret(payload);

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            twoFactorSecretEncrypted: encryptSecret(secret),
          },
        },
      );

      migrated += 1;
      console.log(
        `  re-encrypted: ${user.email} (now ${describeEncryptionKeys()})`,
      );
    } catch {
      skipped += 1;
      console.log(
        `  skipped (still unreadable, reset 2FA instead): ${user.email}`,
      );
    }
  }

  console.log("");
  console.log(`Re-encrypted ${migrated} secret(s); skipped ${skipped}.`);
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const checkOnly = args.includes("--check");
  const wantsReencrypt = args.includes("--reencrypt");
  const email = args.find((arg) => !arg.startsWith("--"));

  if (!checkOnly && !wantsReencrypt && !email) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  if (!checkOnly && !confirmed) {
    console.error(
      "Refusing to modify 2FA data without --yes (run --check first to see the current state).",
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    if (checkOnly) {
      await check();
      return;
    }

    if (wantsReencrypt) {
      await reencrypt();
      return;
    }

    await resetOne(email as string);
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error: unknown) => {
  console.error("2FA maintenance failed:", error);
  process.exit(1);
});
