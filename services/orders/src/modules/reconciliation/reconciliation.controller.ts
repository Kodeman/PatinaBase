import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import {
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('reconciliation')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  @RequirePermissions(ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Manually trigger reconciliation' })
  async run(@CurrentUser() user: AuthenticatedUserIdentity) {
    return this.reconciliationService.runReconciliationAs(user.sub);
  }

  @Get('history')
  @RequirePermissions(ORDER_PERMISSIONS.ADMIN_ALL)
  @ApiOperation({ summary: 'Get reconciliation history' })
  async history(@CurrentUser() user: AuthenticatedUserIdentity) {
    return this.reconciliationService.getReconciliationHistory(10, user.sub);
  }
}
