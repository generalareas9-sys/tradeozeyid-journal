import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Zod validation (engineering-contract.md §7.7).
 *
 * The parameter is `ZodTypeAny` rather than `AnyZodObject` so a schema may be a
 * refined/effect schema (`ZodEffects`) as well as a plain object — `PATCH`
 * bodies use `.refine()` to reject an empty patch.
 */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        throw new ValidationError(details);
      }
      throw error;
    }
  };
}

export function strictBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        throw new ValidationError(details);
      }
      throw error;
    }
  };
}