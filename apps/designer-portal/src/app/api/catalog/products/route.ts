import { NextRequest, NextResponse } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
} from '@patina/api-routes';
import { apiError, apiUnauthorized } from '@patina/api-routes';
import { auth } from '@/lib/auth';
import jwt from 'jsonwebtoken';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// GET /api/catalog/products - List products
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/v1/products',
        },
        requireAuth: false, // Public listing
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300, staleWhileRevalidate: 60 }, // Cache for 5min
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/catalog/products - Create product (auth required)
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      // Get the session to verify user is authenticated
      const session = await auth();

      if (!session?.user) {
        return apiUnauthorized('Authentication required');
      }

      // Create a JWT token for the backend service
      // The backend shares the same JWT_SECRET so it can validate this token
      const jwtSecret = process.env.JWT_SECRET;

      if (!jwtSecret) {
        console.error('[API] JWT_SECRET is not configured. Set JWT_SECRET environment variable.');
        return apiUnauthorized('Server configuration error');
      }

      // Create a JWT token with user information using jsonwebtoken
      // issuer/audience must match what the backend JWT strategy expects
      const token = jwt.sign(
        {
          sub: session.user.id,
          email: session.user.email,
          name: session.user.name,
          roles: session.user.roles || [],
          permissions: session.user.permissions || [],
        },
        jwtSecret,
        {
          expiresIn: '1h',
          issuer: 'patina-user-management',
          audience: 'patina-api',
        }
      );

      // Clone the request and add the Authorization header
      const body = await request.text();
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${token}`);

      // Make the proxied request with auth header
      const backendUrl = `${CATALOG_URL}/v1/products`;
      const backendResponse = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Request-Id': context.requestId || crypto.randomUUID(),
        },
        body,
      });

      // Forward the response
      const responseData = await backendResponse.text();

      return new NextResponse(responseData, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: {
          'Content-Type': backendResponse.headers.get('Content-Type') || 'application/json',
        },
      });
    } catch (error) {
      console.error('[API] Create product error:', error);
      return apiError(error);
    }
  },
  { method: 'POST' }
);
