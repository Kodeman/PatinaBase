import { z, ZodSchema, ZodError } from 'zod';
import type { RouteContext } from '../utils/request-context';
import {
  setValidatedBody,
  setValidatedQuery,
  setValidatedParams,
} from '../utils/request-context';
import { apiValidationError } from '../utils/response-wrapper';
import { logValidationError } from '../utils/logger';

/**
 * Validation schemas for different parts of the request
 */
export interface ValidationSchemas {
  /** Schema for request body */
  body?: ZodSchema;
  /** Schema for query parameters */
  query?: ZodSchema;
  /** Schema for URL parameters */
  params?: ZodSchema;
}

/**
 * Middleware handler type
 */
export type RouteHandler = (
  request: Request,
  context: RouteContext
) => Promise<Response> | Response;

/**
 * Validation middleware
 * Validates request body, query parameters, and URL parameters using Zod schemas
 */
export function withValidation(schemas: ValidationSchemas) {
  return function validationMiddleware(next: RouteHandler): RouteHandler {
    return async (request: Request, context: RouteContext): Promise<Response> => {
      try {
        let updatedContext = context;

        // Validate body (for POST, PUT, PATCH)
        if (schemas.body && hasBody(request.method)) {
          try {
            const bodyText = await request.text();
            const body = bodyText ? JSON.parse(bodyText) : {};
            const validatedBody = await schemas.body.parseAsync(body);
            updatedContext = setValidatedBody(updatedContext, validatedBody);
          } catch (error) {
            if (error instanceof ZodError) {
              logValidationError(context, 'body', error);
              return apiValidationError('Request body validation failed', {
                issues: error.errors.map((err) => ({
                  path: err.path.join('.'),
                  message: err.message,
                  code: err.code,
                })),
              });
            }
            if (error instanceof SyntaxError) {
              logValidationError(context, 'body', error);
              return apiValidationError('Invalid JSON in request body');
            }
            throw error;
          }
        }

        // Validate query parameters
        if (schemas.query) {
          try {
            const url = new URL(request.url);
            const queryParams = Object.fromEntries(url.searchParams.entries());
            const validatedQuery = await schemas.query.parseAsync(queryParams);
            updatedContext = setValidatedQuery(updatedContext, validatedQuery);
          } catch (error) {
            if (error instanceof ZodError) {
              logValidationError(context, 'query', error);
              return apiValidationError('Query parameter validation failed', {
                issues: error.errors.map((err) => ({
                  path: err.path.join('.'),
                  message: err.message,
                  code: err.code,
                })),
              });
            }
            throw error;
          }
        }

        // Validate URL parameters (passed separately in Next.js dynamic routes)
        // Note: params must be extracted from Next.js route context and passed in
        if (schemas.params && context.custom?.params) {
          try {
            const validatedParams = await schemas.params.parseAsync(
              context.custom.params
            );
            updatedContext = setValidatedParams(updatedContext, validatedParams);
          } catch (error) {
            if (error instanceof ZodError) {
              logValidationError(context, 'params', error);
              return apiValidationError('URL parameter validation failed', {
                issues: error.errors.map((err) => ({
                  path: err.path.join('.'),
                  message: err.message,
                  code: err.code,
                })),
              });
            }
            throw error;
          }
        }

        return next(request, updatedContext);
      } catch (error) {
        // Re-throw unexpected errors to be handled by error middleware
        throw error;
      }
    };
  };
}

/**
 * Check if HTTP method typically has a request body
 */
function hasBody(method: string): boolean {
  return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
}

/**
 * Helper to create a validated query parameter schema
 * Handles query parameter type coercion (all params come as strings)
 */
export function createQuerySchema<T extends ZodSchema>(schema: T): T {
  return schema;
}

/**
 * Common query parameter transformers
 */
export const queryTransforms = {
  /** Transform string to boolean */
  boolean: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .pipe(z.boolean()),

  /** Transform string to number */
  number: z.string().transform(Number).pipe(z.number()),

  /** Transform string to integer */
  integer: z.string().transform((val) => parseInt(val, 10)).pipe(z.number().int()),

  /** Transform comma-separated string to array */
  array: (itemSchema: ZodSchema = z.string()) =>
    z
      .string()
      .transform((val) => val.split(',').map((s) => s.trim()))
      .pipe(z.array(itemSchema)),

  /** Optional string (handles empty strings as undefined) */
  optionalString: z
    .string()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
};
