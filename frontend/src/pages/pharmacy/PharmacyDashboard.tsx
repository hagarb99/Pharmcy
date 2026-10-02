import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { apiClient } from '../../api/client';
import { marketplaceApi, type NearbyRequestForPharmacy, type Order } from '../../api/marketplace';
import { pharmacyApi, type PharmacyProfileData } from '../../api/pharmacy';
import {
  Building2,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Key,
  Pill,
  ShoppingBag,
  Send,
  X,
  Truck,
  ArrowRight,
  Sparkles,
  FileEdit,
  Navigation,
  Eye,
  AlertTriangle,
} from 'lucide-react';

interface QuoteItemInput {
  drug_item_id: string;
  drug_name: string;
  is_available: boolean;
  price: number;
  substitute_name: string;
  notes: string;
}

export const PharmacyDashboard: React.FC = () => {
  const { user, pharmacy, refreshProfile } = useAuth();
  const { subscribe, isConnected } = useWebSocket();

  const isPending = pharmacy?.verification_status === 'pending';
  const isVerified = pharmacy?.verification_status === 'verified';
  const isRejected = pharmacy?.verification_status === 'rejected';

  // Guard test state
  const [guardTestResult, setGuardTestResult] = useState<{ status: string; message: string } | null>(null);
  const [isTestingGuard, setIsTestingGuard] = useState(false);

  // Marketplace state
  const [incomingRequests, setIncomingRequests] = useState<NearbyRequestForPharmacy[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Real-time toast
  const [liveToast, setLiveToast] = useState<{ title: string; message: string } | null>(null);

  // Quoting modal state
  const [activeQuotingRequest, setActiveQuotingRequest] = useState<NearbyRequestForPharmacy | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItemInput[]>([]);
  const [deliveryAvailable, setDeliveryAvailable] = useState<boolean>(pharmacy?.delivery_available || false);
  const [deliveryFee, setDeliveryFee] = useState<number>(15.0);
  const [quoteNotes, setQuoteNotes] = useState<string>('');
  const [isSubmittingQuote, setIsSubmittingQuote] = useState<boolean>(false);

  // Prescription Image viewing modal state
  const [inspectingImageUrl, setInspectingImageUrl] = useState<string | null>(null);
  const [inspectingRequestTitle, setInspectingRequestTitle] = useState<string | null>(null);

  // Profile and Settings modal state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [profileData, setProfileData] = useState<PharmacyProfileData | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [profileAddress, setProfileAddress] = useState<string>('');
  const [profileLat, setProfileLat] = useState<number | undefined>(undefined);
  const [profileLng, setProfileLng] = useState<number | undefined>(undefined);
  const [profileDelivery, setProfileDelivery] = useState<boolean>(false);
  const [profileRadius, setProfileRadius] = useState<number>(5.0);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);
  const [profileFeedbackMsg, setProfileFeedbackMsg] = useState<string | null>(null);
  const [profileFeedbackError, setProfileFeedbackError] = useState<string | null>(null);

  const handleOpenProfileModal = async () => {
    setIsProfileModalOpen(true);
    setProfileFeedbackMsg(null);
    setProfileFeedbackError(null);
    setIsLoadingProfile(true);

    // 1. Immediately pre-fill with existing pharmacy/user data so the inputs are never blank:
    if (pharmacy) {
      setProfileName(pharmacy.name || '');
      setProfilePhone(pharmacy?.user?.phone || user?.phone || '');
      setProfileAddress(pharmacy.address || '');
      setProfileLat(pharmacy.lat);
      setProfileLng(pharmacy.lng);
      setProfileDelivery(pharmacy.delivery_available ?? false);
      setProfileRadius(pharmacy.service_radius_km ?? 5.0);
    } else if (user?.phone) {
      setProfilePhone(user.phone);
    }

    // 2. Fetch fresh profile & pending requests from backend:
    try {
      const data = await pharmacyApi.getMyProfile();
      setProfileData(data);
      if (data.name) setProfileName(data.name);
      if (data.phone) setProfilePhone(data.phone);
      if (data.address) setProfileAddress(data.address);
      if (data.lat !== undefined && data.lat !== null) setProfileLat(data.lat);
      if (data.lng !== undefined && data.lng !== null) setProfileLng(data.lng);
      if (data.delivery_available !== undefined) setProfileDelivery(data.delivery_available);
      if (data.service_radius_km !== undefined) setProfileRadius(data.service_radius_km);
    } catch (err: any) {
      console.error('Failed to load pharmacy profile:', err);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleDetectProfileLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setProfileLat(pos.coords.latitude);
      setProfileLng(pos.coords.longitude);
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileFeedbackMsg(null);
    setProfileFeedbackError(null);

    // Build payload with only sanitized non-empty fields:
    const payload: any = {
      delivery_available: profileDelivery,
      service_radius_km: profileRadius,
    };
    if (profileName && profileName.trim()) {
      payload.name = profileName.trim();
    }
    if (profilePhone && profilePhone.trim()) {
      payload.phone = profilePhone.trim();
    }
    if (profileAddress && profileAddress.trim()) {
      payload.address = profileAddress.trim();
    }
    if (profileLat !== undefined && profileLat !== null) payload.lat = profileLat;
    if (profileLng !== undefined && profileLng !== null) payload.lng = profileLng;

    try {
      const res = await pharmacyApi.updateMyProfile(payload);
      setProfileFeedbackMsg(res.message);
      await refreshProfile();
      const updated = await pharmacyApi.getMyProfile();
      setProfileData(updated);
    } catch (err: any) {
      let detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        detail = detail.map((d: any) => d.msg || JSON.stringify(d)).join(' - ');
      } else if (typeof detail === 'object' && detail !== null) {
        detail = JSON.stringify(detail);
      }
      setProfileFeedbackError(detail || 'حدث خطأ أثناء حفظ التعديلات.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleViewPrescriptionImage = async (reqId: string, patientName: string) => {
    setInspectingRequestTitle(`روشتة المريض: ${patientName}`);
    try {
      const blobUrl = await marketplaceApi.fetchPrescriptionImageBlob(reqId);
      setInspectingImageUrl(blobUrl);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'فشل تحميل صورة الروشتة أو لا تملك صلاحية الوصول.');
    }
  };

  const fetchPharmacyMarketplaceData = async () => {
    if (!isVerified) return;
    setIsLoadingFeed(true);
    try {
      const [reqs, ords] = await Promise.all([
        marketplaceApi.getIncomingRequests(),
        marketplaceApi.getMyOrders(),
      ]);
      setIncomingRequests(reqs);
      setOrders(ords);
    } catch (err) {
      console.error('Failed to load pharmacy marketplace data:', err);
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    if (isVerified) {
      fetchPharmacyMarketplaceData();
    }
  }, [isVerified]);

  // Real-time WebSocket subscriptions
  useEffect(() => {
    if (!isVerified) return;

    const unsubIncoming = subscribe('NEW_INCOMING_REQUEST', (data) => {
      setLiveToast({
        title: 'طلب دواء وارد جديد في نطاقك!',
        message: `طلب جديد من المريض ${data.patient_name} في منطقة ${data.location_label || ''} (${data.items_count} أصناف)`,
      });
      fetchPharmacyMarketplaceData();
    });

    const unsubOrder = subscribe('ORDER_CONFIRMED', (data) => {
      setLiveToast({
        title: 'مبروك! تم اختيار صيدليتك للطلب',
        message: `المريض ${data.patient_name} وافق على عرضك بقيمة ${data.total_amount} ج.م`,
      });
      fetchPharmacyMarketplaceData();
    });

    const unsubQuoteClosed = subscribe('QUOTE_CLOSED', () => {
      fetchPharmacyMarketplaceData();
    });

    return () => {
      unsubIncoming();
      unsubOrder();
      unsubQuoteClosed();
    };
  }, [isVerified]);

  const testActiveOrdersGuard = async () => {
    setIsTestingGuard(true);
    setGuardTestResult(null);
    try {
      const res = await apiClient.get('/pharmacies/active-orders-guard');
      setGuardTestResult({
        status: 'success',
        message: res.data.message || 'تم السماح بالوصول: الصيدلية معتمدة ومؤهلة لاستقبال الطلبات.',
      });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setGuardTestResult({
        status: 'forbidden',
        message: typeof detail === 'string' ? detail : 'تم رفض الإجراء (403): الحساب قيد مراجعة الترخيص.',
      });
    } finally {
      setIsTestingGuard(false);
    }
  };

  const openQuoteModal = (req: NearbyRequestForPharmacy) => {
    setActiveQuotingRequest(req);
    setQuoteItems(
      req.items.map((it) => ({
        drug_item_id: it.id || '',
        drug_name: it.drug_name,
        is_available: true,
        price: 50.0,
        substitute_name: '',
        notes: '',
      }))
    );
    setDeliveryAvailable(pharmacy?.delivery_available || false);
    setDeliveryFee(15.0);
    setQuoteNotes('');
  };

  const handleQuoteItemChange = (index: number, field: keyof QuoteItemInput, value: any) => {
    const updated = [...quoteItems];
    updated[index] = { ...updated[index], [field]: value };
    setQuoteItems(updated);
  };

  const calculateQuoteTotal = () => {
    const itemsTotal = quoteItems.reduce((sum, it) => sum + (it.is_available ? it.price : 0), 0);
    const fee = deliveryAvailable ? deliveryFee : 0;
    return itemsTotal + fee;
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeQuotingRequest) return;

    setIsSubmittingQuote(true);
    try {
      await marketplaceApi.submitQuote({
        request_id: activeQuotingRequest.id,
        items: quoteItems.map((qi) => ({
          drug_item_id: qi.drug_item_id,
          is_available: qi.is_available,
          price: qi.price,
          substitute_name: qi.substitute_name || undefined,
          notes: qi.notes || undefined,
        })),
        delivery_available: deliveryAvailable,
        delivery_fee: deliveryAvailable ? deliveryFee : 0.0,
        notes: quoteNotes || undefined,
      });

      setActiveQuotingRequest(null);
      await fetchPharmacyMarketplaceData();
      setStatusMsg('تم إرسال تسعيرتك بنجاح وبثها للمريض للمقارنة!');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'حدث خطأ أثناء إرسال عرض السعر.');
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      await marketplaceApi.updateOrderStatus(orderId, nextStatus);
      await fetchPharmacyMarketplaceData();
      setStatusMsg(`تم تحديث حالة الطلب بنجاح إلى: ${getOrderStatusArabic(nextStatus)}`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'حدث خطأ أثناء تحديث حالة الطلب.');
    }
  };

  const getOrderStatusArabic = (st: string) => {
    switch (st) {
      case 'confirmed':
        return 'مؤكد وبانتظار التجهيز';
      case 'in_preparation':
        return 'قيد التجهيز';
      case 'ready_for_pickup':
        return 'جاهز للاستلام';
      case 'out_for_delivery':
        return 'جاري التوصيل';
      case 'completed':
        return 'مكتمل ومستلم';
      default:
        return st;
    }
  };

  return (
    <div>
      {/* Live Toast alert */}
      {liveToast && (
        <div
          className="alert alert-success"
          style={{
            position: 'fixed',
            top: '80px',
            left: '20px',
            zIndex: 9999,
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            maxWidth: '420px',
          }}
        >
          <Sparkles size={24} color="#059669" />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.95rem' }}>{liveToast.title}</strong>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>{liveToast.message}</p>
          </div>
          <button
            onClick={() => setLiveToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          color: 'white',
          padding: '2rem',
          marginBottom: '1.5rem',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ background: 'rgba(255,255,255,0.15)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                لوحة تحكم الصيدلية
              </span>
              <span
                style={{
                  background: isConnected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                  color: isConnected ? '#bbf7d0' : '#fecaca',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444' }} />
                {isConnected ? 'الاتصال اللحظي متصل' : 'جاري الاتصال...'}
              </span>
            </div>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>{pharmacy?.name || 'صيدليتي'}</h1>
            <p style={{ opacity: 0.85, fontSize: '0.95rem', marginTop: '0.25rem' }}>
              المسؤول: {user?.name} | رقم الترخيص: <code style={{ color: '#38bdf8' }}>{pharmacy?.license_number}</code> | نطاق التغطية: {pharmacy?.service_radius_km} كم
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleOpenProfileModal}
              className="btn btn-sm"
              style={{ background: 'white', color: '#0f172a', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <FileEdit size={15} />
              <span>إعدادات وتعديل بيانات الصيدلية</span>
            </button>

            <button
              onClick={() => {
                refreshProfile();
                fetchPharmacyMarketplaceData();
              }}
              className="btn btn-outline btn-sm"
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              <RefreshCw size={14} className={isLoadingFeed ? 'spin' : ''} />
              <span>تحديث البيانات</span>
            </button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Verification Status Alert Boxes */}
      {isPending && (
        <div className="alert alert-warning" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
          <Clock size={24} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.2rem' }}>
              حساب الصيدلية قيد التحقق من الترخيص الرسمي (Pending Verification)
            </h4>
            <p style={{ fontSize: '0.9rem' }}>
              تم إرسال بيانات الصيدلية ورقم الترخيص <code>{pharmacy?.license_number}</code> إلى إدارة المنصة. لن تتمكن الصيدلية من استقبال طلبات المرضى حتى اعتماد الترخيص لضمان الموثوقية.
            </p>
          </div>
          <span className="badge badge-pending" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
            قيد المراجعة
          </span>
        </div>
      )}

      {isVerified && (
        <div className="alert alert-success" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
          <ShieldCheck size={24} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.2rem' }}>
              تم اعتماد وتوثيق الصيدلية بنجاح (Verified)
            </h4>
            <p style={{ fontSize: '0.9rem' }}>
              الصيدلية معتمدة ونشطة وتستقبل طلبات المرضى في نطاق جغرافي قدره <strong>{pharmacy?.service_radius_km} كم</strong>.
            </p>
          </div>
          <span className="badge badge-verified" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
            معتمدة رسمياً
          </span>
        </div>
      )}

      {isRejected && (
        <div className="alert alert-danger" style={{ alignItems: 'center', marginBottom: '1.5rem' }}>
          <AlertCircle size={24} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.2rem' }}>
              تم رفض اعتماد ترخيص الصيدلية (Rejected)
            </h4>
            <p style={{ fontSize: '0.9rem' }}>
              سبب الرفض: <strong>{pharmacy?.rejection_reason || 'رقم الترخيص غير مطابق لسجلات النقابة'}</strong>
            </p>
          </div>
        </div>
      )}

      {/* Main Marketplace Sections for Verified Pharmacies */}
      {isVerified ? (
        <div className="grid grid-cols-2" style={{ marginBottom: '2rem' }}>
          {/* Left: Incoming Requests Feed */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Pill size={20} color="var(--primary-600)" />
                  طلبات المرضى في نطاقك ({incomingRequests.length})
                </h3>
                <p className="card-subtitle">الطلبات الواردة لحظياً ضمن نطاق الـ {pharmacy?.service_radius_km} كم</p>
              </div>
            </div>

            {incomingRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--slate-500)' }}>
                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <h4 style={{ fontWeight: 800 }}>لا توجد طلبات جديدة في نطاق صيدليتك حالياً</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  فور قيام مريض في محيط {pharmacy?.service_radius_km} كم بطلب دواء، سيظهر هنا مباشرة وبشكل لحظي
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      padding: '1.25rem',
                      border: '1px solid var(--slate-200)',
                      borderRadius: 'var(--radius-md)',
                      background: req.has_my_quote ? '#f8fafc' : 'white',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <span
                          style={{
                            background: 'var(--primary-50)',
                            color: 'var(--primary-700)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            display: 'inline-block',
                            marginBottom: '0.35rem',
                          }}
                        >
                          على بعد {req.distance_km} كم من صيدليتك
                        </span>
                        <h4 style={{ fontWeight: 800, fontSize: '1.05rem', margin: '0.1rem 0' }}>
                          المريض: {req.patient_name}
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                          الموقع: {req.location_label || 'غير محدد'} | {new Date(req.created_at).toLocaleTimeString('ar-EG')}
                        </p>
                      </div>

                      {req.has_my_quote ? (
                        <span className="badge badge-verified" style={{ fontSize: '0.8rem' }}>
                          ✓ تم تقديم تسعيرتك
                        </span>
                      ) : (
                        <span className="badge badge-pending" style={{ fontSize: '0.8rem' }}>
                          بانتظار تسعيرتك
                        </span>
                      )}
                    </div>

                    {/* Prescription Image Inspection Badge & Action */}
                    {req.has_prescription_image && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#fdf4ff',
                          border: '1px solid #f0abfc',
                          padding: '0.6rem 0.85rem',
                          borderRadius: 'var(--radius-sm)',
                          marginBottom: '0.75rem',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', color: '#86198f', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          📸 مرفق صورة روشتة طبية من المريض
                        </span>
                        <button
                          type="button"
                          onClick={() => handleViewPrescriptionImage(req.id, req.patient_name)}
                          className="btn btn-sm"
                          style={{
                            background: '#86198f',
                            color: 'white',
                            fontWeight: 700,
                            padding: '0.35rem 0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                          }}
                        >
                          <Eye size={15} />
                          <span>معاينة وتكبير الروشتة</span>
                        </button>
                      </div>
                    )}

                    {/* Drugs Requested */}
                    <div style={{ background: 'var(--slate-50)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--slate-700)', display: 'block', marginBottom: '0.35rem' }}>
                        الأدوية والكميات المطلوبة:
                      </strong>
                      <ul style={{ margin: 0, paddingRight: '1.25rem', fontSize: '0.85rem' }}>
                        {req.items.map((item, idx) => (
                          <li key={idx} style={{ marginBottom: '0.2rem' }}>
                            <strong>{item.drug_name}</strong> {item.dosage && `(${item.dosage})`} — الكمية: {item.quantity} {item.notes && `[ملاحظة: ${item.notes}]`}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                        تفضيل التوصيل: <strong>{req.delivery_preference === 'delivery_preferred' ? 'يفضل توصيل' : req.delivery_preference === 'pickup_only' ? 'استلام من الصيدلية' : 'أي طريقة'}</strong>
                      </span>

                      <button
                        onClick={() => openQuoteModal(req)}
                        className={`btn btn-sm ${req.has_my_quote ? 'btn-outline' : 'btn-primary'}`}
                      >
                        <Send size={14} />
                        <span>{req.has_my_quote ? 'تعديل عرض السعر' : 'تقديم تسعيرة وتوفر'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Confirmed Orders & Processing */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={20} color="var(--primary-600)" />
                طلبات الشراء المؤكدة ({orders.length})
              </h3>
              <p className="card-subtitle">الطلبات التي وافق المرضى على تسعيرتك فيها لبدء التحضير والتسليم</p>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--slate-500)' }}>
                <ShoppingBag size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <h4 style={{ fontWeight: 800 }}>لا توجد أوامر شراء مؤكدة حالياً</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  عندما يختار مريض عرض سعرك، سيظهر أمر الشراء هنا لتبدأ في تجهيزه
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    style={{
                      padding: '1.25rem',
                      border: '1px solid var(--slate-200)',
                      borderRadius: 'var(--radius-md)',
                      background: 'white',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div>
                        <strong style={{ fontSize: '1rem', color: 'var(--slate-900)' }}>المريض: {ord.patient_name}</strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                          هاتف العميل: <strong>{ord.patient_phone}</strong>
                        </p>
                        {ord.patient_notes && (
                          <p style={{ fontSize: '0.8rem', color: 'var(--slate-600)', background: 'var(--slate-50)', padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                            ملاحظة العميل: {ord.patient_notes}
                          </p>
                        )}
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-700)', display: 'block' }}>
                          {ord.total_amount} ج.م
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                          {ord.delivery_option === 'delivery' ? `توصيل (+${ord.delivery_fee} ج)` : 'استلام من الصيدلية'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--slate-100)' }}>
                      <span className="badge badge-verified" style={{ fontSize: '0.8rem' }}>
                        الحالة: {getOrderStatusArabic(ord.status)}
                      </span>

                      {/* Progression Controls */}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {ord.status === 'confirmed' && (
                          <button
                            onClick={() => handleUpdateOrderStatus(ord.id, 'in_preparation')}
                            className="btn btn-primary btn-sm"
                          >
                            <span>بدء التجهيز</span>
                            <ArrowRight size={14} />
                          </button>
                        )}

                        {ord.status === 'in_preparation' && (
                          <button
                            onClick={() =>
                              handleUpdateOrderStatus(
                                ord.id,
                                ord.delivery_option === 'delivery' ? 'out_for_delivery' : 'ready_for_pickup'
                              )
                            }
                            className="btn btn-primary btn-sm"
                          >
                            <span>{ord.delivery_option === 'delivery' ? 'بدء التوصيل' : 'جاهز للاستلام'}</span>
                            <ArrowRight size={14} />
                          </button>
                        )}

                        {['ready_for_pickup', 'out_for_delivery'].includes(ord.status) && (
                          <button
                            onClick={() => handleUpdateOrderStatus(ord.id, 'completed')}
                            className="btn btn-success btn-sm"
                            style={{ background: '#16a34a', color: 'white' }}
                          >
                            <CheckCircle2 size={14} />
                            <span>تم التسليم بنجاح</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Verification Guard Live Test Box & Profile Details */}
      <div className="grid grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Key size={20} color="var(--primary-600)" />
              اختبار جدار الحماية والصلاحيات (Verification Guard)
            </h3>
            <p className="card-subtitle">
              يحظر النظام تلقائياً أي وصول لطلبات المرضى إذا كانت الصيدلية غير معتمدة
            </p>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)', marginBottom: '1.25rem' }}>
            يمكنك تجربة إرسال طلب إلى نقطة النهاية المحمية <code>/api/v1/pharmacies/active-orders-guard</code> للتحقق من عمل جدار حماية الاعتماد:
          </p>

          <button
            type="button"
            onClick={testActiveOrdersGuard}
            disabled={isTestingGuard}
            className="btn btn-primary btn-block"
            style={{ marginBottom: '1rem' }}
          >
            {isTestingGuard ? 'جاري الاختبار...' : 'اختبار صلاحية استقبال الطلبات الآن'}
          </button>

          {guardTestResult && (
            <div className={`alert ${guardTestResult.status === 'success' ? 'alert-success' : 'alert-danger'}`} style={{ marginBottom: 0 }}>
              {guardTestResult.status === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{guardTestResult.message}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Building2 size={20} color="var(--primary-600)" />
              بيانات الصيدلية الجغرافية والخدمية
            </h3>
            <p className="card-subtitle">إعدادات التغطية والتوصيل</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--slate-500)' }}>العنوان الفعلي:</span>
              <strong style={{ color: 'var(--slate-800)' }}>{pharmacy?.address}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--slate-500)' }}>رقم الترخيص:</span>
              <strong style={{ color: 'var(--slate-800)' }}>{pharmacy?.license_number}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--slate-500)' }}>الإحداثيات الجغرافية (Lat / Lng):</span>
              <strong style={{ color: 'var(--slate-800)' }}>{pharmacy?.lat?.toFixed(4)}, {pharmacy?.lng?.toFixed(4)}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--slate-500)' }}>نطاق التغطية:</span>
              <strong style={{ color: 'var(--slate-800)' }}>{pharmacy?.service_radius_km} كم</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--slate-500)' }}>خدمة التوصيل:</span>
              <span className={`badge ${pharmacy?.delivery_available ? 'badge-verified' : 'badge-pending'}`}>
                {pharmacy?.delivery_available ? 'متوفرة' : 'غير متوفرة'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Submit or Update Quote */}
      {activeQuotingRequest && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                  {activeQuotingRequest.has_my_quote ? 'تحديث عرض السعر والتوفر' : 'تقديم عرض سعر وتوفر صيدلاني'}
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', margin: 0 }}>
                  الطلب وارد من المريض {activeQuotingRequest.patient_name} (على بعد {activeQuotingRequest.distance_km} كم)
                </p>
              </div>
              <button
                onClick={() => setActiveQuotingRequest(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Explanatory notice for Duplicate-Quote Upsert */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: '#166534', marginBottom: '1.25rem' }}>
              ✓ في حال قمت بتقديم عرض سابق لهذا الطلب، فسيتم <strong>تحديثه تلقائياً</strong> بأحدث الأسعار والبدائل التي تدخلها هنا دون إنشاء سجلات مكررة.
            </div>

            <form onSubmit={handleSubmitQuote}>
              <label className="form-label" style={{ fontWeight: 800, marginBottom: '0.75rem', display: 'block' }}>
                تسعيرة وحالة توفر كل صنف:
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                {quoteItems.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid var(--slate-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem',
                      background: item.is_available ? 'white' : 'var(--slate-50)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <strong style={{ fontSize: '1rem' }}>{item.drug_name}</strong>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          checked={item.is_available}
                          onChange={(e) => handleQuoteItemChange(idx, 'is_available', e.target.checked)}
                        />
                        <span>{item.is_available ? 'متوفر' : 'غير متوفر بالصيدلية'}</span>
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: item.is_available ? '1fr 2fr' : '1fr 2fr', gap: '0.75rem' }}>
                      {item.is_available ? (
                        <div>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>السعر بالجنيه (ج.م)</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            className="form-input"
                            value={item.price}
                            onChange={(e) => handleQuoteItemChange(idx, 'price', parseFloat(e.target.value) || 0)}
                            required
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>اسم البديل المتوفر (إن وجد)</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="مثال: بارامول 500mg بديل بنفس المادة"
                            value={item.substitute_name}
                            onChange={(e) => handleQuoteItemChange(idx, 'substitute_name', e.target.value)}
                          />
                        </div>
                      )}

                      <div>
                        <label className="form-label" style={{ fontSize: '0.8rem' }}>ملاحظات على هذا الصنف</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="مثال: العلبة تحتوي على 3 شرائط"
                          value={item.notes}
                          onChange={(e) => handleQuoteItemChange(idx, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery and Fee */}
              <div
                style={{
                  background: 'var(--slate-50)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.25rem',
                  border: '1px solid var(--slate-200)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: deliveryAvailable ? '0.75rem' : 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={deliveryAvailable}
                      onChange={(e) => setDeliveryAvailable(e.target.checked)}
                    />
                    <Truck size={18} color="var(--primary-600)" />
                    <span>توفير خدمة التوصيل لهذا الطلب</span>
                  </label>

                  {deliveryAvailable && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.85rem' }}>تكلفة التوصيل (ج.م):</label>
                      <input
                        type="number"
                        min="0"
                        style={{ width: '90px' }}
                        className="form-input"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Total Calculation Display */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'var(--primary-50)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.5rem',
                }}
              >
                <span style={{ fontWeight: 800, color: 'var(--primary-800)', fontSize: '1.05rem' }}>
                  إجمالي قيمة العرض للمريض:
                </span>
                <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary-700)' }}>
                  {calculateQuoteTotal()} ج.م
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setActiveQuotingRequest(null)}
                  className="btn btn-outline"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuote}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Send size={16} />
                  <span>{isSubmittingQuote ? 'جاري الإرسال...' : 'إرسال التسعيرة للمريض'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Prescription Image Lightbox Inspection */}
      {inspectingImageUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '1.5rem',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'white',
              position: 'relative',
              padding: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--slate-900)' }}>
                  {inspectingRequestTitle || 'معاينة الروشتة الطبية'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)', margin: 0 }}>
                  تم جلب الصورة عبر اتصال مشفر وآمن مقتصر على الصيدليات المرخصة في نطاق التغطية
                </p>
              </div>
              <button
                onClick={() => setInspectingImageUrl(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', textAlign: 'center', background: '#f8fafc', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
              <img
                src={inspectingImageUrl}
                alt="صورة الروشتة الطبية"
                style={{ maxWidth: '100%', maxHeight: '68vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--slate-200)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                💡 يمكنك قراءة أسماء الأدوية المكتوبة بخط الطبيب وإدخال أسعارها وبدائلها في نافذة التسعير.
              </span>
              <button
                onClick={() => setInspectingImageUrl(null)}
                className="btn btn-primary btn-sm"
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pharmacy Profile & Sensitive Change Request Settings */}
      {isProfileModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: '1rem',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'white',
              position: 'relative',
              padding: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--slate-900)' }}>
                  إدارة وتعديل بيانات ملف الصيدلية
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--slate-500)', margin: 0 }}>
                  تحديث البيانات التشغيلية الفورية وطلب تعديل البيانات الحساسة المعتمدة
                </p>
              </div>
              <button
                onClick={() => setIsProfileModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <X size={22} />
              </button>
            </div>

            {isLoadingProfile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', marginBottom: '1rem' }}>
                <RefreshCw size={14} className="spin" />
                <span>جاري مزامنة أحدث بيانات الصيدلية...</span>
              </div>
            )}

            {profileFeedbackMsg && (
              <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>
                <CheckCircle2 size={18} />
                <span>{profileFeedbackMsg}</span>
              </div>
            )}

            {profileFeedbackError && (
              <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
                <AlertTriangle size={18} />
                <span>{profileFeedbackError}</span>
              </div>
            )}

            {/* Existing Pending Change Requests Warning */}
            {profileData?.pending_change_requests && profileData.pending_change_requests.length > 0 && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                }}
              >
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  ⏳ لديك طلبات تعديل بيانات قيد مراجعة المشرف حالياً:
                </strong>
                <ul style={{ margin: 0, paddingRight: '1.25rem' }}>
                  {profileData.pending_change_requests.map((cr) => (
                    <li key={cr.id}>
                      <strong>{cr.field_name === 'phone' ? 'رقم الهاتف' : cr.field_name === 'address_and_coordinates' ? 'الموقع والعنوان' : 'الاسم التجاري'}</strong>: من ({cr.old_value}) إلى ({cr.new_value})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSaveProfile}>
              {/* Commercial Name */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>اسم الصيدلية التجاري</label>
                  <span style={{ fontSize: '0.72rem', color: '#6366f1', background: '#e0e7ff', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                    يتطلب موافقة المشرف
                  </span>
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="اسم الصيدلية"
                  required
                />
              </div>

              {/* Official Phone Number */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>رقم هاتف التواصل والواتساب الرسمي</label>
                  <span style={{ fontSize: '0.72rem', color: '#6366f1', background: '#e0e7ff', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                    يتطلب موافقة المشرف
                  </span>
                </div>
                <input
                  type="text"
                  className="form-input"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="مثال: 01012345678 أو +201012345678"
                  required
                />
              </div>

              {/* Address and GPS */}
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>عنوان مقر الصيدلية الفعلي</label>
                  <span style={{ fontSize: '0.72rem', color: '#6366f1', background: '#e0e7ff', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 700 }}>
                    يتطلب موافقة المشرف
                  </span>
                </div>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={profileAddress}
                  onChange={(e) => setProfileAddress(e.target.value)}
                  placeholder="العنوان التفصيلي، الحي، الشارع، علامة مميزة"
                  required
                />
              </div>

              {/* Coordinates */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ padding: '0.6rem 0.9rem', background: 'var(--slate-100)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem' }}>
                  <span>Lat: <strong>{profileLat ? profileLat.toFixed(4) : '...'}</strong></span> | <span>Lng: <strong>{profileLng ? profileLng.toFixed(4) : '...'}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={handleDetectProfileLocation}
                  className="btn btn-outline btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Navigation size={14} />
                  <span>تحديث GPS الآن</span>
                </button>
              </div>

              <hr style={{ border: 0, borderTop: '1px solid var(--slate-200)', margin: '1.25rem 0' }} />

              {/* Operational Fields (Immediate Update) */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--primary-700)' }}>
                ⚡ إعدادات تشغيلية فورية (تتحدث لحظياً دون انتظار):
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label className="form-label">نطاق التغطية الجغرافية (كم)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="form-input"
                    value={profileRadius}
                    onChange={(e) => setProfileRadius(parseFloat(e.target.value) || 5.0)}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>الحد الأقصى لاستقبال الطلبات</span>
                </div>

                <div>
                  <label className="form-label">خدمة التوصيل المنزلي العامة</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={profileDelivery}
                      onChange={(e) => setProfileDelivery(e.target.checked)}
                    />
                    <span>إتاحة التوصيل للطلبات</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  className="btn btn-outline"
                >
                  إغلاق
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="btn btn-primary"
                  style={{ fontWeight: 800 }}
                >
                  {isSavingProfile ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
