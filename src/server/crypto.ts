import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifratura dei token salvati nel database (AES-256-GCM).
 * La chiave è TOKEN_ENCRYPTION_KEY: 32 byte casuali in base64, solo nelle variabili d'ambiente.
 * Chi legge il database senza la chiave non può usare i token.
 */
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Manca TOKEN_ENCRYPTION_KEY");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY deve essere di 32 byte in base64");
  return k;
}

/** "v1.<iv>.<tag>.<dati>" in base64url */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((x) => (typeof x === "string" ? x : x.toString("base64url"))).join(".");
}

export function decrypt(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Token cifrato non valido");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
