import { Injectable, NestMiddleware, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma-client';
import { createHash } from 'crypto';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaClient) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    const verifiedSubject = (req as any).user?.sub as string | undefined;

    // Only apply to mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Idempotency key is optional but recommended
    if (!idempotencyKey || !verifiedSubject) {
      return next();
    }

    const scopedKey = createHash('sha256')
      .update(`${verifiedSubject}\0${req.method}\0${req.path}\0${idempotencyKey}`)
      .digest('hex');

    try {
      // Check if we've seen this key before
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: scopedKey },
      });

      if (existing) {
        // Return cached response
        if (existing.statusCode && existing.response) {
          return res.status(existing.statusCode).json(existing.response);
        }
      } else {
        // Create new idempotency record
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour expiry

        await this.prisma.idempotencyKey.create({
          data: {
            key: scopedKey,
            endpoint: req.path,
            expiresAt,
          },
        });
      }

      // Intercept response to cache it
      const originalSend = res.send.bind(res);
      res.send = (body: any) => {
        // Cache the response asynchronously
        this.prisma.idempotencyKey
          .update({
            where: { key: scopedKey },
            data: {
              statusCode: res.statusCode,
              response: typeof body === 'string' ? JSON.parse(body) : body,
            },
          })
          .catch(() => console.error('Idempotency response write failed'));

        return originalSend(body);
      };

      next();
    } catch {
      console.error('Idempotency middleware failed');
      next();
    }
  }
}
