/**
 * Environment variables with type safety
 */

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

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
  commsApiUrl: process.env.COMMS_API_URL || getApiUrl('comms', 3017),

  // API timeout
  apiTimeout: parseInt(process.env.API_TIMEOUT || '30000', 10),

  // Environment flags
  isDevelopment,
  isProduction: process.env.NODE_ENV === 'production',
} as const;
