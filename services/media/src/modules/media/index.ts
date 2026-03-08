// Main module
export { MediaModule } from './media.module';

// Service and Controller
export { MediaService } from './media.service';
export { MediaController } from './media.controller';

// DTOs
export * from './dto';

// Guards and Validators
export { MediaAccessGuard } from './guards/media-access.guard';
export { FileValidationPipe } from './validators/file-validation.pipe';
export { MediaSecurityInterceptor } from './interceptors/security.interceptor';

// Configuration
export { corsConfig, uploadCorsConfig, cdnCorsConfig } from './config/cors.config';
