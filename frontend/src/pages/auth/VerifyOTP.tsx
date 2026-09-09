import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/auth';
import { ShieldCheck, AlertCircle, CheckCircle2, RotateCw, Terminal } from 'lucide-react';

export const VerifyOTP: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyOtp } = useAuth();

  const identifier = searchParams.get('identifier') || '';
  const initialMessage = (location.state as any)?.message;
  const isReReg = (location.state as any)?.isReRegistration;

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(initialMessage || null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleDigitChange = (index: number, val: string) => {
    // Only accept numeric digit
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleaned;
    setDigits(newDigits);

    // Auto-focus next input
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = digits.join('');
    if (fullCode.length !== 6) {
      setError('يرجى إدخال رمز التحقق المكون من 6 أرقام بالكامل.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await verifyOtp(identifier, fullCode);
      if (res.user.role === 'patient') {
        navigate('/patient', { replace: true });
      } else if (res.user.role === 'pharmacy') {
        navigate('/pharmacy', { replace: true });
      } else if (res.user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'رمز التحقق غير صحيح، يرجى إعادة المحاولة.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError(null);
    try {
      const res = await authApi.resendOtp(identifier);
      setSuccessMsg(res.message);
      setResendCooldown(45);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'تعذر إعادة إرسال الرمز حالياً، يرجى المحاولة لاحقاً.');
    }
  };

  return (
    <div style={{ maxWidth: '480px', margin: '2.5rem auto', width: '100%' }}>
      <div className="card" style={{ boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{
          width: '58px',
          height: '58px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-50)',
          color: 'var(--primary-600)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
        }}>
          <ShieldCheck size={32} />
        </div>

        <h2 className="card-title" style={{ fontSize: '1.6rem', marginBottom: '0.35rem' }}>
          تأكيد رمز التحقق (OTP)
        </h2>
        <p className="card-subtitle" style={{ fontSize: '0.95rem' }}>
          أدخل الرمز المكون من 6 أرقام المرسل إلى:
          <br />
          <strong style={{ color: 'var(--slate-900)', direction: 'ltr', display: 'inline-block', marginTop: '0.25rem' }}>
            {identifier}
          </strong>
        </p>

        {isReReg && (
          <div className="alert alert-info" style={{ marginTop: '1rem', textAlign: 'right' }}>
            <span>هذا الحساب مسجل مسبقاً وغير مفعل. تم إصدار رمز تحقق جديد لتفعيله ومتابعة الاستخدام.</span>
          </div>
        )}

        {successMsg && !error && (
          <div className="alert alert-success" style={{ marginTop: '1rem', textAlign: 'right' }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger" style={{ marginTop: '1rem', textAlign: 'right' }}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Dev Mode Banner */}
        <div style={{
          margin: '1.25rem 0',
          padding: '0.75rem 1rem',
          background: '#0f172a',
          color: '#38bdf8',
          borderRadius: 'var(--radius-md)',
          textAlign: 'right',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.5rem',
          fontFamily: 'monospace',
        }}>
          <Terminal size={18} style={{ flexShrink: 0, marginTop: '2px', color: '#38bdf8' }} />
          <div>
            <strong style={{ color: '#f8fafc', display: 'block', marginBottom: '2px' }}>وضع التطوير المحلي (Dev Mode):</strong>
            تجد رمز الـ OTP مطبوعاً مباشرة في شاشة الـ Backend Console داخل صندوق <code>[DEV OTP DISPATCH]</code>!
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="otp-inputs" onPaste={handlePaste}>
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="otp-box"
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                autoFocus={idx === 0}
              />
            ))}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={isLoading || digits.join('').length !== 6}
            style={{ padding: '0.85rem', fontSize: '1rem' }}
          >
            {isLoading ? 'جاري التحقق وتفعيل الحساب...' : 'تأكيد الحساب ومتابعة الدخول'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--slate-600)' }}>
          لم يصلك الرمز؟{' '}
          {resendCooldown > 0 ? (
            <span style={{ color: 'var(--slate-400)' }}>
              إعادة الإرسال بعد ({resendCooldown} ثانية)
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--primary-600)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <RotateCw size={14} />
              <span>إعادة إرسال الرمز الآن</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
