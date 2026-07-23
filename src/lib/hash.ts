// A Cloudflare Workers Edge-compatible PBKDF2 password hasher
// Uses native WebCrypto API to bypass the 50ms JS CPU execution time limit

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(hashBuffer).toString("hex");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("pbkdf2:")) {
    // Basic fallback for testing/mock mode if plain text or other
    return password === hash;
  }

  const [, saltHex, originalHashHex] = hash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  const computedHashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const computedHashHex = Buffer.from(computedHashBuffer).toString("hex");
  return computedHashHex === originalHashHex;
}
