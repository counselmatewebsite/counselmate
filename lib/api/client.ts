/**
 * API Client for CounselMate Backend
 */

// Get API base URL at runtime, not at build time
function getAPIBaseURL(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use environment variable or default to localhost
    return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api';
  }
  // Server-side: use a default (though this shouldn't be used in practice)
  return 'http://localhost:8080/api';
}

class APIClient {
  private baseURL: string;
  private token: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || getAPIBaseURL();
    
    // Load token from localStorage on client side
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('access_token');
      console.debug('[APIClient] Initialized with baseURL:', this.baseURL);
      console.debug('[APIClient] Token loaded from localStorage:', !!this.token);
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('access_token', token);
      } else {
        localStorage.removeItem('access_token');
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private clearAuthStorage() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    }
  }

  private buildHeaders(options: RequestInit, token: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      console.debug('[APIClient.request] Authorization header set with token:', token.substring(0, 20) + '...');
    } else {
      console.debug('[APIClient.request] No token available, request will be unauthenticated');
    }

    return headers;
  }

  private canAttemptRefresh(endpoint: string): boolean {
    return !endpoint.startsWith('/auth/refresh')
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        this.clearAuthStorage();
        return null;
      }

      try {
        const response = await fetch(`${this.baseURL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!response.ok) {
          this.clearAuthStorage();
          return null;
        }

        const payload = await response.json() as { access_token?: string };
        if (!payload.access_token) {
          this.clearAuthStorage();
          return null;
        }

        this.setToken(payload.access_token);
        return payload.access_token;
      } catch {
        this.clearAuthStorage();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryOnAuthFailure = true,
  ): Promise<T> {
    // Always re-read from localStorage as source of truth
    // This ensures we have the latest token even if it was updated elsewhere
    const currentToken = this.token || (typeof window !== 'undefined' 
      ? localStorage.getItem('access_token') 
      : null);

    console.debug('[APIClient.request] Current token from memory:', !!this.token);
    console.debug('[APIClient.request] Current token from localStorage:', !!currentToken);

    const headers = this.buildHeaders(options, currentToken);

    console.debug('[APIClient.request] Calling:', this.baseURL + endpoint);
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    console.debug('[APIClient.request] Response status:', response.status, 'for endpoint:', endpoint);

    if (response.status === 401 && retryOnAuthFailure && this.canAttemptRefresh(endpoint)) {
      console.debug('[APIClient.request] Received 401, attempting token refresh');
      const refreshedToken = await this.refreshAccessToken();
      if (refreshedToken) {
        console.debug('[APIClient.request] Token refresh succeeded, retrying request');
        const retryHeaders = this.buildHeaders(options, refreshedToken);
        const retryResponse = await fetch(`${this.baseURL}${endpoint}`, {
          ...options,
          headers: retryHeaders,
        });

        if (retryResponse.ok) {
          return retryResponse.json();
        }

        const retryError = await retryResponse.json().catch(() => ({
          message: retryResponse.statusText,
        }));
        const retryErrorMessage = retryError.message || `HTTP error! status: ${retryResponse.status}`;
        const customRetryError = new Error(retryErrorMessage) as Error & { status?: number };
        customRetryError.status = retryResponse.status;
        customRetryError.message = `[${retryResponse.status}] ${retryErrorMessage}`;
        throw customRetryError;
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: response.statusText,
      }));
      
      // Create error with status code embedded
      const primaryMessage = error.message || error.error || `HTTP error! status: ${response.status}`;
      const details = typeof error.details === 'string' && error.details.trim().length > 0
        ? ` (${error.details})`
        : '';
      const errorMessage = `${primaryMessage}${details}`;
  const customError = new Error(errorMessage) as Error & { status?: number };
      customError.status = response.status;
      customError.message = `[${response.status}] ${errorMessage}`;
      
      console.error('[APIClient.request] Error thrown:', customError.message, { status: response.status });
      throw customError;
    }

    return response.json();
  }

  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new APIClient();

