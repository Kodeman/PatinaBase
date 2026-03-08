import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { VirusScannerService } from '../../security/virus-scanner.service';

/**
 * Security interceptor for media uploads
 * - Virus scanning
 * - Malicious file detection
 * - Content validation
 */
@Injectable()
export class MediaSecurityInterceptor implements NestInterceptor {
  constructor(private readonly virusScanner: VirusScannerService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const file = request.file || request.files?.[0];

    if (file && file.buffer) {
      // Run virus scan
      const scanResult = await this.virusScanner.scanBuffer(file.buffer, file.originalname);

      if (!scanResult.clean) {
        throw new BadRequestException(
          `File failed security scan: ${scanResult.threat || 'Potential threat detected'}`,
        );
      }

      // Attach scan result to request for logging
      request.securityScan = scanResult;
    }

    return next.handle();
  }
}
