import { apiClient } from './client';

export type UserRole = 'patient' | 'pharmacy' | 'admin';
export type PharmacyVerificationStatus = 'pending' | 'verified' | 'rejected';
export type PharmacyStatus = 'active' | 'suspended' | 'inactive';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  lat?: number | null;
  lng?: number | null;
  location?: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Pharmacy {
  id: string;
  user_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  service_radius_km: number;
  license_number: string;
  verification_status: PharmacyVerificationStatus;
  status: PharmacyStatus;
  delivery_available: boolean;
  rejection_reason?: string | null;
  created_at: string;
  user?: User | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
  pharmacy?: Pharmacy | null;
}

export interface RegisterResponse {
  message: string;
  identifier: string;
  requires_otp: boolean;
  is_re_registration: boolean;
}

export const authApi = {
  registerPatient: async (data: {
    name: string;
    email: string;
    phone: string;
    password: string;
    lat?: number;
    lng?: number;
    location?: string;
  }): Promise<RegisterResponse> => {
    const res = await apiClient.post<RegisterResponse>('/auth/register/patient', data);
    return res.data;
  },

  registerPharmacy: async (data: {
    representative_name: string;
    email: string;
    phone: string;
    password: string;
    pharmacy_name: string;
    address: string;
    license_number: string;
    lat: number;
    lng: number;
    service_radius_km?: number;
    delivery_available?: boolean;
  }): Promise<RegisterResponse> => {
    const res = await apiClient.post<RegisterResponse>('/auth/register/pharmacy', data);
    return res.data;
  },

  login: async (identifier: string, password: string): Promise<TokenResponse> => {
    const res = await apiClient.post<TokenResponse>('/auth/login', {
      identifier,
      password,
    });
    return res.data;
  },

  verifyOtp: async (identifier: string, code: string): Promise<TokenResponse> => {
    const res = await apiClient.post<TokenResponse>('/auth/verify-otp', {
      identifier,
      code,
    });
    return res.data;
  },

  resendOtp: async (identifier: string): Promise<{ message: string; identifier: string }> => {
    const res = await apiClient.post<{ message: string; identifier: string }>('/auth/resend-otp', {
      identifier,
    });
    return res.data;
  },

  getMe: async (): Promise<{ user: User; pharmacy?: Pharmacy | null }> => {
    const res = await apiClient.get<{ user: User; pharmacy?: Pharmacy | null }>('/auth/me');
    return res.data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken });
      } catch (e) {
        console.warn('Logout revocation warning:', e);
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_pharmacy');
  },
};
