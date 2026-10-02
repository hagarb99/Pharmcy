import { apiClient } from './client';
import type { PharmacyChangeRequestItem } from './admin';

export interface PharmacyProfileData {
  id: string;
  name: string;
  phone?: string | null;
  address: string;
  lat: number;
  lng: number;
  service_radius_km: number;
  license_number: string;
  verification_status: string;
  status: string;
  delivery_available: boolean;
  pending_change_requests: PharmacyChangeRequestItem[];
}

export interface PharmacyProfileUpdatePayload {
  delivery_available?: boolean;
  delivery_fee?: number;
  service_radius_km?: number;
  name?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface PharmacyProfileUpdateResponse {
  status: string;
  message: string;
  applied_immediately: string[];
  queued_for_approval: string[];
}

export const pharmacyApi = {
  getMyProfile: async (): Promise<PharmacyProfileData> => {
    const res = await apiClient.get<PharmacyProfileData>('/pharmacies/my-pharmacy');
    return res.data;
  },

  updateMyProfile: async (
    payload: PharmacyProfileUpdatePayload
  ): Promise<PharmacyProfileUpdateResponse> => {
    const res = await apiClient.patch<PharmacyProfileUpdateResponse>(
      '/pharmacies/my-pharmacy',
      payload
    );
    return res.data;
  },

  getMyChangeRequests: async (): Promise<PharmacyChangeRequestItem[]> => {
    const res = await apiClient.get<PharmacyChangeRequestItem[]>('/pharmacies/my-change-requests');
    return res.data;
  },
};
