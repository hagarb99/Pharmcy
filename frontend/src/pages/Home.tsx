import React from 'react';
import { Link } from 'react-router-dom';
import { Pill, ShieldCheck, MapPin, ArrowLeft, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Home: React.FC = () => {
  const { isAuthenticated, user } = useAuth();

  return (
    <div>
      {/* Hero Section */}
      <section style={{
        textAlign: 'center',
        padding: '3.5rem 1rem 4.5rem',
        maxWidth: '900px',
        margin: '0 auto',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'var(--primary-50)',
          color: 'var(--primary-700)',
          padding: '0.4rem 1rem',
          borderRadius: '9999px',
          fontWeight: 700,
          fontSize: '0.875rem',
          marginBottom: '1.5rem',
          border: '1px solid var(--primary-200)',
        }}>
          <Sparkles size={16} /> منصة الربط الذكي بالصيدليات في مصر
        </div>

        <h1 style={{
          fontSize: '2.75rem',
          fontWeight: 800,
          color: 'var(--slate-900)',
          lineHeight: 1.3,
          marginBottom: '1.25rem',
          letterSpacing: '-0.02em',
        }}>
          دوائك متوفر في أقرب صيدلية لك، <br />
          <span style={{ color: 'var(--primary-600)' }}>بالسعر المباشر والتوفر الفعلي</span>
        </h1>

        <p style={{
          fontSize: '1.15rem',
          color: 'var(--slate-600)',
          lineHeight: 1.8,
          marginBottom: '2.5rem',
          maxWidth: '720px',
          margin: '0 auto 2.5rem',
        }}>
          بدون تضييع وقت في التنقل بين الصيدليات؛ أرسل وصفتك أو اسم الدواء لتبحث عنه الصيدليات المعتمدة في نطاقك الجغرافي وترد عليك بالتوفر والسعر لحظة بلحظة.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {isAuthenticated ? (
            <Link
              to={user?.role === 'patient' ? '/patient' : user?.role === 'pharmacy' ? '/pharmacy' : '/admin'}
              className="btn btn-primary"
              style={{ fontSize: '1.05rem', padding: '0.85rem 2rem' }}
            >
              <span>الانتقال إلى لوحة التحكم</span>
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <>
              <Link to="/register" className="btn btn-primary" style={{ fontSize: '1.05rem', padding: '0.85rem 2rem' }}>
                <Pill size={20} />
                <span>سجل كـ مريض الآن</span>
                <ArrowLeft size={18} />
              </Link>
              <Link to="/register-pharmacy" className="btn btn-outline" style={{ fontSize: '1.05rem', padding: '0.85rem 1.75rem' }}>
                <ShieldCheck size={20} />
                <span>انضم كصيدلية معتمدة</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section style={{ margin: '2rem 0 4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            لماذا تختار دواء تك؟
          </h2>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.95rem', marginTop: '0.5rem' }}>
            مصممة خصيصاً لتناسب احتياجات المريض والصيدلي المصري
          </p>
        </div>

        <div className="grid grid-cols-3">
          <div className="card card-hover">
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--primary-50)',
              color: 'var(--primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <MapPin size={26} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>مطابقة جغرافية دقيقة</h3>
            <p style={{ color: 'var(--slate-600)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              يتم توجيه طلب الدواء بناءً على إحداثياتك للصيدليات داخل نطاق 5 كم لضمان وصول الردود والطلبات بسرعة فائقة.
            </p>
          </div>

          <div className="card card-hover">
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#eff6ff',
              color: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <Clock size={26} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>الردود الحية والأسعار الفعلية</h3>
            <p style={{ color: 'var(--slate-600)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              لا نعتمد على قوائم قديمة؛ الصيدلي يرد فوراً على كل صنف بمتوفر/غير متوفر مع إعلان السعر الحقيقي ومدة التوصيل.
            </p>
          </div>

          <div className="card card-hover">
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#faf5ff',
              color: '#7e22ce',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <ShieldCheck size={26} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>صيدليات مرخصة وموثقة</h3>
            <p style={{ color: 'var(--slate-600)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              كل صيدلية تسجل برقم ترخيص مهني رسمي يتم مراجعته واعتماده بدقة من قبل إدارة النظام لضمان أعلى معايير الأمان.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{
        background: 'white',
        border: '1px solid var(--slate-200)',
        borderRadius: 'var(--radius-xl)',
        padding: '3rem 2rem',
        margin: '2rem 0',
      }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 800, marginBottom: '2.5rem' }}>
          كيف تعمل المنصة؟
        </h2>

        <div className="grid grid-cols-3">
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-600)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              margin: '0 auto 1rem',
            }}>1</div>
            <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.35rem' }}>اطلب دوائك</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)' }}>
              أدخل اسم الدواء أو ارفع صورة الروشتة مع تحديد موقعك الجغرافي.
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-600)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              margin: '0 auto 1rem',
            }}>2</div>
            <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.35rem' }}>قارن الردود</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)' }}>
              استقبل عروض وتوفر الأدوية من الصيدليات المجاورة وقارن الأسعار.
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary-600)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: 800,
              margin: '0 auto 1rem',
            }}>3</div>
            <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.35rem' }}>استلم دوائك</h4>
            <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)' }}>
              اختر الصيدلية المناسبة واستلم من الفرع أو اطلب توصيل مباشر لمنزلك.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
