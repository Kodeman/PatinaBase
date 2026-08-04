import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '@patina/auth';
import { BackgroundRemovalService } from './background-removal.service';

interface AuthenticatedUser {
  userId: string;
}

@ApiTags('Mood Boards')
@ApiBearerAuth()
@Controller('boards')
@UseGuards(JwtAuthGuard)
export class BackgroundRemovalController {
  constructor(private readonly backgroundRemoval: BackgroundRemovalService) {}

  @Get(':boardId/background-removal-capability')
  @ApiOperation({ summary: 'Get background-removal availability and quota' })
  @ApiResponse({ status: 200, description: 'Capability and durable quota windows' })
  async capability(
    @Param('boardId', new ParseUUIDPipe()) boardId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.backgroundRemoval.capability(this.bearerToken(authorization), boardId);
  }

  @Post(':boardId/items/:itemId/remove-background')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a background-removed cutout for one board item' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 200, description: 'Canonical original/cutout URLs and quota' })
  async removeBackground(
    @CurrentUser() user: AuthenticatedUser,
    @Param('boardId', new ParseUUIDPipe()) boardId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Body() body?: unknown,
  ) {
    // Route identity and this header are the complete client contract. In
    // particular, a caller can never choose the source URL.
    if (
      body !== undefined &&
      body !== null &&
      (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)
    ) {
      throw new BadRequestException({
        code: 'background_removal_invalid_request',
        message: 'The request body must be empty.',
      });
    }
    const key = idempotencyKey?.trim();
    if (!key || key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      throw new BadRequestException({
        code: 'background_removal_idempotency_key_required',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
    return this.backgroundRemoval.removeBackground(
      this.bearerToken(authorization),
      user.userId,
      boardId,
      itemId,
      key,
    );
  }

  private bearerToken(authorization?: string): string {
    if (!authorization?.startsWith('Bearer ') || authorization.length <= 7) {
      throw new UnauthorizedException();
    }
    return authorization.slice(7);
  }
}
