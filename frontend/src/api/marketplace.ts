import { apiClient } from './client';

export interface DrugItem {
  id?: string;
  request_id?: string;
  drug_name: string;
  dosage?: string;
  quantity: number;
  notes?: string;
}

export interface PrescriptionRequest {
  id: string;
  patient_id: string;
  status: 'pending' | 'active' | 'ordered' | 'cancelled' | 'completed';
  lat: number;
  lng: number;
  location_label?: string;
  delivery_preference: 'pickup_only' | 'delivery_preferred' | 'any';
  notes?: string;
  created_at: string;
  updated_at: string;
  items: DrugItem[];
  quotes_count: number;
  has_timed_out: boolean;
  timeout_at: string;
}

export interface QuoteItem {
  id?: string;
  drug_item_id: string;
  drug_name?: string;
  is_available: boolean;
  price: number;
  substitute_name?: string;
  notes?: string;
}

export interface PharmacyQuote {
  id: string;
  request_id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  pharmacy_address: string;
  pharmacy_phone?: string;
  distance_km?: number;
  status: 'submitted' | 'accepted' | 'rejected' | 'expired';
  delivery_available: boolean;
  delivery_fee: number;
  total_price: number;
  notes?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  items: QuoteItem[];
}

export interface NearbyRequestForPharmacy {
  id: string;
  patient_name: string;
  status: string;
  delivery_preference: 'pickup_only' | 'delivery_preferred' | 'any';
  location_label?: string;
  distance_km: number;
  notes?: string;
  created_at: string;
  items: DrugItem[];
  has_my_quote: boolean;
  my_quote_id?: string;
}

export interface Order {
  id: string;
  request_id: string;
  quote_id: string;
  patient_id: string;
  patient_name: string;
  patient_phone: string;
  pharmacy_id: string;
  pharmacy_name: string;
  pharmacy_address: string;
  pharmacy_phone?: string;
  status: 'confirmed' | 'in_preparation' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled';
  delivery_option: 'pickup' | 'delivery';
  items_total: number;
  delivery_fee: number;
  total_amount: number;
  patient_notes?: string;
  created_at: string;
  updated_at: string;
}

export const marketplaceApi = {
  // Patient endpoints
  createRequest: async (payload: {
    items: { drug_name: string; dosage?: string; quantity: number; notes?: string }[];
    lat?: number;
    lng?: number;
    location_label?: string;
    delivery_preference?: string;
    notes?: string;
  }): Promise<PrescriptionRequest> => {
    const res = await apiClient.post<PrescriptionRequest>('/requests', payload);
    return res.data;
  },

  getMyRequests: async (): Promise<PrescriptionRequest[]> => {
    const res = await apiClient.get<PrescriptionRequest[]>('/requests/my');
    return res.data;
  },

  getRequestDetail: async (requestId: string): Promise<any> => {
    const res = await apiClient.get(`/requests/${requestId}`);
    return res.data;
  },

  selectQuote: async (
    requestId: string,
    payload: { quote_id: string; delivery_option: 'pickup' | 'delivery'; patient_notes?: string }
  ): Promise<Order> => {
    const res = await apiClient.post<Order>(`/requests/${requestId}/select-quote`, payload);
    return res.data;
  },

  cancelRequest: async (requestId: string): Promise<{ message: string }> => {
    const res = await apiClient.post(`/requests/${requestId}/cancel`);
    return res.data;
  },

  // Pharmacy endpoints
  getIncomingRequests: async (): Promise<NearbyRequestForPharmacy[]> => {
    const res = await apiClient.get<NearbyRequestForPharmacy[]>('/pharmacies/incoming-requests');
    return res.data;
  },

  submitQuote: async (payload: {
    request_id: string;
    items: { drug_item_id: string; is_available: boolean; price: number; substitute_name?: string; notes?: string }[];
    delivery_available: boolean;
    delivery_fee: number;
    notes?: string;
  }): Promise<PharmacyQuote> => {
    const res = await apiClient.post<PharmacyQuote>('/quotes', payload);
    return res.data;
  },

  getMyQuotes: async (): Promise<PharmacyQuote[]> => {
    const res = await apiClient.get<PharmacyQuote[]>('/quotes/my');
    return res.data;
  },

  // Orders endpoints
  getMyOrders: async (): Promise<Order[]> => {
    const res = await apiClient.get<Order[]>('/orders');
    return res.data;
  },

  updateOrderStatus: async (orderId: string, newStatus: string): Promise<Order> => {
    const res = await apiClient.patch<Order>(`/orders/${orderId}/status`, { status: newStatus });
    return res.data;
  },
};
