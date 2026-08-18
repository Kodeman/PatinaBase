import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { AuthenticatedUserIdentity } from '@patina/auth';
import { defer, lastValueFrom, Observable } from 'rxjs';
import { MediaAdminTransactionContext } from './media-admin-transaction.context';
import { MediaAuthorizationResolver } from './media-authorization.resolver';

@Injectable()
export class MediaAdminAuthorizationInterceptor implements NestInterceptor {
  constructor(
    private readonly authorization: MediaAuthorizationResolver,
    private readonly transactionContext: MediaAdminTransactionContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const identity = context.switchToHttp().getRequest().user as AuthenticatedUserIdentity;
    return defer(() =>
      this.authorization.withAdminLease(identity.sub, (transaction) =>
        this.transactionContext.run(transaction, () => lastValueFrom(next.handle())),
      ),
    );
  }
}
