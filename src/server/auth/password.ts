import argon2 from 'argon2';

// 32 MiB per hash keeps several concurrent requests below the 256 MiB app
// container limit. One lane prevents a single login from monopolizing Pi cores.
export const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 32 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});

// Valid Argon2id hash used for nonexistent emails to reduce timing differences.
// It is not a credential and contains no secret.
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=32768,t=3,p=1$c3BlbmRpbWUtZHVtbXktc2FsdA$P9vVjQf1V7LEQPHLBOHGyFBwSD8AiJyFKwMLAOX8mVQ';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
