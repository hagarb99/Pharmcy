import { apiClient } from './client';
import type { Pharmacy, PharmacyVerificationStatus } from './auth';

export interface AdminStats {
  total_users: number;
  total_patients: number;
  total_pharmacies: number;
  pending_pharmacies: number;
  verified_pharmacies: number;
}

export interface AuditLogItem {
  id: string;
  user_id?: string | null;
  action: string;
  target: string;
  ip?: string | null;
  metadata_json?: Record<string, unknown> | null;
  timestamp: string;
}

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const res = await apiClient.get<AdminStats>('/admin/stats');
    return res.data;
  },

  listPharmacies: async (status?: PharmacyVerificationStatus): Promise<Pharmacy[]> => {
    const params: Record<string, string> = {};
    if (status) {
      params.verification_status = status;
    }
    const res = await apiClient.get<Pharmacy[]>('/admin/pharmacies', { params });
    return res.data;
  },

  updatePharmacyVerification: async (
    pharmacyId: string,
    action: 'approve' | 'reject',
    reason?: string
  ): Promise<Pharmacy> => {
    const res = await apiClient.post<Pharmacy>(
      `/admin/pharmacies/${pharmacyId}/verification`,
      { action, reason }
    );
    return res.data;
  },

  listAuditLogs: async (limit: number = 50): Promise<AuditLogItem[]> => {
    const res = await apiClient.get<AuditLogItem[]>('/admin/audit-logs', {
      params: { limit },
    });
    return res.data;
  },
};
