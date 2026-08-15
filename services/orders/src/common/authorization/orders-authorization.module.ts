import { Global, Module } from '@nestjs/common';
import { AUTHORIZATION_RESOLVER } from '@patina/auth';
import { OrdersAuthorizationResolver } from './orders-authorization.resolver';

@Global()
@Module({
  providers: [
    OrdersAuthorizationResolver,
    {
      provide: AUTHORIZATION_RESOLVER,
      useExisting: OrdersAuthorizationResolver,
    },
  ],
  exports: [OrdersAuthorizationResolver, AUTHORIZATION_RESOLVER],
})
export class OrdersAuthorizationModule {}
