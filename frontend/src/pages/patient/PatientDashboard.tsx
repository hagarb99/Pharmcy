import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { MapPin, Phone, Mail, Navigation, CheckCircle2, FileText, Pill } from 'lucide-react';

export const PatientDashboard: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const [locationLabel, setLocationLabel] = useState(user?.location || '');
  const [lat, setLat] = useState<number | undefined>(user?.lat || 30.0444);
  const [lng, setLng] = useState<number | undefined>(user?.lng || 31.2357);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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
    setIsUpdating(true);
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
      setIsUpdating(false);
    }
  };

  return (
    <div>
      {/* Welcome Banner */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #059669, #0d9488)',
        color: 'white',
        padding: '2rem',
        marginBottom: '2rem',
        borderRadius: 'var(--radius-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
              لوحة المريض الشخصية
            </span>
            <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginTop: '0.5rem' }}>
              مرحباً بك، {user?.name}
            </h1>
            <p style={{ opacity: 0.9, fontSize: '0.95rem', marginTop: '0.25rem' }}>
              حسابك مفعل ومؤهل لطلب الأدوية ومقارنة العروض في منطقتك الجغرافية
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.8rem', display: 'block', opacity: 0.8 }}>حالة الحساب</span>
              <span style={{ fontWeight: 800, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={16} /> موثق ومفعل
              </span>
            </div>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{statusMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-2">
        {/* Profile and Coordinates Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={20} color="var(--primary-600)" />
              بيانات الحساب والموقع الجغرافي
            </h3>
            <p className="card-subtitle">
              تُستخدم إحداثياتك لمطابقة الصيدليات القريبة منك في المرحلة القادمة
            </p>
          </div>

          <div style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--slate-700)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Mail size={16} color="var(--slate-400)" />
              <span>البريد الإلكتروني: <strong>{user?.email}</strong></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Phone size={16} color="var(--slate-400)" />
              <span>رقم الهاتف: <strong>{user?.phone}</strong></span>
            </div>
          </div>

          <form onSubmit={handleUpdateCoordinates}>
            <div className="form-group">
              <label className="form-label">المنطقة / الحي الحالية</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: مدينة نصر، القاهرة"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
              />
            </div>

            <div style={{
              background: 'var(--slate-50)',
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--slate-200)',
              marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--slate-800)' }}>
                  إحداثيات الـ GPS لمطابقة الصيدليات
                </span>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                >
                  <Navigation size={12} />
                  <span>تحديث GPS الآن</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--slate-700)' }}>
                <span>خط العرض (Lat): <strong>{lat?.toFixed(4) || '30.0444'}</strong></span>
                <span>خط الطول (Lng): <strong>{lng?.toFixed(4) || '31.2357'}</strong></span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isUpdating}
              className="btn btn-outline btn-block"
            >
              {isUpdating ? 'جاري الحفظ...' : 'حفظ بيانات الموقع'}
            </button>
          </form>
        </div>

        {/* Phase 2 Feature Preview */}
        <div className="card" style={{ borderStyle: 'dashed' }}>
          <div className="card-header">
            <div style={{ display: 'inline-block', backgroundColor: 'var(--primary-50)', color: 'var(--primary-700)', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              المرحلة الثانية (Phase 2)
            </div>
            <h3 className="card-title">إرسال طلب دواء جديد أو روشتة</h3>
            <p className="card-subtitle">
              سيتم تفعيل إرسال الوصفات الطبية والبحث عن الأدوية في المرحلة القادمة فور اعتماد المرحلة الأولى
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', opacity: 0.75 }}>
            <div style={{ padding: '1rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Pill size={28} color="var(--primary-600)" />
              <div>
                <strong style={{ fontSize: '0.95rem' }}>البحث الفوري عن دواء واحد</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>معرفة توفره وسعره لدى الصيدليات المحيطة بك خلال دقائق</p>
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'var(--slate-50)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={28} color="var(--primary-600)" />
              <div>
                <strong style={{ fontSize: '0.95rem' }}>رفع الروشتة وقراءتها بالـ OCR</strong>
                <p style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>استخراج الأصناف ومراجعتها وإرسالها لصيدليات المنطقة بنقرة واحدة</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
