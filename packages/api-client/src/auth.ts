import { ApiClient } from './client';
import { LoginCredentials, RegisterData, AuthTokens, User } from '@patina/types';

export class AuthApi {
  constructor(private client: ApiClient) {}

  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    return this.client.post<AuthTokens>('/auth/login', credentials);
  }

  async register(data: RegisterData): Promise<User> {
    return this.client.post<User>('/auth/register', data);
  }

  async logout(): Promise<void> {
    return this.client.post<void>('/auth/logout');
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    return this.client.post<AuthTokens>('/auth/refresh', { refreshToken });
  }

  async getCurrentUser(): Promise<User> {
    return this.client.get<User>('/auth/me');
  }
}

