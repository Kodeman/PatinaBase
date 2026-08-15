import { Global, Module } from '@nestjs/common';
import { AUTHORIZATION_RESOLVER } from '@patina/auth';
import { PrismaClient } from '../../generated/prisma-client';
import { MediaAuthorizationResolver } from './media-authorization.resolver';

@Global()
@Module({
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => new PrismaClient(),
    },
    MediaAuthorizationResolver,
    {
      provide: AUTHORIZATION_RESOLVER,
      useExisting: MediaAuthorizationResolver,
    },
  ],
  exports: [PrismaClient, MediaAuthorizationResolver, AUTHORIZATION_RESOLVER],
})
export class MediaAuthorizationModule {}
