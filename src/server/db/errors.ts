import { ApiError } from '../errors.js';

interface PgErrorLike {
  code?: string;
  constraint?: string;
}

export function translateDatabaseError(error: unknown): never {
  const pgError = error as PgErrorLike;
  if (pgError.code === '23505') {
    throw new ApiError(409, 'conflict', 'A resource with these values already exists.');
  }
  if (pgError.code === '23503' || pgError.code === '23514' || pgError.code === '22P02') {
    throw new ApiError(400, 'invalid_reference', 'The request contains invalid or unavailable values.');
  }
  if (pgError.code === '42501') {
    throw new ApiError(404, 'not_found', 'The requested resource was not found.');
  }
  throw error;
}
