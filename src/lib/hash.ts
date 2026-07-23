// A Cloudflare Workers Edge-compatible fast password hasher
// Uses native WebCrypto API with 1-iteration SHA-256 to guarantee it stays well below the 50ms JS CPU limit

function buf2hex(buffer: ArrayBuffer | Uint8Array) {
  const bytes = new Uint8Array(buffer);
  const hexValues = [];
  for (let i = 0; i < bytes.length; i++) {
    hexValues.push(('00' + bytes[i].toString(16)).slice(-2));
  }
  return hexValues.join('');
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
  
  // Combine password and salt
  const passwordBytes = encoder.encode(password);
  const data = new Uint8Array(salt.length + passwordBytes.length);
  data.set(salt);
  data.set(passwordBytes, salt.length);
  
  // 1-iteration fast SHA-256 to respect 50ms limits
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const saltHex = buf2hex(salt);
  const hashHex = buf2hex(hashBuffer);
  return `sha256:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("sha256:") && !hash.startsWith("pbkdf2:")) {
    return password === hash;
  }

  const [, saltHex, originalHashHex] = hash.split(":");
  const salt = hex2buf(saltHex);
  const encoder = new TextEncoder();
  
  const passwordBytes = encoder.encode(password);
  const data = new Uint8Array(salt.length + passwordBytes.length);
  data.set(salt);
  data.set(passwordBytes, salt.length);
  
  const computedHashBuffer = await crypto.subtle.digest("SHA-256", data);
  const computedHashHex = buf2hex(computedHashBuffer);
  
  return computedHashHex === originalHashHex;
}
