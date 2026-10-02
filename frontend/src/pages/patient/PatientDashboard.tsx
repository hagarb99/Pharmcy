import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { apiClient } from '../../api/client';
import { marketplaceApi, type Order, type PrescriptionRequest } from '../../api/marketplace';
import {
  MapPin,
  Navigation,
  CheckCircle2,
  Plus,
  Clock,
  Pill,
  ShoppingBag,
  AlertTriangle,
  ChevronLeft,
  X,
  RefreshCw,
  Send,
  UploadCloud,
  Image as ImageIcon,
  FileText,
  Trash2,
} from 'lucide-react';

interface DrugInputItem {
  drug_name: string;
  dosage: string;
  quantity: number;
  notes: string;
}

export const PatientDashboard: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const { subscribe, isConnected } = useWebSocket();

  // Location state
  const [locationLabel, setLocationLabel] = useState(user?.location || '');
  const [lat, setLat] = useState<number | undefined>(user?.lat || 30.0444);
  const [lng, setLng] = useState<number | undefined>(user?.lng || 31.2357);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isUpdatingLocation, setIsUpdatingLocation] = useState(false);

  // Marketplace state
  const [requests, setRequests] = useState<PrescriptionRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Modals state
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestMode, setRequestMode] = useState<'text' | 'image' | 'both'>('text');
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionPreviewUrl, setPrescriptionPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<DrugInputItem[]>([
    { drug_name: '', dosage: '', quantity: 1, notes: '' },
  ]);
  const [deliveryPref, setDeliveryPref] = useState<'any' | 'delivery_preferred' | 'pickup_only'>('any');
  const [requestNotes, setRequestNotes] = useState('');

  // Image lightbox preview state
  const [viewingImageRequestId, setViewingImageRequestId] = useState<string | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [isLoadingViewImage, setIsLoadingViewImage] = useState(false);

  // Quotes comparison modal state
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestDetail, setRequestDetail] = useState<any | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSelectingQuote, setIsSelectingQuote] = useState(false);
  const [chosenDeliveryOption, setChosenDeliveryOption] = useState<'pickup' | 'delivery'>('pickup');
  const [quoteSelectionError, setQuoteSelectionError] = useState<string | null>(null);

  // Live real-time toast alert
  const [liveToast, setLiveToast] = useState<{ title: string; message: string } | null>(null);

  const fetchDashboardData = async () => {
    setIsLoadingData(true);
    try {
      const [reqs, ords] = await Promise.all([
        marketplaceApi.getMyRequests(),
        marketplaceApi.getMyOrders(),
      ]);
      setRequests(reqs);
      setOrders(ords);
    } catch (err) {
      console.error('Error fetching patient data:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Subscribe to real-time WebSocket events
  useEffect(() => {
    const unsubQuote = subscribe('NEW_QUOTE_RECEIVED', (data) => {
      setLiveToast({
        title: 'عرض سعر جديد!',
        message: `وصلك عرض سعر جديد بقيمة ${data.total_price} ج.م من ${data.pharmacy_name}`,
      });
      fetchDashboardData();
      if (selectedRequestId === data.request_id) {
        openComparisonModal(data.request_id);
      }
    });

    const unsubQuoteUpdated = subscribe('QUOTE_UPDATED', (data) => {
      setLiveToast({
        title: 'تحديث عرض سعر',
        message: `تم تحديث عرض السعر من ${data.pharmacy_name} إلى ${data.total_price} ج.م`,
      });
      fetchDashboardData();
      if (selectedRequestId === data.request_id) {
        openComparisonModal(data.request_id);
      }
    });

    const unsubOrderStatus = subscribe('ORDER_STATUS_CHANGED', (data) => {
      setLiveToast({
        title: 'تحديث حالة الطلب',
        message: `تم تحديث حالة طلبك إلى: ${getOrderStatusLabel(data.new_status)}`,
      });
      fetchDashboardData();
    });

    return () => {
      unsubQuote();
      unsubQuoteUpdated();
      unsubOrderStatus();
    };
  }, [selectedRequestId]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
      setStatusMsg('تم تحديث الإحداثيات الجغرافية عبر المتصفح بنجاح.');
    });
  };

  const handleUpdateCoordinates = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingLocation(true);
    try {
      await apiClient.patch('/users/me', {
        location: locationLabel,
        lat,
        lng,
      });
      await refreshProfile();
      setStatusMsg('تم حفظ الموقع والإحداثيات الجديدة بنجاح.');
    } catch (err) {
      setStatusMsg('حدث خطأ أثناء حفظ الموقع.');
    } finally {
      setIsUpdatingLocation(false);
    }
  };

  const handleAddItemRow = () => {
    setItems([...items, { drug_name: '', dosage: '', quantity: 1, notes: '' }]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof DrugInputItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert('حجم الملف كبير جداً. الحد الأقصى هو 10 ميجابايت.');
        return;
      }
      setPrescriptionFile(file);
      if (prescriptionPreviewUrl) {
        URL.revokeObjectURL(prescriptionPreviewUrl);
      }
      setPrescriptionPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleClearFile = () => {
    setPrescriptionFile(null);
    if (prescriptionPreviewUrl) {
      URL.revokeObjectURL(prescriptionPreviewUrl);
      setPrescriptionPreviewUrl(null);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.drug_name.trim() !== '');

    if (requestMode === 'text' && validItems.length === 0) {
      alert('يرجى كتابة اسم دواء واحد على الأقل.');
      return;
    }

    if (requestMode === 'image' && !prescriptionFile) {
      alert('يرجى اختيار أو التقاط صورة الروشتة أولاً.');
      return;
    }

    if (requestMode === 'both' && validItems.length === 0 && !prescriptionFile) {
      alert('يرجى كتابة دواء أو رفع صورة الروشتة.');
      return;
    }

    setIsSubmittingRequest(true);
    try {
      let uploadedFilename: string | undefined = undefined;
      if (prescriptionFile) {
        const uploadRes = await marketplaceApi.uploadPrescriptionImage(prescriptionFile);
        uploadedFilename = uploadRes.filename;
      }

      await marketplaceApi.createRequest({
        items: validItems,
        lat,
        lng,
        location_label: locationLabel,
        delivery_preference: deliveryPref,
        notes: requestNotes,
        prescription_image_filename: uploadedFilename,
      });

      setIsNewRequestOpen(false);
      setItems([{ drug_name: '', dosage: '', quantity: 1, notes: '' }]);
      setRequestNotes('');
      handleClearFile();
      setRequestMode('text');
      await fetchDashboardData();
      setStatusMsg('تم إرسال طلبك بنجاح وبثه للصيدليات المعتمدة في نطاقك!');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'حدث خطأ أثناء إرسال الطلب.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleViewPrescription = async (reqId: string) => {
    setViewingImageRequestId(reqId);
    setIsLoadingViewImage(true);
    try {
      const url = await marketplaceApi.fetchPrescriptionImageBlob(reqId);
      setViewingImageUrl(url);
    } catch (err: any) {
      alert('تعذر تحميل صورة الروشتة.');
      setViewingImageRequestId(null);
    } finally {
      setIsLoadingViewImage(false);
    }
  };

  const closeImageViewer = () => {
    if (viewingImageUrl) {
      URL.revokeObjectURL(viewingImageUrl);
    }
    setViewingImageUrl(null);
    setViewingImageRequestId(null);
  };

  const openComparisonModal = async (requestId: string) => {
    setSelectedRequestId(requestId);
    setIsLoadingDetail(true);
    setQuoteSelectionError(null);
    try {
      const detail = await marketplaceApi.getRequestDetail(requestId);
      setRequestDetail(detail);
    } catch (err) {
      console.error('Failed to load request details:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleSelectQuote = async (quoteId: string) => {
    if (!selectedRequestId) return;
    setIsSelectingQuote(true);
    setQuoteSelectionError(null);
    try {
      await marketplaceApi.selectQuote(selectedRequestId, {
        quote_id: quoteId,
        delivery_option: chosenDeliveryOption,
        patient_notes: 'طلب مؤكد عبر منصة دواء تك',
      });
      setSelectedRequestId(null);
      setRequestDetail(null);
      await fetchDashboardData();
      setStatusMsg('تهانينا! تم قبول العرض بنجاح وتأكيد طلب الشراء مع الصيدلية.');
    } catch (err: any) {
      setQuoteSelectionError(err.response?.data?.detail || 'حدث خطأ أثناء قبول العرض.');
    } finally {
      setIsSelectingQuote(false);
    }
  };

  const getOrderStatusLabel = (st: string) => {
    switch (st) {
      case 'confirmed':
        return 'مؤكد وبانتظار التجهيز';
      case 'in_preparation':
        return 'قيد التجهيز في الصيدلية';
      case 'ready_for_pickup':
        return 'جاهز للاستلام من الصيدلية';
      case 'out_for_delivery':
        return 'جاري التوصيل للمنزل';
      case 'completed':
        return 'مكتمل ومستلم';
      case 'cancelled':
        return 'ملغي';
      default:
        return st;
    }
  };

  // Only show active/unfulfilled requests awaiting pharmacy quotes
  // Once an order is confirmed/selected, it moves exclusively to "الطلبات المؤكدة والتتبع"
  const orderedRequestIds = new Set(orders.map((o) => o.request_id));
  const activeRequests = requests.filter((req) => {
    const s = (req.status || '').toLowerCase();
    if (s === 'ordered' || s === 'completed' || s === 'cancelled') return false;
    if (orderedRequestIds.has(req.id)) return false;
    return s === 'pending' || s === 'active';
  });

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
          <Pill size={24} color="#059669" />
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
          background: 'linear-gradient(135deg, #059669, #0d9488)',
          color: 'white',
          padding: '2rem',
          marginBottom: '2rem',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
                لوحة المريض
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
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800 }}>مرحباً بك، {user?.name}</h1>
            <p style={{ opacity: 0.9, fontSize: '0.95rem', marginTop: '0.25rem' }}>
              ابحث عن أدويتك وقارن الأسعار الحية بين الصيدليات المعتمدة في نطاق منطقتك الجغرافية
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => setIsNewRequestOpen(true)}
              className="btn"
              style={{ background: 'white', color: 'var(--primary-700)', fontWeight: 800, padding: '0.65rem 1.25rem' }}
            >
              <Plus size={18} />
              <span>طلب دواء جديد</span>
            </button>

            <button
              onClick={fetchDashboardData}
              disabled={isLoadingData}
              className="btn btn-outline"
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', padding: '0.65rem 1rem' }}
            >
              <RefreshCw size={16} className={isLoadingData ? 'spin' : ''} />
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

      {/* Grid: Active Requests & Confirmed Orders */}
      <div className="grid grid-cols-2" style={{ marginBottom: '2rem' }}>
        {/* Left: Patient Requests Feed */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Pill size={20} color="var(--primary-600)" />
                طلبات الأدوية الحالية ({activeRequests.length})
              </h3>
              <p className="card-subtitle">الطلبات المرسلة للصيدليات المجاورة بانتظار العروض</p>
            </div>
          </div>

          {activeRequests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--slate-500)' }}>
              <Pill size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
              <p style={{ fontWeight: 700 }}>لا توجد لديك طلبات أدوية نشطة بانتظار عروض حالياً</p>
              <p style={{ fontSize: '0.85rem' }}>اضغط على زر "طلب دواء جديد" لإرسال روشتة أو البحث عن أدوية</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activeRequests.map((req) => (
                <div
                  key={req.id}
                  style={{
                    padding: '1.25rem',
                    border: '1px solid var(--slate-200)',
                    borderRadius: 'var(--radius-md)',
                    background: req.status === 'ordered' ? 'var(--slate-50)' : 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <span
                        className={`badge ${
                          req.status === 'ordered'
                            ? 'badge-verified'
                            : req.status === 'pending'
                            ? 'badge-pending'
                            : 'badge-active'
                        }`}
                        style={{ fontSize: '0.75rem', marginBottom: '0.35rem', display: 'inline-block' }}
                      >
                        {req.status === 'ordered'
                          ? 'تم اختيار صيدلية'
                          : req.status === 'pending'
                          ? 'بانتظار رد الصيدليات'
                          : 'نشط لاستقبال العروض'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '0.25rem 0' }}>
                        <h4 style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>
                          {req.items.length > 0 && req.items[0].drug_name !== 'صورة روشتة مرفقة'
                            ? req.items.map((it) => it.drug_name).join(' + ')
                            : 'طلب عبر صورة روشتة'}
                        </h4>
                        {req.prescription_image_filename && (
                          <button
                            type="button"
                            onClick={() => handleViewPrescription(req.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '9999px',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            title="عرض صورة الروشتة المرفوعة"
                          >
                            <ImageIcon size={13} />
                            <span>عرض الروشتة 📸</span>
                          </button>
                        )}
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                        الموقع: {req.location_label || 'موقعي'} | {new Date(req.created_at).toLocaleTimeString('ar-EG')}
                      </p>
                    </div>

                    <div style={{ textAlign: 'left' }}>
                      <span
                        style={{
                          background: req.quotes_count > 0 ? 'var(--primary-100)' : 'var(--slate-100)',
                          color: req.quotes_count > 0 ? 'var(--primary-800)' : 'var(--slate-600)',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          display: 'inline-block',
                        }}
                      >
                        {req.quotes_count} {req.quotes_count === 1 ? 'عرض سعر' : 'عروض أسعار'}
                      </span>
                    </div>
                  </div>

                  {/* 15-Minute Timeout Warning Banner */}
                  {req.has_timed_out && req.quotes_count === 0 && (
                    <div
                      style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        color: '#92400e',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.82rem',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                      <div>
                        <strong>لم يتم استلام أي عروض أسعار حتى الآن</strong>
                        <p style={{ margin: 0, fontSize: '0.75rem' }}>
                          انتهت مهلة الـ 15 دقيقة المحددة. يمكنك الاستمرار في الانتظار أو إعادة إرسال الطلب.
                        </p>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--slate-100)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                      تفضيل التوصيل:{' '}
                      <strong>
                        {req.delivery_preference === 'delivery_preferred'
                          ? 'يفضل توصيل'
                          : req.delivery_preference === 'pickup_only'
                          ? 'استلام فقط'
                          : 'أي طريقة'}
                      </strong>
                    </span>

                    <button
                      onClick={() => openComparisonModal(req.id)}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.85rem' }}
                    >
                      <span>مقارنة العروض ({req.quotes_count})</span>
                      <ChevronLeft size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Confirmed Orders & Status Tracking */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShoppingBag size={20} color="var(--primary-600)" />
              الطلبات المؤكدة والتتبع ({orders.length})
            </h3>
            <p className="card-subtitle">متابعة مراحل تحضير وتوصيل طلبياتك مع الصيدلية خطوة بخطوة</p>
          </div>

          {orders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--slate-500)' }}>
              <ShoppingBag size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
              <p style={{ fontWeight: 700 }}>لا توجد لديك أوامر شراء مؤكدة حالياً</p>
              <p style={{ fontSize: '0.85rem' }}>عند قبول أي عرض سعر من صيدلية، سيظهر تتبع الطلب هنا مباشرة</p>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--slate-900)' }}>{ord.pharmacy_name}</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                        العنوان: {ord.pharmacy_address} | هاتف: {ord.pharmacy_phone || 'غير محدد'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <strong style={{ fontSize: '1.15rem', color: 'var(--primary-700)' }}>
                        {ord.total_amount} ج.م
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                        {ord.delivery_option === 'delivery' ? `شامل توصيل (${ord.delivery_fee} ج)` : 'استلام من الصيدلية'}
                      </span>
                    </div>
                  </div>

                  {/* Stepper Lifecycle UI */}
                  <div className="order-stepper-grid">
                    <div style={{ color: 'var(--primary-700)', fontWeight: 700 }}>
                      ✓ تم التأكيد
                    </div>
                    <div
                      style={{
                        color: ['in_preparation', 'ready_for_pickup', 'out_for_delivery', 'completed'].includes(ord.status)
                          ? 'var(--primary-700)'
                          : 'var(--slate-400)',
                        fontWeight: ord.status === 'in_preparation' ? 800 : 500,
                      }}
                    >
                      {ord.status === 'in_preparation' ? '● ' : ''}قيد التجهيز
                    </div>
                    <div
                      style={{
                        color: ['ready_for_pickup', 'out_for_delivery', 'completed'].includes(ord.status)
                          ? 'var(--primary-700)'
                          : 'var(--slate-400)',
                        fontWeight: ['ready_for_pickup', 'out_for_delivery'].includes(ord.status) ? 800 : 500,
                      }}
                    >
                      {['ready_for_pickup', 'out_for_delivery'].includes(ord.status) ? '● ' : ''}
                      {ord.delivery_option === 'delivery' ? 'جاري التوصيل' : 'جاهز للاستلام'}
                    </div>
                    <div
                      style={{
                        color: ord.status === 'completed' ? '#16a34a' : 'var(--slate-400)',
                        fontWeight: ord.status === 'completed' ? 800 : 500,
                      }}
                    >
                      {ord.status === 'completed' ? '✓ ' : ''}مكتمل
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Location Management Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={20} color="var(--primary-600)" />
            إحداثيات وموقع التوصيل للمريض
          </h3>
          <p className="card-subtitle">يتم استخدام هذه الإحداثيات لمطابقة الصيدليات الواقعة في نطاق الـ 5 كم المحيط بك</p>
        </div>

        <form onSubmit={handleUpdateCoordinates} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }} className="form-group">
            <label className="form-label">المنطقة / العنوان المكتوب</label>
            <input
              type="text"
              className="form-input"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="مثال: التجمع الخامس، القاهرة الجديدة"
            />
          </div>

          <div style={{ padding: '0.65rem 1rem', background: 'var(--slate-100)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
            <span>Lat: <strong>{lat?.toFixed(4)}</strong></span> | <span>Lng: <strong>{lng?.toFixed(4)}</strong></span>
          </div>

          <button type="button" onClick={handleDetectLocation} className="btn btn-outline" style={{ padding: '0.65rem 1rem' }}>
            <Navigation size={16} />
            <span>تحديث GPS الآن</span>
          </button>

          <button type="submit" disabled={isUpdatingLocation} className="btn btn-primary" style={{ padding: '0.65rem 1.25rem' }}>
            {isUpdatingLocation ? 'جاري الحفظ...' : 'حفظ الموقع'}
          </button>
        </form>
      </div>

      {/* Modal: Create New Medicine Request */}
      {isNewRequestOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
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
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'white',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>طلب دواء جديد من الصيدليات</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', margin: 0 }}>
                  أدخل أسماء الأدوية أو ارفع صورة الروشتة وسيقوم النظام بتوجيهها للصيدليات المعتمدة في نطاق 5 كم
                </p>
              </div>
              <button
                onClick={() => setIsNewRequestOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'var(--slate-100)', padding: '0.35rem', borderRadius: 'var(--radius-md)' }}>
              <button
                type="button"
                onClick={() => setRequestMode('text')}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: requestMode === 'text' ? 800 : 600,
                  background: requestMode === 'text' ? 'white' : 'transparent',
                  color: requestMode === 'text' ? 'var(--primary-700)' : 'var(--slate-600)',
                  boxShadow: requestMode === 'text' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <Pill size={16} />
                <span>كتابة أسماء الأدوية</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestMode('image')}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: requestMode === 'image' ? 800 : 600,
                  background: requestMode === 'image' ? 'white' : 'transparent',
                  color: requestMode === 'image' ? 'var(--primary-700)' : 'var(--slate-600)',
                  boxShadow: requestMode === 'image' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <ImageIcon size={16} />
                <span>رفع صورة الروشتة 📸</span>
              </button>

              <button
                type="button"
                onClick={() => setRequestMode('both')}
                style={{
                  flex: 1,
                  padding: '0.55rem 0.75rem',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: requestMode === 'both' ? 800 : 600,
                  background: requestMode === 'both' ? 'white' : 'transparent',
                  color: requestMode === 'both' ? 'var(--primary-700)' : 'var(--slate-600)',
                  boxShadow: requestMode === 'both' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  fontSize: '0.88rem',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>كلاهما معاً (أدوية + صورة)</span>
              </button>
            </div>

            <form onSubmit={handleCreateRequest}>
              {/* Image Upload Dropzone Section */}
              {(requestMode === 'image' || requestMode === 'both') && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <label className="form-label" style={{ fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ImageIcon size={16} color="var(--primary-600)" />
                    <span>صورة الروشتة الطبية:</span>
                  </label>

                  {prescriptionFile ? (
                    <div
                      style={{
                        padding: '1rem',
                        border: '2px solid var(--primary-300)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--primary-50)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {prescriptionPreviewUrl && prescriptionFile.type.startsWith('image/') ? (
                          <img
                            src={prescriptionPreviewUrl}
                            alt="Preview"
                            style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--slate-300)' }}
                          />
                        ) : (
                          <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-sm)', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--slate-200)' }}>
                            <FileText size={28} color="var(--primary-600)" />
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--slate-800)' }}>
                            {prescriptionFile.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                            الحجم: {(prescriptionFile.size / (1024 * 1024)).toFixed(2)} ميجابايت
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="btn btn-outline btn-sm"
                        style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                        title="إزالة الصورة"
                      >
                        <Trash2 size={15} />
                        <span>إزالة</span>
                      </button>
                    </div>
                  ) : (
                    <label
                      style={{
                        border: '2px dashed var(--primary-300)',
                        borderRadius: 'var(--radius-md)',
                        padding: '2rem 1.5rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--slate-50)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.6rem',
                        transition: 'background 0.2s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--slate-50)')}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                      />
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--primary-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-700)' }}>
                        <UploadCloud size={24} />
                      </div>
                      <div>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-800)', display: 'block' }}>
                          اضغط لاختيار أو تصوير الروشتة من كاميرا الهاتف
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', display: 'block', marginTop: '0.2rem' }}>
                          يدعم صور JPG, PNG, WEBP ومستندات PDF حتى 10 ميجابايت
                        </span>
                      </div>
                    </label>
                  )}

                  <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: '#1e40af', lineHeight: 1.5 }}>
                    💡 <strong>ملاحظة:</strong> يقوم الصيدلي بفحص الصورة لتسعير الأدوية والتأكد من توافرها بدقة. (خاصية استخراج الأسماء الذكي OCR قيد التطوير وستتاح في المرحلة القادمة).
                  </div>
                </div>
              )}

              {/* Text Drug Items Section */}
              {(requestMode === 'text' || requestMode === 'both') && (
                <>
                  <label className="form-label" style={{ fontWeight: 800, marginBottom: '0.5rem', display: 'block' }}>
                    قائمة الأصناف المطلوبة:
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                    {items.map((item, idx) => (
                      <div key={idx} className="drug-input-row">
                        <div className="drug-input-row-name">
                          <input
                            type="text"
                            className="form-input"
                            placeholder="اسم الدواء (مثال: Panadol Extra)"
                            value={item.drug_name}
                            onChange={(e) => handleItemChange(idx, 'drug_name', e.target.value)}
                            required={requestMode === 'text'}
                          />
                        </div>
                        <div className="drug-input-row-dose">
                          <input
                            type="text"
                            className="form-input"
                            placeholder="التركيز (مثال: 500mg)"
                            value={item.dosage}
                            onChange={(e) => handleItemChange(idx, 'dosage', e.target.value)}
                          />
                        </div>
                        <div className="drug-input-row-qty">
                          <input
                            type="number"
                            min="1"
                            max="50"
                            className="form-input"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                            title="الكمية"
                          />
                        </div>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="btn btn-outline btn-sm"
                    style={{ marginBottom: '1.25rem' }}
                  >
                    <Plus size={14} />
                    <span>إضافة دواء آخر للطلب</span>
                  </button>
                </>
              )}

              <div className="form-group">
                <label className="form-label">تفضيل الاستلام والتوصيل</label>
                <select
                  className="form-input"
                  value={deliveryPref}
                  onChange={(e: any) => setDeliveryPref(e.target.value)}
                >
                  <option value="any">أي طريقة (توصيل أو استلام من الصيدلية)</option>
                  <option value="delivery_preferred">أفضل التوصيل للمنزل</option>
                  <option value="pickup_only">استلام من الصيدلية بنفسي فقط</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">ملاحظات إضافية للصيدليات (اختياري)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="مثال: يرجى إفادتي إن كان متوفراً شريط واحد فقط أو بديل مماثل"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsNewRequestOpen(false)}
                  className="btn btn-outline"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Send size={16} />
                  <span>{isSubmittingRequest ? 'جاري رفع البيانات وبث الطلب...' : 'إرسال وبث الطلب الآن'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quotes Comparison & Selection */}
      {selectedRequestId && (
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
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--slate-200)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                  مقارنة عروض أسعار الصيدليات
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', margin: 0 }}>
                  قارن بين أسعار وتوفر الصيدليات المعتمدة القريبة منك واختر الأنسب لك
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedRequestId(null);
                  setRequestDetail(null);
                }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}
              >
                <X size={22} />
              </button>
            </div>

            {quoteSelectionError && (
              <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} />
                <span>{quoteSelectionError}</span>
              </div>
            )}

            {isLoadingDetail ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--slate-500)' }}>
                <RefreshCw size={28} className="spin" style={{ margin: '0 auto 1rem' }} />
                <p>جاري تحميل العروض الحية...</p>
              </div>
            ) : !requestDetail || requestDetail.quotes?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--slate-500)' }}>
                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                <h4 style={{ fontWeight: 800 }}>لم ترد أي عروض أسعار حتى الآن</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  تم إرسال الطلب للصيدليات المحيطة بك، ستظهر العروض هنا لحظياً بمجرد رد الصيدلي
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {requestDetail.quotes.map((quote: any) => {
                  const statusStr = String(quote.status || '').toLowerCase();
                  const isAccepted = statusStr.includes('accepted');
                  const isRejected = statusStr.includes('rejected') || statusStr.includes('expired');

                  return (
                    <div
                      key={quote.id}
                      style={{
                        padding: '1.25rem',
                        border: isAccepted ? '2px solid #16a34a' : '1px solid var(--slate-200)',
                        borderRadius: 'var(--radius-md)',
                        background: isAccepted ? '#f0fdf4' : isRejected ? '#f8fafc' : 'white',
                        opacity: isRejected ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <h4 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>
                              {quote.pharmacy_name}
                            </h4>
                            {quote.distance_km !== undefined && (
                              <span style={{ fontSize: '0.75rem', background: 'var(--primary-50)', color: 'var(--primary-700)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 700 }}>
                                على بعد {quote.distance_km} كم
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', margin: '0.25rem 0 0' }}>
                            {quote.pharmacy_address} | هاتف: {quote.pharmacy_phone || 'غير متاح'}
                          </p>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-700)', display: 'block' }}>
                            {quote.total_price} ج.م
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                            {quote.delivery_available ? `توصيل: ${quote.delivery_fee} ج` : 'استلام من الصيدلية فقط'}
                          </span>
                        </div>
                      </div>

                      {/* Items Availability Breakdown Table */}
                      <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginBottom: '1rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--slate-100)', color: 'var(--slate-700)', textAlign: 'right' }}>
                            <th style={{ padding: '0.5rem' }}>الدواء المطلوب</th>
                            <th style={{ padding: '0.5rem' }}>حالة التوفر</th>
                            <th style={{ padding: '0.5rem' }}>السعر</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.items.map((it: any) => (
                            <tr key={it.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 700 }}>{it.drug_name || 'صنف دوائي'}</td>
                              <td style={{ padding: '0.5rem' }}>
                                {it.is_available ? (
                                  <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ متوفر</span>
                                ) : it.substitute_name ? (
                                  <span style={{ color: '#d97706', fontWeight: 700 }}>
                                    بديل متاح: {it.substitute_name}
                                  </span>
                                ) : (
                                  <span style={{ color: '#dc2626' }}>غير متوفر</span>
                                )}
                              </td>
                              <td style={{ padding: '0.5rem', fontWeight: 700 }}>{it.price} ج.م</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {quote.notes && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--slate-600)', background: 'var(--slate-50)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                          <strong>ملاحظات الصيدلي:</strong> {quote.notes}
                        </p>
                      )}

                      {/* Actions */}
                      {isAccepted ? (
                        <div style={{ color: '#16a34a', fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CheckCircle2 size={18} />
                          <span>تم قبول هذا العرض بالفعل وتأكيد أمر الشراء</span>
                        </div>
                      ) : isRejected ? (
                        <div style={{ color: 'var(--slate-500)', fontSize: '0.85rem' }}>
                          تم إغلاق هذا العرض ({quote.rejection_reason || 'غير متاح'})
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700 }}>طريقة الاستلام:</label>
                            <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`delivery_${quote.id}`}
                                value="pickup"
                                checked={chosenDeliveryOption === 'pickup'}
                                onChange={() => setChosenDeliveryOption('pickup')}
                              />
                              استلام من الصيدلية
                            </label>
                            {quote.delivery_available && (
                              <label style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                                <input
                                  type="radio"
                                  name={`delivery_${quote.id}`}
                                  value="delivery"
                                  checked={chosenDeliveryOption === 'delivery'}
                                  onChange={() => setChosenDeliveryOption('delivery')}
                                />
                                توصيل للمنزل (+{quote.delivery_fee} ج)
                              </label>
                            )}
                          </div>

                          <button
                            type="button"
                            disabled={isSelectingQuote}
                            onClick={() => handleSelectQuote(quote.id)}
                            className="btn btn-primary"
                            style={{ fontWeight: 800 }}
                          >
                            {isSelectingQuote ? 'جاري التأكيد...' : 'قبول هذا العرض وتأكيد الطلب'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: View Prescription Image Lightbox */}
      {viewingImageRequestId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '1rem',
          }}
          onClick={closeImageViewer}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: 'white',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--slate-100)', paddingBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                <ImageIcon size={18} color="var(--primary-600)" />
                <span>صورة الروشتة الطبية المرفوعة</span>
              </div>
              <button
                onClick={closeImageViewer}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}
              >
                <X size={22} />
              </button>
            </div>

            {isLoadingViewImage ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <RefreshCw size={32} className="spin" style={{ margin: '0 auto 1rem' }} />
                <p>جاري تحميل الصورة بأمان...</p>
              </div>
            ) : viewingImageUrl ? (
              <div style={{ maxHeight: '75vh', overflow: 'auto', textAlign: 'center' }}>
                <img
                  src={viewingImageUrl}
                  alt="Prescription"
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                />
              </div>
            ) : (
              <p>تعذر عرض الصورة.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
