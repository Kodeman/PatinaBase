import {
  Controller,
  Post,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UploadService, UploadIntent } from './upload.service';
import {
  AuthenticatedUserIdentity,
  CurrentUser,
  JwtAuthGuard,
  RequireAnyPermission,
} from '@patina/auth';
import { MEDIA_MANAGE_PERMISSIONS } from '../authorization/media-authorization.constants';

@ApiTags('Media Upload')
@Controller('v1/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Post('upload')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create upload intent and generate Pre-Authenticated Request (PAR)',
    description:
      'Returns a PAR URL for direct upload to OCI Object Storage. The PAR expires in 15 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload intent created successfully',
    schema: {
      example: {
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        uploadSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        parUrl: 'https://objectstorage.us-ashburn-1.oraclecloud.com/p/abc123...',
        targetKey: 'raw/images/550e8400-e29b-41d4-a716-446655440000/hero.jpg',
        headers: {
          'x-content-type': 'image/jpeg',
        },
        expiresAt: '2025-10-03T12:30:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid upload intent',
    schema: {
      example: {
        error: {
          code: 'MEDIA.VALIDATION',
          message: 'Invalid MIME type for IMAGE',
          details: { allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] },
        },
      },
    },
  })
  async createUploadIntent(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Body() intent: UploadIntent,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.uploadService.createUploadIntent(identity.sub, intent, idempotencyKey);
  }

  @Post('upload/:sessionId/confirm')
  @RequireAnyPermission(...MEDIA_MANAGE_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm upload completion',
    description: 'Called after client successfully uploads to PAR URL',
  })
  async confirmUpload(
    @CurrentUser() identity: AuthenticatedUserIdentity,
    @Param('sessionId') sessionId: string,
    @Body() body: { sessionId?: string },
  ) {
    return this.uploadService.confirmUpload(identity.sub, sessionId, body.sessionId);
  }
}
