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

export interface AdvancedAdminStats {
  total_requests: number;
  total_orders: number;
  fulfillment_rate_percent: number;
  pending_change_requests: number;
  active_verified_pharmacies: number;
}

export interface PharmacyChangeRequestItem {
  id: string;
  pharmacy_id: string;
  pharmacy_name?: string | null;
  pharmacy_license?: string | null;
  field_name: string;
  old_value: string;
  new_value: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
}

export const adminApi = {
  getStats: async (): Promise<AdminStats> => {
    const res = await apiClient.get<AdminStats>('/admin/stats');
    return res.data;
  },

  getAdvancedStats: async (): Promise<AdvancedAdminStats> => {
    const res = await apiClient.get<AdvancedAdminStats>('/admin/stats/advanced');
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

  togglePharmacyStatus: async (pharmacyId: string): Promise<Pharmacy> => {
    const res = await apiClient.post<Pharmacy>(`/admin/pharmacies/${pharmacyId}/toggle-status`);
    return res.data;
  },

  listChangeRequests: async (status?: 'pending' | 'approved' | 'rejected'): Promise<PharmacyChangeRequestItem[]> => {
    const params: Record<string, string> = {};
    if (status) {
      params.status = status;
    }
    const res = await apiClient.get<PharmacyChangeRequestItem[]>('/admin/change-requests', { params });
    return res.data;
  },

  approveChangeRequest: async (requestId: string, adminNotes?: string): Promise<PharmacyChangeRequestItem> => {
    const res = await apiClient.post<PharmacyChangeRequestItem>(
      `/admin/change-requests/${requestId}/approve`,
      { admin_notes: adminNotes }
    );
    return res.data;
  },

  rejectChangeRequest: async (requestId: string, adminNotes?: string): Promise<PharmacyChangeRequestItem> => {
    const res = await apiClient.post<PharmacyChangeRequestItem>(
      `/admin/change-requests/${requestId}/reject`,
      { admin_notes: adminNotes }
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
