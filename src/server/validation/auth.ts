import { z } from 'zod';

const email = z
  .string()
  .trim()
  .min(1)
  .max(254)
  .email()
  .transform((value) => value.normalize('NFKC').toLowerCase());

const password = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .max(128, 'Password must be at most 128 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 512, 'Password is too long.')
  .refine(
    (value) => {
      if (value.length >= 15) return true;
      return [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
        .filter((pattern) => pattern.test(value)).length >= 3;
    },
    'Use at least three character types, or a passphrase of 15 or more characters.',
  );

export const registerSchema = z
  .object({
    email,
    password,
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    displayName: value.displayName ?? value.email.split('@')[0]!.slice(0, 120),
  }));

export const loginSchema = z
  .object({ email, password: z.string().min(1).max(128) })
  .strict();
