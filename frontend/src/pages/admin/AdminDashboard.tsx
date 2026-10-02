import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';
import type {
  AdminStats,
  AdvancedAdminStats,
  AuditLogItem,
  PharmacyChangeRequestItem,
} from '../../api/admin';
import type { Pharmacy, PharmacyVerificationStatus } from '../../api/auth';
import {
  ShieldCheck,
  Users,
  Clock,
  CheckCircle2,
  RefreshCw,
  ScrollText,
  AlertTriangle,
  FileEdit,
  Power,
  TrendingUp,
  X,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [advStats, setAdvStats] = useState<AdvancedAdminStats | null>(null);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [changeRequests, setChangeRequests] = useState<PharmacyChangeRequestItem[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'verifications' | 'change_requests' | 'audit_logs'>('verifications');

  // Filters
  const [statusFilter, setStatusFilter] = useState<PharmacyVerificationStatus | undefined>('pending');
  const [crStatusFilter, setCrStatusFilter] = useState<'pending' | 'approved' | 'rejected' | undefined>('pending');

  const [isLoading, setIsLoading] = useState(true);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Rejection modal state for new registrations
  const [rejectingPharmacyId, setRejectingPharmacyId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Rejection modal state for change requests
  const [rejectingCrId, setRejectingCrId] = useState<string | null>(null);
  const [rejectCrReason, setRejectCrReason] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [statsData, advStatsData, pharmData, logsData, crData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getAdvancedStats(),
        adminApi.listPharmacies(statusFilter),
        adminApi.listAuditLogs(40),
        adminApi.listChangeRequests(crStatusFilter),
      ]);
      setStats(statsData);
      setAdvStats(advStatsData);
      setPharmacies(pharmData);
      setAuditLogs(logsData);
      setChangeRequests(crData);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      setActionError('فشل تحميل بيانات لوحة الإدارة.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, crStatusFilter]);

  const handleApprovePharmacy = async (pharmacyId: string, name: string) => {
    try {
      await adminApi.updatePharmacyVerification(pharmacyId, 'approve');
      setActionSuccess(`تم اعتماد ترخيص صيدلية "${name}" بنجاح.`);
      loadData();
    } catch (err) {
      setActionError('حدث خطأ أثناء اعتماد الصيدلية.');
    }
  };

  const handleOpenRejectModal = (pharmacyId: string) => {
    setRejectingPharmacyId(pharmacyId);
    setRejectReason('رقم الترخيص غير مسجل في قاعدة بيانات نقابة الصيادلة أو بيانات المنشأة غير دقيقة');
  };

  const handleConfirmRejectPharmacy = async () => {
    if (!rejectingPharmacyId) return;
    try {
      await adminApi.updatePharmacyVerification(rejectingPharmacyId, 'reject', rejectReason);
      setActionSuccess('تم رفض اعتماد الصيدلية وحفظ سبب الرفض في السجل.');
      setRejectingPharmacyId(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      setActionError('حدث خطأ أثناء رفض الصيدلية.');
    }
  };

  const handleTogglePharmacyStatus = async (pharmacyId: string, currentStatus: string, name: string) => {
    const nextStatus = currentStatus === 'active' ? 'تجميد' : 'إعادة تفعيل';
    if (!window.confirm(`هل أنت متأكد من ${nextStatus} حساب صيدلية "${name}"؟`)) return;
    try {
      await adminApi.togglePharmacyStatus(pharmacyId);
      setActionSuccess(`تم تغيير حالة صيدلية "${name}" بنجاح.`);
      loadData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'حدث خطأ أثناء تغيير حالة الصيدلية.');
    }
  };

  const handleApproveChangeRequest = async (crId: string) => {
    try {
      await adminApi.approveChangeRequest(crId, 'تمت مراجعة البيان واعتماده رسمياً');
      setActionSuccess('تم اعتماد وتطبيق التعديل المطلوب على ملف الصيدلية فورياً بنجاح.');
      loadData();
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'حدث خطأ أثناء اعتماد التعديل.';
      setActionError(msg);
    }
  };

  const handleConfirmRejectChangeRequest = async () => {
    if (!rejectingCrId) return;
    try {
      await adminApi.rejectChangeRequest(rejectingCrId, rejectCrReason || 'تم رفض التعديل لعدم استيفاء الشروط');
      setActionSuccess('تم رفض طلب التعديل وتدوين السبب للصيدلية.');
      setRejectingCrId(null);
      setRejectCrReason('');
      loadData();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'حدث خطأ أثناء رفض طلب التعديل.');
    }
  };

  const getFieldNameLabel = (field: string) => {
    switch (field) {
      case 'phone':
        return 'رقم الهاتف الرسمي';
      case 'commercial_name':
        return 'الاسم التجاري للصيدلية';
      case 'address_and_coordinates':
        return 'العنوان والإحداثيات الجغرافية (GPS)';
      default:
        return field;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span style={{ color: 'var(--primary-600)', fontWeight: 700, fontSize: '0.875rem' }}>مركز الإدارة والرقابة الحية</span>
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--slate-900)' }}>
            لوحة تحكم المشرف العام — إدارة التراخيص والتعديلات
          </h1>
        </div>
        <button onClick={loadData} disabled={isLoading} className="btn btn-outline btn-sm">
          <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          <span>{isLoading ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
          <AlertTriangle size={18} />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Advanced Metrics Row */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #3b82f6' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>إجمالي المستخدمين</span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats?.total_users ?? '...'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>مرضى: {stats?.total_patients ?? 0}</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #f59e0b' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', background: 'var(--warning-50)', color: 'var(--warning-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>تراخيص جديدة معلقة</span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--warning-700)' }}>{stats?.pending_pharmacies ?? '...'}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--warning-600)' }}>بانتظار التحقق</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #8b5cf6' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileEdit size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>طلبات تعديل البيانات</span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7c3aed' }}>
              {advStats?.pending_change_requests ?? 0}
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>تتطلب مراجعة المشرف</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderRight: '4px solid #10b981' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: 'var(--radius-md)', background: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>نسبة تلبية الطلبات</span>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-700)' }}>
              {advStats?.fulfillment_rate_percent ?? 0}%
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>أوامر شراء: {advStats?.total_orders ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="tabs-nav" style={{ marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('verifications')}
          className={`btn ${activeTab === 'verifications' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ShieldCheck size={18} />
          <span>تراخيص الصيدليات الجديدة ({stats?.pending_pharmacies ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('change_requests')}
          className={`btn ${activeTab === 'change_requests' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <FileEdit size={18} />
          <span>طلبات تعديل بيانات الصيدليات ({advStats?.pending_change_requests ?? 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit_logs')}
          className={`btn ${activeTab === 'audit_logs' ? 'btn-primary' : 'btn-outline'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <ScrollText size={18} />
          <span>سجل التدقيق الأمني (Audit Logs)</span>
        </button>
      </div>

      {/* TAB 1: New Pharmacy Verifications & Status Toggle */}
      {activeTab === 'verifications' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={22} color="var(--primary-600)" />
                طابور فحص تراخيص الصيدليات وإدارة الحسابات
              </h3>
              <p className="card-subtitle">فحص رقم الترخيص المهني، تفعيل الصيدليات، أو تجميد الحسابات المخالفة</p>
            </div>

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
                  <th>رقم الترخيص</th>
                  <th>الصيدلي المسؤول / الهاتف</th>
                  <th>العنوان والإحداثيات</th>
                  <th>حالة الترخيص</th>
                  <th>حالة الحساب</th>
                  <th>الإجراءات والتحكم</th>
                </tr>
              </thead>
              <tbody>
                {pharmacies.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--slate-400)' }}>
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
                        <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.address}>
                          {p.address}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                          ({p.lat.toFixed(4)}, {p.lng.toFixed(4)})
                        </span>
                      </td>
                      <td>
                        {p.verification_status === 'pending' && <span className="badge badge-pending">قيد المراجعة</span>}
                        {p.verification_status === 'verified' && <span className="badge badge-verified">معتمدة</span>}
                        {p.verification_status === 'rejected' && <span className="badge badge-rejected">مرفوضة</span>}
                      </td>
                      <td>
                        {p.status === 'active' ? (
                          <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.8rem', background: '#dcfce7', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                            نشط
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.8rem', background: '#fee2e2', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
                            مجمد
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {p.verification_status !== 'verified' && (
                            <button
                              onClick={() => handleApprovePharmacy(p.id, p.name)}
                              className="btn btn-sm btn-success"
                              title="اعتماد الترخيص"
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
                          {p.verification_status === 'verified' && (
                            <button
                              onClick={() => handleTogglePharmacyStatus(p.id, p.status, p.name)}
                              className="btn btn-sm btn-outline"
                              style={{
                                color: p.status === 'active' ? '#b91c1c' : '#15803d',
                                borderColor: p.status === 'active' ? '#fca5a5' : '#86efac',
                              }}
                              title={p.status === 'active' ? 'تجميد حساب الصيدلية مؤقتاً' : 'إعادة تفعيل الصيدلية'}
                            >
                              <Power size={14} />
                              <span>{p.status === 'active' ? 'تجميد' : 'تفعيل'}</span>
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
      )}

      {/* TAB 2: Sensitive Profile Change Requests Queue */}
      {activeTab === 'change_requests' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileEdit size={22} color="var(--primary-600)" />
                طابور طلبات تعديل بيانات الصيدليات (Sensitive Change Requests)
              </h3>
              <p className="card-subtitle">
                مراجعة واعتماد التعديلات الحساسة (أرقام الهواتف، الإحداثيات، الاسم) لمنع الاحتيال والتلاعب الجغرافي
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setCrStatusFilter('pending')}
                className={`btn btn-sm ${crStatusFilter === 'pending' ? 'btn-primary' : 'btn-outline'}`}
              >
                قيد الانتظار ({advStats?.pending_change_requests ?? 0})
              </button>
              <button
                onClick={() => setCrStatusFilter('approved')}
                className={`btn btn-sm ${crStatusFilter === 'approved' ? 'btn-primary' : 'btn-outline'}`}
              >
                المعتمدة
              </button>
              <button
                onClick={() => setCrStatusFilter('rejected')}
                className={`btn btn-sm ${crStatusFilter === 'rejected' ? 'btn-primary' : 'btn-outline'}`}
              >
                المرفوضة
              </button>
              <button
                onClick={() => setCrStatusFilter(undefined)}
                className={`btn btn-sm ${!crStatusFilter ? 'btn-primary' : 'btn-outline'}`}
              >
                الكل
              </button>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>الصيدلية</th>
                  <th>البيان المطلوب تغييره</th>
                  <th>القيمة الحالية المعتمدة</th>
                  <th>القيمة الجديدة المقترحة</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                  <th>الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {changeRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--slate-400)' }}>
                      لا توجد طلبات تعديل بيانات في هذا التصنيف حالياً.
                    </td>
                  </tr>
                ) : (
                  changeRequests.map((cr) => (
                    <tr key={cr.id}>
                      <td>
                        <strong>{cr.pharmacy_name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>{cr.pharmacy_license}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#4338ca', background: '#e0e7ff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                          {getFieldNameLabel(cr.field_name)}
                        </span>
                      </td>
                      <td style={{ maxWidth: '200px', wordBreak: 'break-word', fontSize: '0.85rem', color: 'var(--slate-600)' }}>
                        {cr.old_value}
                      </td>
                      <td style={{ maxWidth: '220px', wordBreak: 'break-word', fontSize: '0.85rem', color: 'var(--primary-700)', fontWeight: 700 }}>
                        {cr.new_value}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                        {new Date(cr.created_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td>
                        {cr.status === 'pending' && <span className="badge badge-pending">قيد المراجعة</span>}
                        {cr.status === 'approved' && <span className="badge badge-verified">تم الاعتماد</span>}
                        {cr.status === 'rejected' && <span className="badge badge-rejected">مرفوض</span>}
                      </td>
                      <td>
                        {cr.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => handleApproveChangeRequest(cr.id)}
                              className="btn btn-sm btn-success"
                              title="اعتماد وتطبيق البيان فورياً"
                            >
                              اعتماد
                            </button>
                            <button
                              onClick={() => {
                                setRejectingCrId(cr.id);
                                setRejectCrReason('');
                              }}
                              className="btn btn-sm btn-danger"
                              title="رفض التعديل"
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                            بواسطة: {cr.reviewed_by_name || 'المشرف'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Audit Logs */}
      {activeTab === 'audit_logs' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ScrollText size={20} color="var(--primary-600)" />
              سجل التدقيق الأمني المباشر (Audit Logs)
            </h3>
            <p className="card-subtitle">
              تسجيل إلزامي لعمليات الوصول للبيانات الصحية، معاينة الروشتات، واعتماد التراخيص وتعديلات البيانات
            </p>
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
                        color: log.action.includes('APPROVED') || log.action.includes('VERIFIED')
                          ? 'var(--primary-700)'
                          : log.action.includes('REJECTED') || log.action.includes('SUSPENDED')
                          ? 'var(--danger-700)'
                          : log.action.includes('IMAGE')
                          ? '#7c3aed'
                          : 'var(--slate-800)',
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
      )}

      {/* Modal: Reject New Pharmacy Registration */}
      {rejectingPharmacyId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
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
                onClick={handleConfirmRejectPharmacy}
                className="btn btn-danger"
              >
                تأكيد الرفض
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reject Sensitive Change Request */}
      {rejectingCrId && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <div className="card" style={{ maxWidth: '480px', width: '90%', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--danger-700)' }}>
              رفض طلب تعديل بيانات الصيدلية
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--slate-600)', marginBottom: '1rem' }}>
              يرجى توضيح سبب رفض التعديل (مثل: عدم تقديم ما يثبت ملكية الرقم أو عدم مطابقة الاسم للترخيص):
            </p>

            <textarea
              className="form-textarea"
              rows={3}
              value={rejectCrReason}
              onChange={(e) => setRejectCrReason(e.target.value)}
              placeholder="اكتب سبب رفض طلب التعديل هنا..."
              style={{ marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setRejectingCrId(null)}
                className="btn btn-outline"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectChangeRequest}
                className="btn btn-danger"
              >
                تأكيد رفض التعديل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
