/**
 * Environment variables with type safety
 */

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';
const projectDataMode = process.env.NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE || 'live';

/**
 * Get API URL based on environment
 */
const getApiUrl = (serviceName: string, defaultPort: number, defaultPath: string = '/v1'): string => {
  if (isDevelopment) {
    return `http://localhost:${defaultPort}${defaultPath}`;
  }
  return `https://api.patina.cloud/${serviceName}${defaultPath}`;
};

export const env = {
  // Direct backend API URLs (for server-side calls)
  projectsApiUrl: process.env.PROJECTS_API_URL || getApiUrl('projects', 3016),

  // API timeout
  apiTimeout: parseInt(process.env.API_TIMEOUT || '30000', 10),

  // Environment flags
  isDevelopment,
  isProduction: process.env.NODE_ENV === 'production',
  // Fixture projects are an explicit local-demo mode. A failed live query
  // must never silently turn into sample households.
  useProjectFixtures: isDevelopment && projectDataMode === 'fixtures',
} as const;
