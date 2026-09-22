import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class BankingSecrets {
  private readonly key: Buffer;
  constructor(encodedKey: string) {
    this.key = Buffer.from(encodedKey, 'base64');
    if (this.key.length !== 32) throw new Error('BANKING_ENCRYPTION_KEY_B64 must contain 32 random bytes');
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  }

  decrypt(value: string): string {
    const [version, iv, tag, body] = value.split(':');
    if (version !== 'v1' || !iv || !tag || !body) throw new Error('Invalid encrypted banking secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
  }
}
