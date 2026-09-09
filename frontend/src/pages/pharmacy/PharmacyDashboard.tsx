import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { Building2, ShieldCheck, Clock, AlertCircle, CheckCircle2, RefreshCw, Key } from 'lucide-react';

export const PharmacyDashboard: React.FC = () => {
  const { user, pharmacy, refreshProfile } = useAuth();
  const [guardTestResult, setGuardTestResult] = useState<{ status: string; message: string } | null>(null);
  const [isTestingGuard, setIsTestingGuard] = useState(false);

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

  const isPending = pharmacy?.verification_status === 'pending';
  const isVerified = pharmacy?.verification_status === 'verified';
  const isRejected = pharmacy?.verification_status === 'rejected';

  return (
    <div>
      {/* Header Banner */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #1e293b, #0f172a)',
        color: 'white',
        padding: '2rem',
        marginBottom: '1.5rem',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.15)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
              لوحة تحكم الصيدلية
            </span>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem' }}>
              {pharmacy?.name || 'صيدليتي'}
            </h1>
            <p style={{ opacity: 0.85, fontSize: '0.95rem', marginTop: '0.25rem' }}>
              المسؤول: {user?.name} | رقم الترخيص: <code style={{ color: '#38bdf8' }}>{pharmacy?.license_number}</code>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => refreshProfile()}
              className="btn btn-outline btn-sm"
              style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              <RefreshCw size={14} />
              <span>تحديث الحالة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification Status Alert Boxes */}
      {isPending && (
        <div className="alert alert-warning" style={{ alignItems: 'center' }}>
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
        <div className="alert alert-success" style={{ alignItems: 'center' }}>
          <ShieldCheck size={24} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '0.2rem' }}>
              تم اعتماد وتوثيق الصيدلية بنجاح (Verified)
            </h4>
            <p style={{ fontSize: '0.9rem' }}>
              تم التحقق من صحة الترخيص من قبل إدارة المنصة. الصيدلية نشطة ومؤهلة لاستقبال طلبات المرضى في نطاق {pharmacy?.service_radius_km} كم.
            </p>
          </div>
          <span className="badge badge-verified" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
            معتمدة رسمياً
          </span>
        </div>
      )}

      {isRejected && (
        <div className="alert alert-danger" style={{ alignItems: 'center' }}>
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

      <div className="grid grid-cols-2">
        {/* Verification Guard Live Test Box */}
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

        {/* Pharmacy Profile Details */}
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
              <strong style={{ color: 'var(--slate-800)' }}>{pharmacy?.lat.toFixed(4)}, {pharmacy?.lng.toFixed(4)}</strong>
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
    </div>
  );
};
