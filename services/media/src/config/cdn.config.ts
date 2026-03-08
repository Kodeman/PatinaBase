/**
 * CDN Configuration
 * CloudFront and multi-CDN setup with optimization presets
 */

export interface CDNConfig {
  provider: 'cloudfront' | 'fastly' | 'cloudflare';
  domain: string;
  distributionId?: string;
  secureDistribution: boolean;

  // Cache settings
  cache: {
    defaultTTL: number;
    maxTTL: number;
    minTTL: number;
    enableQueryStringCache: boolean;
    queryStringWhitelist: string[];
  };

  // Compression
  compression: {
    brotli: boolean;
    gzip: boolean;
    autoWebP: boolean;
    autoAVIF: boolean;
  };

  // Performance
  performance: {
    http3: boolean;
    http2Push: boolean;
    earlyHints: boolean;
    prefetch: boolean;
  };

  // Security
  security: {
    waf: boolean;
    ddosProtection: boolean;
    rateLimit: number;
    geoBlocking: string[];
    signedUrls: boolean;
  };

  // Edge computing
  edge: {
    functions: boolean;
    workers: boolean;
    kvStore: boolean;
  };
}

export const cdnConfig: CDNConfig = {
  provider: (process.env.CDN_PROVIDER as any) || 'cloudfront',
  domain: process.env.CDN_DOMAIN || 'cdn.patina.com',
  distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
  secureDistribution: true,

  cache: {
    defaultTTL: 86400, // 24 hours
    maxTTL: 31536000, // 1 year
    minTTL: 0,
    enableQueryStringCache: true,
    queryStringWhitelist: ['w', 'h', 'f', 'q', 'fit'],
  },

  compression: {
    brotli: true,
    gzip: true,
    autoWebP: true,
    autoAVIF: true,
  },

  performance: {
    http3: true,
    http2Push: false, // Deprecated in favor of early hints
    earlyHints: true,
    prefetch: true,
  },

  security: {
    waf: true,
    ddosProtection: true,
    rateLimit: 10000, // requests per minute
    geoBlocking: [], // Countries to block
    signedUrls: true,
  },

  edge: {
    functions: true,
    workers: true,
    kvStore: false,
  },
};

/**
 * Cache policy presets for different content types
 */
export const cachePolicies = {
  images: {
    processed: { ttl: 31536000, immutable: true }, // 1 year, immutable
    thumbnails: { ttl: 2592000, immutable: false }, // 30 days
    raw: { ttl: 86400, immutable: false }, // 1 day
  },

  models3d: {
    glb: { ttl: 31536000, immutable: true }, // 1 year, immutable
    usdz: { ttl: 31536000, immutable: true }, // 1 year, immutable
    previews: { ttl: 604800, immutable: false }, // 7 days
  },

  api: {
    catalog: { ttl: 300, immutable: false }, // 5 minutes
    product: { ttl: 600, immutable: false }, // 10 minutes
    user: { ttl: 60, immutable: false }, // 1 minute
  },

  static: {
    css: { ttl: 31536000, immutable: true }, // 1 year
    js: { ttl: 31536000, immutable: true }, // 1 year
    fonts: { ttl: 31536000, immutable: true }, // 1 year
  },
};

/**
 * CloudFront function for image format negotiation
 */
export const imageFormatNegotiationFunction = `
function handler(event) {
  var request = event.request;
  var headers = request.headers;
  var uri = request.uri;

  // Check if this is an image request
  if (!uri.match(/\\.(jpg|jpeg|png|webp|avif)$/)) {
    return request;
  }

  var accept = headers['accept'] ? headers['accept'].value : '';

  // AVIF support
  if (accept.includes('image/avif')) {
    request.uri = uri.replace(/\\.(jpg|jpeg|png|webp)$/, '.avif');
  }
  // WebP support
  else if (accept.includes('image/webp')) {
    request.uri = uri.replace(/\\.(jpg|jpeg|png)$/, '.webp');
  }

  return request;
}
`;

/**
 * CloudFront function for security headers
 */
export const securityHeadersFunction = `
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  // Security headers
  headers['strict-transport-security'] = {
    value: 'max-age=31536000; includeSubDomains; preload'
  };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'SAMEORIGIN' };
  headers['x-xss-protection'] = { value: '1; mode=block' };
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

  // CSP for images
  if (response.headers['content-type'] &&
      response.headers['content-type'].value.startsWith('image/')) {
    headers['content-security-policy'] = {
      value: "default-src 'none'; img-src 'self'"
    };
  }

  // CORS headers
  headers['access-control-allow-origin'] = { value: '*' };
  headers['access-control-allow-methods'] = { value: 'GET, HEAD, OPTIONS' };
  headers['access-control-max-age'] = { value: '86400' };

  return response;
}
`;

/**
 * Terraform configuration for CloudFront distribution
 */
export const terraformCloudFrontConfig = `
# CloudFront Distribution for Patina Media Assets

resource "aws_cloudfront_distribution" "patina_cdn" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Patina Product Catalog CDN"
  default_root_object = "index.html"
  price_class         = "PriceClass_All"
  http_version        = "http3"

  origin {
    domain_name = aws_s3_bucket.patina_media.bucket_regional_domain_name
    origin_id   = "S3-patina-media"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.patina_oai.cloudfront_access_identity_path
    }
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-patina-media"

    forwarded_values {
      query_string = true
      query_string_cache_keys = ["w", "h", "f", "q", "fit"]

      cookies {
        forward = "none"
      }

      headers = ["Accept", "CloudFront-Is-Mobile-Viewer", "CloudFront-Is-Desktop-Viewer"]
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.image_format.arn
    }

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.security_headers.arn
    }
  }

  # Cache behavior for processed images (immutable)
  ordered_cache_behavior {
    path_pattern     = "processed/images/*"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-patina-media"

    forwarded_values {
      query_string = true
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 31536000
    max_ttl                = 31536000
    compress               = true
  }

  # Cache behavior for 3D models
  ordered_cache_behavior {
    path_pattern     = "processed/3d/*"
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-patina-media"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 31536000
    max_ttl                = 31536000
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn_cert.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.cdn_waf.arn

  tags = {
    Environment = "production"
    Project     = "Patina"
    ManagedBy   = "Terraform"
  }
}

# CloudFront Origin Access Identity
resource "aws_cloudfront_origin_access_identity" "patina_oai" {
  comment = "OAI for Patina Media Bucket"
}

# CloudFront Functions
resource "aws_cloudfront_function" "image_format" {
  name    = "patina-image-format-negotiation"
  runtime = "cloudfront-js-1.0"
  comment = "Automatic WebP/AVIF format negotiation"
  publish = true
  code    = file("\${path.module}/functions/image-format.js")
}

resource "aws_cloudfront_function" "security_headers" {
  name    = "patina-security-headers"
  runtime = "cloudfront-js-1.0"
  comment = "Add security headers to responses"
  publish = true
  code    = file("\${path.module}/functions/security-headers.js")
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "cdn_waf" {
  name  = "patina-cdn-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 10000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "PatinaWebACL"
    sampled_requests_enabled   = true
  }
}
`;
