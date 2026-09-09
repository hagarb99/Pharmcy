import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Pill, LogOut, User as UserIcon, ShieldCheck, Clock, Building2 } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, pharmacy, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleBadge = () => {
    if (!user) return null;
    switch (user.role) {
      case 'patient':
        return <span className="badge badge-patient"><UserIcon size={12} /> مريض</span>;
      case 'pharmacy':
        if (pharmacy?.verification_status === 'verified') {
          return <span className="badge badge-verified"><ShieldCheck size={12} /> صيدلية معتمدة</span>;
        } else if (pharmacy?.verification_status === 'rejected') {
          return <span className="badge badge-rejected">تم رفض الترخيص</span>;
        }
        return <span className="badge badge-pending"><Clock size={12} /> بانتظار اعتماد الترخيص</span>;
      case 'admin':
        return <span className="badge badge-admin"><ShieldCheck size={12} /> مشرف النظام</span>;
      default:
        return null;
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand-logo">
          <div className="logo-badge">
            <Pill size={24} />
          </div>
          <div className="brand-text">
            <h1>دواء تك</h1>
            <span>Dawa Tech</span>
          </div>
        </Link>

        <nav className="nav-links">
          {isAuthenticated ? (
            <>
              {user?.role === 'patient' && (
                <Link to="/patient" className="nav-link">
                  لوحة المريض
                </Link>
              )}

              {user?.role === 'pharmacy' && (
                <Link to="/pharmacy" className="nav-link">
                  لوحة الصيدلية
                </Link>
              )}

              {user?.role === 'admin' && (
                <Link to="/admin" className="nav-link">
                  لوحة المشرف
                </Link>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginRight: '0.5rem' }}>
                {getRoleBadge()}
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--slate-800)' }}>
                  {user?.name}
                </span>
                <button onClick={handleLogout} className="btn btn-outline btn-sm" title="تسجيل الخروج">
                  <LogOut size={16} />
                  <span>خروج</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                تسجيل الدخول
              </Link>
              <Link to="/register" className="btn btn-primary btn-sm">
                حساب مريض جديد
              </Link>
              <Link to="/register-pharmacy" className="btn btn-outline btn-sm">
                <Building2 size={16} />
                <span>تسجيل صيدلية</span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
};
