import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaClient } from '../../generated/prisma-client';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaClient) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, headers } = request;
    const userId = request.user?.id || 'system';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: async (data) => {
          const duration = Date.now() - startTime;

          // Extract entity information from response or request
          const entityId = this.extractEntityId(url, body, data);
          const entityType = this.extractEntityType(url);
          const action = this.mapMethodToAction(method);

          if (entityType && entityId) {
            try {
              await this.prisma.auditLog.create({
                data: {
                  entityType,
                  entityId,
                  action,
                  actor: userId,
                  actorType: userId === 'system' ? 'system' : 'user',
                  changes: {
                    method,
                    url,
                    body,
                    duration,
                  },
                  metadata: {
                    userAgent: headers['user-agent'],
                    requestId: headers['x-request-id'],
                  },
                  ipAddress: request.ip,
                },
              });
            } catch (error) {
              console.error('Audit log error:', error);
            }
          }
        },
        error: async (error) => {
          // Log errors as well
          try {
            await this.prisma.auditLog.create({
              data: {
                entityType: this.extractEntityType(url) || 'unknown',
                entityId: 'error',
                action: 'error',
                actor: userId,
                actorType: 'system',
                changes: {
                  method,
                  url,
                  error: error.message,
                },
                ipAddress: request.ip,
              },
            });
          } catch (auditError) {
            console.error('Audit log error:', auditError);
          }
        },
      }),
    );
  }

  private extractEntityId(
    url: string,
    body: any,
    data: any,
  ): string | undefined {
    // Try to extract ID from URL
    const match = url.match(/\/([a-f0-9-]{36})/);
    if (match) return match[1];

    // Try to extract from response data
    if (data?.id) return data.id;
    if (body?.id) return body.id;

    return undefined;
  }

  private extractEntityType(url: string): string | undefined {
    if (url.includes('/carts')) return 'cart';
    if (url.includes('/orders')) return 'order';
    if (url.includes('/payments')) return 'payment';
    if (url.includes('/refunds')) return 'refund';
    if (url.includes('/shipments')) return 'shipment';
    if (url.includes('/checkout')) return 'checkout';

    return undefined;
  }

  private mapMethodToAction(method: string): string {
    const mapping: Record<string, string> = {
      GET: 'read',
      POST: 'created',
      PUT: 'updated',
      PATCH: 'updated',
      DELETE: 'deleted',
    };

    return mapping[method] || 'unknown';
  }
}
