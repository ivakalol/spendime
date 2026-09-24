import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const currencySchema = z.string().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase());
export const positiveMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:[.,]\d{1,4})?$/, 'Use a positive decimal string with at most 4 decimal places.')
  .refine((value) => !/^0(?:[.,]0+)?$/.test(value), 'Amount must be greater than zero.')
  .transform((value) => value.replace(',', '.'));
export const nonnegativeMoneySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/, 'Use a nonnegative decimal string with at most 4 decimal places.');
export const signedMoneySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/, 'Use a decimal string with at most 4 decimal places.');
export const dateSchema = z.iso.date();
export const timestampSchema = z.iso.datetime({ offset: true });
export const booleanQuerySchema = z.enum(['true', 'false']).optional()
  .transform((value) => value === 'true');

const integerQuery = (fallback: number, maximum: number) =>
  z.preprocess(
    (value) => value === undefined ? fallback : value,
    z.coerce.number().int().min(0).max(maximum),
  );

export const paginationSchema = z.object({
  limit: integerQuery(50, 100).refine((value) => value >= 1),
  offset: integerQuery(0, 100_000),
});

export function nullableUuid(): z.ZodOptional<z.ZodNullable<typeof uuidSchema>> {
  return uuidSchema.nullable().optional();
}
