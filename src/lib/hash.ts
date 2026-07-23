// A Cloudflare Workers Edge-compatible PBKDF2 password hasher
// Uses native WebCrypto API to bypass the 50ms JS CPU execution time limit

function buf2hex(buffer: ArrayBuffer | Uint8Array) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function hex2buf(hexString: string) {
  const bytes = new Uint8Array(Math.ceil(hexString.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes;
}

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
      iterations: 1000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const saltHex = buf2hex(salt);
  const hashHex = buf2hex(hashBuffer);
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("pbkdf2:")) {
    // Basic fallback for testing/mock mode if plain text or other
    return password === hash;
  }

  const [, saltHex, originalHashHex] = hash.split(":");
  const salt = hex2buf(saltHex);
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
      iterations: 1000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const computedHashHex = buf2hex(computedHashBuffer);
  return computedHashHex === originalHashHex;
}
