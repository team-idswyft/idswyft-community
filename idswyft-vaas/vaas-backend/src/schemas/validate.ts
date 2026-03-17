import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { VaasApiResponse } from '../types/index.js';

/**
 * Generic Express middleware that validates `req.body` against a Zod schema.
 * On success, `req.body` is replaced with the parsed (and stripped) output.
 * On failure, responds with 400 and Zod issue details.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const response: VaasApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
      return res.status(400).json(response);
    }
    req.body = result.data;
    next();
  };
}
