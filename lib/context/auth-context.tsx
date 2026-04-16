/**
 * Authentication Context Provider
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI, apiClient } from '@/lib/api';
import type { User, LoginRequest, RegisterRequest, RegisterVerificationResponse } from '@/lib/api/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<{ verificationRequired: boolean; email?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      // Always reload token from localStorage to ensure we have the latest
      const storedToken = typeof window !== 'undefined' 
        ? localStorage.getItem('access_token')
        : null;
      
      console.debug('[AuthContext] Refreshing user, stored token exists:', !!storedToken);
      
      if (!storedToken) {
        console.debug('[AuthContext] No stored token found, setting user to null');
        setUser(null);
        apiClient.setToken(null);
        return;
      }

      // Update the API client with the token from localStorage
      apiClient.setToken(storedToken);
      
      console.debug('[AuthContext] Calling getMe() to fetch user data');
      const userData = await authAPI.getMe();
      console.debug('[AuthContext] User data loaded:', userData?.email);
      setUser(userData);
    } catch (error) {
      console.error('[AuthContext] Failed to refresh user:', error);
      setUser(null);
      apiClient.setToken(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      try {
        console.debug('[AuthContext] useEffect: Starting auth initialization');
        // Check localStorage directly
        const storedToken = typeof window !== 'undefined' 
          ? localStorage.getItem('access_token')
          : null;
        
        console.debug('[AuthContext] Stored token exists:', !!storedToken);
        
        if (storedToken) {
          // Ensure API client has the token BEFORE making requests
          apiClient.setToken(storedToken);
          console.debug('[AuthContext] API client token set');
          
          try {
            console.debug('[AuthContext] Fetching user data with token:', storedToken.substring(0, 20) + '...');
            const userData = await authAPI.getMe();
            console.debug('[AuthContext] User data loaded successfully:', userData?.email);
            if (isMounted) {
              setUser(userData);
              console.debug('[AuthContext] User state updated');
            }
          } catch (error: any) {
            console.error('[AuthContext] Failed to fetch user data:', error);
            
            // Extract status from error - check multiple places
            let status = null;
            if (error?.status !== undefined) {
              status = error.status;
            } else if (error?.response?.status !== undefined) {
              status = error.response.status;
            } else if (error?.message) {
              // Check if error message contains status code
              const statusMatch = error.message.match(/(\d{3})/);
              if (statusMatch) {
                status = parseInt(statusMatch[1]);
              }
            }
            
            console.error('[AuthContext] Error details:', {
              message: error instanceof Error ? error.message : String(error),
              status: status,
              errorObject: error
            });
            
            // Only clear auth state if the token is actually invalid (401/403)
            if (status === 401 || status === 403) {
              console.debug('[AuthContext] Token invalid (401/403), clearing auth state');
              if (isMounted) {
                setUser(null);
                apiClient.setToken(null);
                localStorage.removeItem('access_token');
              }
            } else {
              // Network error etc — don't log user out, just clear UI state
              console.debug('[AuthContext] Non-auth error, keeping token in localStorage');
              if (isMounted) {
                setUser(null); // Clear UI state but keep token
              }
            }
          }
        } else {
          console.debug('[AuthContext] No token found, user not authenticated');
          if (isMounted) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('[AuthContext] Unexpected error during initialization:', error);
      } finally {
        if (isMounted) {
          console.debug('[AuthContext] Setting loading to false');
          setLoading(false);
        }
      }
    };
    
    initialize();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials: LoginRequest) => {
    const response = await authAPI.login(credentials);

    if (!response.access_token || !response.refresh_token || !response.user) {
      throw new Error('Invalid login response');
    }

    apiClient.setToken(response.access_token);
    
    // Store refresh token
    if (typeof window !== 'undefined') {
      localStorage.setItem('refresh_token', response.refresh_token);
    }
    
    setUser(response.user);
  };

  const register = async (data: RegisterRequest) => {
	const response = await authAPI.register(data) as RegisterVerificationResponse;
	return {
		verificationRequired: !!response.verification_required,
		email: response.email,
	};
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      apiClient.setToken(null);
      
      if (typeof window !== 'undefined') {
        localStorage.removeItem('refresh_token');
      }
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    setUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
