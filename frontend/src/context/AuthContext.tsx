import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import type { Pharmacy, TokenResponse, User, UserRole } from '../api/auth';

interface AuthContextType {
  user: User | null;
  pharmacy: Pharmacy | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (identifier: string, pass: string) => Promise<TokenResponse>;
  verifyOtp: (identifier: string, code: string) => Promise<TokenResponse>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('auth_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [pharmacy, setPharmacy] = useState<Pharmacy | null>(() => {
    const cached = localStorage.getItem('auth_pharmacy');
    return cached ? JSON.parse(cached) : null;
  });
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('access_token');
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setAuthSession = (data: TokenResponse) => {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('auth_user', JSON.stringify(data.user));
    if (data.pharmacy) {
      localStorage.setItem('auth_pharmacy', JSON.stringify(data.pharmacy));
      setPharmacy(data.pharmacy);
    } else {
      localStorage.removeItem('auth_pharmacy');
      setPharmacy(null);
    }
    setToken(data.access_token);
    setUser(data.user);
  };

  const refreshProfile = async () => {
    try {
      if (!localStorage.getItem('access_token')) return;
      const res = await authApi.getMe();
      setUser(res.user);
      localStorage.setItem('auth_user', JSON.stringify(res.user));
      if (res.pharmacy) {
        setPharmacy(res.pharmacy);
        localStorage.setItem('auth_pharmacy', JSON.stringify(res.pharmacy));
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        await refreshProfile();
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (identifier: string, pass: string): Promise<TokenResponse> => {
    const data = await authApi.login(identifier, pass);
    setAuthSession(data);
    return data;
  };

  const verifyOtp = async (identifier: string, code: string): Promise<TokenResponse> => {
    const data = await authApi.verifyOtp(identifier, code);
    setAuthSession(data);
    return data;
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    setPharmacy(null);
    setToken(null);
  };

  const hasRole = (roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        pharmacy,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        verifyOtp,
        logout,
        refreshProfile,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
