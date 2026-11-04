// Encrypts stored access tokens (AES-256-GCM, Web Crypto) so a copy of the database alone does not hand over the
// keys to anyone's ad account or Business Center. The key lives in the function secrets, never in the database.
//
// Stored form:  enc:v1:<iv>:<ciphertext+tag>   (both base64)
// Keys: TOKEN_ENCRYPTION_KEY = one or more base64 32-byte keys separated by commas. The FIRST key seals; every key
// can open, so a key can be rotated by putting the new one first and keeping the old one until all rows are resealed.
// With no key configured nothing is sealed, and anything still stored in plain text is read as it always was.

const PREFIX = "enc:v1:";

export const isSealed = (v: unknown): v is string => typeof v === "string" && v.startsWith(PREFIX);

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const cache = new Map<string, Promise<CryptoKey>>();
function importKey(base64: string): Promise<CryptoKey> {
  let k = cache.get(base64);
  if (!k) {
    const raw = unb64(base64.trim());
    if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
    k = crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
    cache.set(base64, k);
  }
  return k;
}

const keyList = (raw: string | undefined) =>
  (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

/** Encrypts a token with the first key. Returns it unchanged when no key is set or it is already sealed. */
export async function seal(plain: string, rawKeys: string | undefined): Promise<string> {
  const keys = keyList(rawKeys);
  if (keys.length === 0 || isSealed(plain)) return plain;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(keys[0]),
    new TextEncoder().encode(plain),
  );
  return `${PREFIX}${b64(iv)}:${b64(new Uint8Array(data))}`;
}

/** Decrypts a sealed token (trying every configured key). Anything not sealed is returned as it is. */
export async function open(value: string, rawKeys: string | undefined): Promise<string> {
  if (!isSealed(value)) return value;
  const keys = keyList(rawKeys);
  if (keys.length === 0) throw new Error("A stored token is encrypted but TOKEN_ENCRYPTION_KEY is not set");
  const [ivPart, dataPart] = value.slice(PREFIX.length).split(":");
  if (!ivPart || !dataPart) throw new Error("A stored token is malformed");
  const iv = unb64(ivPart);
  const data = unb64(dataPart);
  for (const k of keys) {
    try {
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await importKey(k), data);
      return new TextDecoder().decode(plain);
    } catch {
      // wrong key, try the next one
    }
  }
  throw new Error("A stored token could not be decrypted with the configured keys");
}
