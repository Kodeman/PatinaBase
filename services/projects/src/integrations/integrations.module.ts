import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ProposalsClientService } from './proposals-client.service';
import { MediaClientService } from './media-client.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000, // 10 second timeout
      maxRedirects: 3,
    }),
    ConfigModule,
  ],
  providers: [ProposalsClientService, MediaClientService],
  exports: [ProposalsClientService, MediaClientService],
})
export class IntegrationsModule {}