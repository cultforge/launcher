import { send, sendMutate } from "./client";
import { getPreference, setPreference } from "./persistentStore";

const PRIVATE_JWK_KEY = "cultforge.e2e.privateJwk";
const PUBLIC_JWK_KEY = "cultforge.e2e.publicJwk";
const ENROLLED_AT_KEY = "cultforge.e2e.enrolledAt";

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

export type E2eIdentityPublic = {
  userId: string;
  publicKeyJwk: JsonWebKey | null;
  algorithm: string | null;
  raw: unknown;
};

export type LocalE2eIdentity = {
  publicJwk: JsonWebKey | null;
  enrolledAt: string | null;
  hasPrivateKey: boolean;
};

async function exportJwk(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function loadLocalE2eIdentity(): Promise<LocalE2eIdentity> {
  const [publicRaw, privateRaw, enrolledAt] = await Promise.all([
    getPreference<JsonWebKey>(PUBLIC_JWK_KEY),
    getPreference<JsonWebKey>(PRIVATE_JWK_KEY),
    getPreference<string>(ENROLLED_AT_KEY),
  ]);
  return {
    publicJwk: publicRaw ?? null,
    enrolledAt: enrolledAt ?? null,
    hasPrivateKey: Boolean(privateRaw),
  };
}

/** Generate (or reuse) a local ECDSA P-256 keypair and enroll the public key. */
export async function enrollE2eIdentity(): Promise<LocalE2eIdentity> {
  let publicJwk = await getPreference<JsonWebKey>(PUBLIC_JWK_KEY);
  let privateJwk = await getPreference<JsonWebKey>(PRIVATE_JWK_KEY);

  if (!publicJwk || !privateJwk) {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    publicJwk = await exportJwk(pair.publicKey);
    privateJwk = await exportJwk(pair.privateKey);
    await setPreference(PUBLIC_JWK_KEY, publicJwk);
    await setPreference(PRIVATE_JWK_KEY, privateJwk);
  }

  await sendMutate(
    "auth",
    "enroll_e2e_identity",
    {
      algorithm: "ECDSA-P256",
      public_key: publicJwk,
      public_jwk: publicJwk,
      jwk: publicJwk,
    },
    "POST",
  );

  const enrolledAt = new Date().toISOString();
  await setPreference(ENROLLED_AT_KEY, enrolledAt);
  return {
    publicJwk,
    enrolledAt,
    hasPrivateKey: true,
  };
}

/** GET /v1/crypto/identity/{user_id} */
export async function fetchE2ePublicIdentity(
  userId: string,
): Promise<E2eIdentityPublic> {
  const trimmed = userId.trim();
  if (!trimmed) throw new Error("Missing user id");
  const raw = await send<unknown>("auth", "get_e2e_public_identity", {
    user_id: trimmed,
  });
  const obj = asRecord(raw);
  const nested = asRecord(obj?.identity) ?? asRecord(obj?.data) ?? obj;
  const jwkCandidate =
    nested?.public_key ?? nested?.public_jwk ?? nested?.jwk ?? null;
  const publicKeyJwk =
    jwkCandidate && typeof jwkCandidate === "object"
      ? (jwkCandidate as JsonWebKey)
      : null;
  return {
    userId: pickString(nested, ["user_id", "id"]) || trimmed,
    publicKeyJwk,
    algorithm: pickString(nested, ["algorithm", "alg"]) || null,
    raw,
  };
}
