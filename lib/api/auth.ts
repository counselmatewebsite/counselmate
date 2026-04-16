/**
 * Auth API endpoints
 */

import { apiClient } from './client';
import type {
  AuthResponse,
  LoginAuthResponse,
  LoginRequest,
  RegisterVerificationResponse,
  RegisterRequest,
  User,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from './types';

export interface RefreshTokenResponse {
  access_token: string;
  expires_at: string;
}

export const authAPI = {
  // Register new user
  register: async (data: RegisterRequest): Promise<RegisterVerificationResponse> => {
    return apiClient.post<RegisterVerificationResponse>('/auth/register', data);
  },

  // Login
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const normalizedPayload: LoginRequest = {
      ...data,
      email: data.email.trim().toLowerCase(),
    };

    const response = await apiClient.post<LoginAuthResponse>('/auth/login', normalizedPayload);

    if (!('tokens' in response)) {
      throw new Error('Invalid login response');
    }

    // Normalize nested tokens to flat format
    return {
      user: response.user,
      access_token: response.tokens.access_token,
      refresh_token: response.tokens.refresh_token,
    };
  },

  // Get current user
  getMe: async (): Promise<User> => {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.user; // Unwrap the nested user object
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
    apiClient.setToken(null);
  },

  // Refresh token
  refreshToken: async (refreshToken: string): Promise<RefreshTokenResponse> => {
    return apiClient.post<RefreshTokenResponse>('/auth/refresh', { refresh_token: refreshToken });
  },

  // Email verification
  verifyEmail: async (data: VerifyEmailRequest): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/verify-email', data);
  },

  // Resend verification email
  resendVerification: async (email: string): Promise<{ message: string }> => {
    return apiClient.post('/auth/resend-verification', { email });
  },

  // Forgot password
  forgotPassword: async (data: ForgotPasswordRequest): Promise<{ message: string }> => {
    return apiClient.post('/auth/forgot-password', data);
  },

  // Reset password
  resetPassword: async (data: ResetPasswordRequest): Promise<{ message: string }> => {
    return apiClient.post('/auth/reset-password', data);
  },

  // Google OAuth - Get auth URL
  getGoogleAuthUrl: async (): Promise<{ auth_url: string; state: string }> => {
    return apiClient.get('/auth/google/login');
  },

  // Google OAuth callback
  googleCallback: async (data: { code: string; desired_role?: 'APPRENTICE' | 'PROFESSIONAL' }): Promise<AuthResponse> => {
    return apiClient.post<AuthResponse>('/auth/google/callback', data);
  },
};
