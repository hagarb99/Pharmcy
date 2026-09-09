import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export const Login: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await login(identifier.trim(), password);
      // Redirect to target or role-based dashboard
      const from = (location.state as any)?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (data.user.role === 'patient') {
        navigate('/patient', { replace: true });
      } else if (data.user.role === 'pharmacy') {
        navigate('/pharmacy', { replace: true });
      } else if (data.user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      const responseData = err.response?.data;
      if (err.response?.status === 403 && responseData?.detail?.requires_otp) {
        // Account unverified -> redirect to OTP verification
        navigate(`/verify-otp?identifier=${encodeURIComponent(responseData.detail.identifier)}`, {
          state: { message: responseData.detail.message },
        });
        return;
      }

      if (typeof responseData?.detail === 'string') {
        setError(responseData.detail);
      } else if (err.response?.status === 429) {
        setError('تم تجاوز عدد المحاولات المسموح بها، يرجى الانتظار دقيقة قبل المحاولة.');
      } else {
        setError('بيانات الدخول غير صحيحة، يرجى التأكد من البريد/الهاتف وكلمة المرور.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoAdmin = () => {
    setIdentifier('admin@dawatech.com');
    setPassword('AdminPassword123!');
  };

  return (
    <div style={{ maxWidth: '440px', margin: '2rem auto', width: '100%' }}>
      <div className="card" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-header" style={{ textAlign: 'center', borderBottom: 'none' }}>
          <h2 className="card-title" style={{ fontSize: '1.6rem' }}>تسجيل الدخول</h2>
          <p className="card-subtitle">مرحباً بك مجدداً في منصة دواء تك</p>
        </div>

        {error && (
          <div className="alert alert-danger">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">البريد الإلكتروني أو رقم الهاتف</label>
            <input
              type="text"
              className="form-input"
              placeholder="مثال: 01012345678 أو name@example.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">كلمة المرور</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading}
            style={{ marginTop: '1rem', padding: '0.85rem' }}
          >
            {isLoading ? 'جاري التحقق...' : 'تسجيل الدخول'}
            {!isLoading && <ArrowLeft size={18} />}
          </button>
        </form>

        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--slate-100)',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: 'var(--slate-600)',
        }}>
          ليس لديك حساب؟{' '}
          <Link to="/register" style={{ color: 'var(--primary-600)', fontWeight: 700 }}>
            تسجيل مريض جديد
          </Link>
          {' أو '}
          <Link to="/register-pharmacy" style={{ color: 'var(--primary-600)', fontWeight: 700 }}>
            تسجيل صيدلية
          </Link>
        </div>

        {/* Quick Demo Access Bar */}
        <div style={{
          marginTop: '1.5rem',
          padding: '0.85rem',
          background: 'var(--slate-50)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--slate-300)',
          textAlign: 'center',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', display: 'block', marginBottom: '0.5rem' }}>
            بيانات تجريبية سريعة للمشرف:
          </span>
          <button
            type="button"
            onClick={fillDemoAdmin}
            className="btn btn-outline btn-sm"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}
          >
            ملء بيانات المشرف (admin@dawatech.com)
          </button>
        </div>
      </div>
    </div>
  );
};
