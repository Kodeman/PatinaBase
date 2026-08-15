import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AUTHORIZATION_RESOLVER } from '@patina/auth';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Global()
@Module({
  providers: [
    PrismaService,
    ProjectsAuthorizationResolver,
    {
      provide: AUTHORIZATION_RESOLVER,
      useExisting: ProjectsAuthorizationResolver,
    },
  ],
  exports: [PrismaService, ProjectsAuthorizationResolver, AUTHORIZATION_RESOLVER],
})
export class PrismaModule {}
