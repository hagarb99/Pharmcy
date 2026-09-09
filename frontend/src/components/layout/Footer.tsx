import React from 'react';
import { Heart, ShieldCheck, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer style={{ background: 'white', borderTop: '1px solid var(--slate-200)', padding: '2rem 1.5rem', marginTop: 'auto' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--slate-900)' }}>دواء تك — Dawa Tech</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
            المنصة الذكية للربط اللحظي بين المرضى والصيدليات في جمهورية مصر العربية
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', fontSize: '0.85rem', color: 'var(--slate-600)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <MapPin size={16} color="var(--primary-600)" /> مطابقة جغرافية دقيقة
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ShieldCheck size={16} color="var(--primary-600)" /> صيدليات مرخصة ومعتمدة
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Heart size={16} color="#e11d48" /> سلامتك أولاً
          </span>
        </div>
      </div>
      <div style={{ maxWidth: '1200px', margin: '1rem auto 0', paddingTop: '1rem', borderTop: '1px solid var(--slate-100)', textAlign: 'center', fontSize: '0.8rem', color: 'var(--slate-400)' }}>
        © 2026 دواء تك. جميع الحقوق محفوظة. لا توجد قاعدة بيانات أدوية مركزية — الصيدليات هي المصدر الفعلي للتوفر والأسعار.
      </div>
    </footer>
  );
};
