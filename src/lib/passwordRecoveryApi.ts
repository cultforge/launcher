import { sendMutate } from "./client";

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object"
    ? (data as Record<string, unknown>)
    : null;
}

function pickString(obj: Record<string, unknown> | null, keys: string[]): string {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** POST /v1/password/forgot — email a reset link/token. */
export async function requestPasswordForgot(email: string): Promise<string> {
  const trimmed = email.trim();
  if (!trimmed) throw new Error("Enter your account email");
  const raw = await sendMutate(
    "auth",
    "password_forgot",
    { email: trimmed },
    "POST",
  );
  const obj = asRecord(raw);
  return (
    pickString(obj, ["message", "detail", "status"]) ||
    "If that email is registered, a reset message is on the way."
  );
}

/** POST /v1/password/reset — apply token + new password. */
export async function requestPasswordReset(opts: {
  token: string;
  password: string;
}): Promise<string> {
  const token = opts.token.trim();
  const password = opts.password;
  if (!token) throw new Error("Paste the reset token from your email");
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const raw = await sendMutate(
    "auth",
    "password_reset",
    {
      token,
      password,
      new_password: password,
    },
    "POST",
  );
  const obj = asRecord(raw);
  return (
    pickString(obj, ["message", "detail", "status"]) ||
    "Password updated. You can sign in again."
  );
}
