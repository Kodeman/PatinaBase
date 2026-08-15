import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient as ProjectsPrismaClient } from '../generated/prisma-client';

@Injectable()
export class PrismaService extends ProjectsPrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
