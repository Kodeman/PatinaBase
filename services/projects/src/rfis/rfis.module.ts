import { Module } from '@nestjs/common';
import { RfisService } from './rfis.service';
import { RfisController } from './rfis.controller';

@Module({
  controllers: [RfisController],
  providers: [RfisService],
  exports: [RfisService],
})
export class RfisModule {}
