import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { Building2, ShieldCheck, MapPin, AlertCircle, ArrowLeft, Navigation, Truck } from 'lucide-react';

export const RegisterPharmacy: React.FC = () => {
  const [representativeName, setRepresentativeName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [pharmacyName, setPharmacyName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [address, setAddress] = useState('');
  const [serviceRadiusKm, setServiceRadiusKm] = useState(5.0);
  const [deliveryAvailable, setDeliveryAvailable] = useState(false);
  const [lat, setLat] = useState(30.0444);
  const [lng, setLng] = useState(31.2357);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('خاصية تحديد الموقع غير مدعومة في متصفحك');
      return;
    }
    setGeoStatus('جاري تحديد موقع مقر الصيدلية...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoStatus(`تم تحديد مقر الصيدلية بنجاح (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`);
      },
      () => {
        setGeoStatus('تعذر تحديد الموقع تلقائياً، تم اعتماد الموقع الافتراضي');
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await authApi.registerPharmacy({
        representative_name: representativeName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        pharmacy_name: pharmacyName.trim(),
        address: address.trim(),
        license_number: licenseNumber.trim(),
        lat,
        lng,
        service_radius_km: Number(serviceRadiusKm),
        delivery_available: deliveryAvailable,
      });

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
        setError('تم تجاوز عدد محاولات التسجيل، يرجى المحاولة لاحقاً.');
      } else {
        setError('حدث خطأ أثناء تسجيل الصيدلية، يرجى التأكد من صحة رقم الترخيص والبيانات.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto', width: '100%' }}>
      <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--primary-50)',
            color: 'var(--primary-600)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.75rem',
          }}>
            <Building2 size={28} />
          </div>
          <h2 className="card-title" style={{ fontSize: '1.6rem' }}>تسجيل صيدلية جديدة</h2>
          <p className="card-subtitle">استقبل طلبات الأدوية من المرضى في نطاقك الجغرافي وزد مبيعاتك</p>
        </div>

        {/* Verification Status Notice */}
        <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
          <ShieldCheck size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>تنويه التحقق والاعتماد:</strong> تخضع حسابات الصيدليات المسجلة لمراجعة رسمية لرقم الترخيص من قبل إدارة المنصة قبل السماح باستقبال الطلبات.
          </div>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Section 1: Pharmacy Details */}
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--slate-800)', marginBottom: '0.85rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--slate-100)' }}>
            بيانات منشأة الصيدلية
          </h3>

          <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">الاسم التجاري للصيدلية</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: صيدلية النور الكبرى"
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">رقم الترخيص الرسمي (وزارة الصحة / النقابة)</label>
              <input
                type="text"
                className="form-input"
                placeholder="مثال: PH-EG-2026-09"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">العنوان الفعلي التفصيلي</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: شارع مصطفى النحاس، تقاطع مكرم عبيد، مدينة نصر"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </div>

          {/* Coordinate Precision */}
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
                موقع الصيدلية على الخريطة (GPS)
              </span>
              <button
                type="button"
                onClick={handleDetectLocation}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                <Navigation size={12} />
                <span>تحديد موقع الصيدلية حالياً</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem' }}>
              <span>Lat: <strong>{lat.toFixed(4)}</strong></span>
              <span>Lng: <strong>{lng.toFixed(4)}</strong></span>
            </div>
            {geoStatus && (
              <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--primary-700)', marginTop: '0.35rem' }}>
                {geoStatus}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2" style={{ gap: '1rem', alignItems: 'center' }}>
            <div className="form-group">
              <label className="form-label">نطاق التغطية والخدمة (كم)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="30"
                className="form-input"
                value={serviceRadiusKm}
                onChange={(e) => setServiceRadiusKm(parseFloat(e.target.value))}
                required
              />
              <span className="form-hint">الافتراضي: 5 كم حول الصيدلية</span>
            </div>

            <div className="form-group" style={{ paddingTop: '0.8rem' }}>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={deliveryAvailable}
                  onChange={(e) => setDeliveryAvailable(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <Truck size={18} color="var(--slate-700)" />
                <span>توفر خدمة التوصيل للمنازل</span>
              </label>
            </div>
          </div>

          {/* Section 2: Account Owner Credentials */}
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--slate-800)', margin: '1.5rem 0 0.85rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--slate-100)' }}>
            بيانات حساب المدير المسؤول / الصيدلي
          </h3>

          <div className="form-group">
            <label className="form-label">اسم الصيدلي / المفوض بالكامل</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: د. مروان الشريف"
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2" style={{ gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">البريد الإلكتروني للعمل</label>
              <input
                type="email"
                className="form-input"
                placeholder="contact@pharma.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">رقم الهاتف المصري للتواصل والإشعارات</label>
              <input
                type="tel"
                className="form-input"
                placeholder="01123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <span className="form-hint">يصل عليه رمز التحقق (OTP)</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">كلمة مرور الحساب</label>
            <input
              type="password"
              className="form-input"
              placeholder="6 أحرف على الأقل"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
            style={{ padding: '0.9rem', marginTop: '0.5rem' }}
          >
            {isLoading ? 'جاري إرسال طلب التسجيل...' : 'تسجيل الصيدلية والمتابعة للتفعيل'}
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
          صيدليتك مسجلة مسبقاً؟{' '}
          <Link to="/login" style={{ color: 'var(--primary-600)', fontWeight: 700 }}>
            تسجيل الدخول
          </Link>
        </div>
      </div>
    </div>
  );
};
