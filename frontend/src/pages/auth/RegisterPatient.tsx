import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { MapPin, AlertCircle, ArrowLeft, Navigation } from 'lucide-react';

export const RegisterPatient: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [lat, setLat] = useState<number | undefined>(30.0444);
  const [lng, setLng] = useState<number | undefined>(31.2357);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('خاصية تحديد الموقع غير مدعومة في متصفحك');
      return;
    }
    setGeoStatus('جاري تحديد الإحداثيات...');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setGeoStatus(`تم تحديد الإحداثيات بنجاح (${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)})`);
      },
      () => {
        setGeoStatus('تعذر الوصول للإحداثيات التلقائية، تم اعتماد موقع القاهرة الافتراضي');
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await authApi.registerPatient({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        lat,
        lng,
        location: locationLabel.trim() || undefined,
      });

      // Redirect to OTP verification
      navigate(`/verify-otp?identifier=${encodeURIComponent(res.identifier)}`, {
        state: {
          message: res.message,
          isReRegistration: res.is_re_registration,
        },
      });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (err.response?.status === 429) {
        setError('تم تجاوز عدد محاولات التسجيل المسموح بها حالياً، يرجى الانتظار قليلاً.');
      } else {
        setError('حدث خطأ أثناء التسجيل، يرجى مراجعة البيانات والمحاولة مجدداً.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '520px', margin: '2rem auto', width: '100%' }}>
      <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <h2 className="card-title" style={{ fontSize: '1.6rem' }}>تسجيل حساب مريض جديد</h2>
          <p className="card-subtitle">ابحث عن أدويتك في الصيدليات القريبة وتعرف على أسعارها وتوفرها فوراً</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">الاسم بالكامل</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: أحمد محمد علي"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">البريد الإلكتروني</label>
              <input
                type="email"
                className="form-input"
                placeholder="ahmed@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">رقم الهاتف المصري</label>
              <input
                type="tel"
                className="form-input"
                placeholder="01012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <span className="form-hint">يصل عليه رمز التحقق (OTP)</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">كلمة المرور</label>
            <input
              type="password"
              className="form-input"
              placeholder="6 أحرف على الأقل"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">المنطقة / الحي (اختياري)</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: المعادي، القاهرة أو الدقي، الجيزة"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
            />
          </div>

          {/* Coordinate Precision Box */}
          <div style={{
            background: 'var(--slate-50)',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--slate-200)',
            marginBottom: '1.25rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--slate-800)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={16} color="var(--primary-600)" />
                الإحداثيات الجغرافية (لمطابقة أقرب صيدلية)
              </span>
              <button
                type="button"
                onClick={handleDetectLocation}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                <Navigation size={12} />
                <span>تحديد موقعي الآن</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--slate-600)' }}>خط العرض (Lat): <strong>{lat?.toFixed(4) || '30.0444'}</strong></span>
              <span style={{ color: 'var(--slate-600)' }}>خط الطول (Lng): <strong>{lng?.toFixed(4) || '31.2357'}</strong></span>
            </div>
            {geoStatus && (
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--primary-700)', marginTop: '0.35rem' }}>
                {geoStatus}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
            style={{ padding: '0.85rem' }}
          >
            {isLoading ? 'جاري التسجيل...' : 'إنشاء الحساب والمتابعة لرمز التحقق'}
            {!isLoading && <ArrowLeft size={18} />}
          </button>
        </form>

        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--slate-100)',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: 'var(--slate-600)',
        }}>
          لديك حساب بالفعل؟{' '}
          <Link to="/login" style={{ color: 'var(--primary-600)', fontWeight: 700 }}>
            تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
};
