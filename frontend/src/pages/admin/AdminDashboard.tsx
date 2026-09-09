import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import type { AdminStats, AuditLogItem } from '../../api/admin';
import type { Pharmacy, PharmacyVerificationStatus } from '../../api/auth';
import { ShieldCheck, Users, Building2, Clock, CheckCircle2, RefreshCw, ScrollText } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<PharmacyVerificationStatus | undefined>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Rejection modal state
  const [rejectingPharmacyId, setRejectingPharmacyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, pharmData, logsData] = await Promise.all([
        adminApi.getStats(),
        adminApi.listPharmacies(statusFilter),
        adminApi.listAuditLogs(30),
      ]);
      setStats(statsData);
      setPharmacies(pharmData);
      setAuditLogs(logsData);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const handleApprove = async (pharmacyId: string, name: string) => {
    try {
      await adminApi.updatePharmacyVerification(pharmacyId, 'approve');
      setActionSuccess(`تم اعتماد ترخيص صيدلية "${name}" بنجاح.`);
      loadData();
    } catch (err) {
      alert('حدث خطأ أثناء اعتماد الصيدلية.');
    }
  };

  const handleOpenRejectModal = (pharmacyId: string) => {
    setRejectingPharmacyId(pharmacyId);
    setRejectReason('رقم الترخيص غير مسجل في قاعدة بيانات نقابة الصيادلة أو بيانات العنوان غير دقيقة');
  };

  const handleConfirmReject = async () => {
    if (!rejectingPharmacyId) return;
    try {
      await adminApi.updatePharmacyVerification(rejectingPharmacyId, 'reject', rejectReason);
      setActionSuccess('تم رفض اعتماد الصيدلية وحفظ سبب الرفض في السجل.');
      setRejectingPharmacyId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      alert('حدث خطأ أثناء رفض الصيدلية.');
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <span style={{ color: 'var(--primary-600)', fontWeight: 700, fontSize: '0.875rem' }}>الإشراف المركزي والأمان</span>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            لوحة تحكم المشرف — إدارة التراخيص والتدقيق
          </h1>
        </div>
        <button onClick={loadData} disabled={isLoading} className="btn btn-outline btn-sm">
          <RefreshCw size={16} />
          <span>{isLoading ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-3" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #3b82f6' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)', fontWeight: 600 }}>إجمالي المستخدمين</span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800 }}>{stats?.total_users ?? '...'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>مرضى: {stats?.total_patients ?? 0}</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #f59e0b' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--warning-50)', color: 'var(--warning-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)', fontWeight: 600 }}>صيدليات بانتظار الاعتماد</span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--warning-700)' }}>{stats?.pending_pharmacies ?? '...'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning-600)' }}>تتطلب فحص الترخيص</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #10b981' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={24} />
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--slate-500)', fontWeight: 600 }}>صيدليات معتمدة ونشطة</span>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary-700)' }}>{stats?.verified_pharmacies ?? '...'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>إجمالي الصيدليات: {stats?.total_pharmacies ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Pharmacy Verification Queue */}
      <div className="card" style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={22} color="var(--primary-600)" />
              طابور التحقق من تراخيص الصيدليات (Verification Queue)
            </h3>
            <p className="card-subtitle">فحص رقم الترخيص المهني واعتماد أو تعليق وصول الصيدلية</p>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setStatusFilter(undefined)}
              className={`btn btn-sm ${!statusFilter ? 'btn-primary' : 'btn-outline'}`}
            >
              الكل
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`btn btn-sm ${statusFilter === 'pending' ? 'btn-primary' : 'btn-outline'}`}
            >
              قيد المراجعة ({stats?.pending_pharmacies ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('verified')}
              className={`btn btn-sm ${statusFilter === 'verified' ? 'btn-primary' : 'btn-outline'}`}
            >
              المعتمدة ({stats?.verified_pharmacies ?? 0})
            </button>
            <button
              onClick={() => setStatusFilter('rejected')}
              className={`btn btn-sm ${statusFilter === 'rejected' ? 'btn-primary' : 'btn-outline'}`}
            >
              المرفوضة
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>اسم الصيدلية</th>
                <th>رقم الترخيص الرسمي</th>
                <th>الصيدلي المسؤول / الهاتف</th>
                <th>العنوان والإحداثيات</th>
                <th>التغطية</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {pharmacies.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--slate-400)' }}>
                    لا توجد صيدليات في هذا التصنيف حالياً.
                  </td>
                </tr>
              ) : (
                pharmacies.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--slate-900)' }}>{p.name}</strong>
                    </td>
                    <td>
                      <code style={{ background: 'var(--slate-100)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700, color: '#0369a1' }}>
                        {p.license_number}
                      </code>
                    </td>
                    <td>
                      <div>{p.user?.name || 'غير معروف'}</div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>{p.user?.phone}</span>
                    </td>
                    <td>
                      <div style={{ maxWidth: '220px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.address}>
                        {p.address}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                        ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
                      </span>
                    </td>
                    <td>{p.service_radius_km} كم</td>
                    <td>
                      {p.verification_status === 'pending' && <span className="badge badge-pending">قيد المراجعة</span>}
                      {p.verification_status === 'verified' && <span className="badge badge-verified">معتمدة</span>}
                      {p.verification_status === 'rejected' && <span className="badge badge-rejected">مرفوضة</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {p.verification_status !== 'verified' && (
                          <button
                            onClick={() => handleApprove(p.id, p.name)}
                            className="btn btn-sm btn-success"
                            title="اعتماد الترخيص وتفعيل الصيدلية"
                          >
                            اعتماد
                          </button>
                        )}
                        {p.verification_status !== 'rejected' && (
                          <button
                            onClick={() => handleOpenRejectModal(p.id)}
                            className="btn btn-sm btn-danger"
                            title="رفض الترخيص"
                          >
                            رفض
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Security & Audit Trail */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ScrollText size={20} color="var(--primary-600)" />
              سجل التدقيق الأمني المباشر (System Audit Logs)
            </h3>
            <p className="card-subtitle">تسجيل فوري لجميع عمليات المصادقة والتحقق وتغيير الصلاحيات</p>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>نوع الإجراء (Action)</th>
                <th>الهدف (Target)</th>
                <th>عنوان الـ IP</th>
                <th>التاريخ والوقت</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span style={{
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: log.action.includes('VERIFIED') ? 'var(--primary-700)' : log.action.includes('REJECTED') ? 'var(--danger-700)' : 'var(--slate-800)',
                    }}>
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.8rem', color: 'var(--slate-600)' }}>{log.target}</code>
                  </td>
                  <td>{log.ip || '127.0.0.1'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                    {new Date(log.timestamp).toLocaleString('ar-EG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectingPharmacyId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '90%', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--danger-700)' }}>
              رفض ترخيص الصيدلية
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)', marginBottom: '1rem' }}>
              يرجى كتابة سبب الرفض ليتم إبلاغ الصيدلي به وتدوينه في سجل التدقيق:
            </p>

            <textarea
              className="form-textarea"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اكتب سبب الرفض هنا..."
              style={{ marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setRejectingPharmacyId(null)}
                className="btn btn-outline"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="btn btn-danger"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
