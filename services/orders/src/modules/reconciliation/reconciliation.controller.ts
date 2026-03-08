import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @ApiOperation({ summary: 'Manually trigger reconciliation' })
  async run() {
    return this.reconciliationService.runReconciliation();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get reconciliation history' })
  async history() {
    return this.reconciliationService.getReconciliationHistory();
  }
}
