import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    error: { code: 'not_found', message: 'The requested resource was not found.' },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({
      error: { code: 'invalid_json', message: 'The request body is not valid JSON.' },
    });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'validation_error',
        message: 'The request body is invalid.',
        fields: error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }
  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  // Never serialize SQL errors, parameters, password/session hashes, or stacks.
  const name = error instanceof Error ? error.name : 'UnknownError';
  // SQLSTATE is safe diagnostic metadata; never log SQL text or user parameters.
  const code = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined;
  console.error('Unhandled request error', { name, ...(code ? { code } : {}) });
  response.status(500).json({
    error: { code: 'internal_error', message: 'An unexpected error occurred.' },
  });
};
