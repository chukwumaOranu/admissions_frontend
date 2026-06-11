'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import layoutStyles from './dashboard-layout.module.css';

const TABS = [
  { id: 'overview',      label: 'Overview',      icon: 'fas fa-chart-pie',       href: '/admin/dashboard' },
  { id: 'applications',  label: 'Applications',  icon: 'fas fa-file-alt',        href: '/admin/dashboard/applications' },
  { id: 'payments',      label: 'Payments',       icon: 'fas fa-credit-card',     href: '/admin/dashboard/payments' },
  { id: 'exams',         label: 'Exams',          icon: 'fas fa-clipboard-check', href: '/admin/dashboard/exams/entry-dates' },
  { id: 'results',       label: 'Results',        icon: 'fas fa-poll',            href: '/admin/dashboard/applications/admission' },
];

const STUDENT_TABS = [
  { id: 'overview',      label: 'Overview',      icon: 'fas fa-chart-pie',       href: '/admin/dashboard/student-portal' },
  { id: 'applications',  label: 'Applications',  icon: 'fas fa-file-alt',        href: '/admin/dashboard/student-portal/applications' },
  { id: 'payments',      label: 'Payments',      icon: 'fas fa-credit-card',     href: '/admin/dashboard/student-portal/payments' },
  { id: 'exams',         label: 'Exams',         icon: 'fas fa-clipboard-check', href: '/admin/dashboard/student-portal/exams' },
  { id: 'results',       label: 'Results',       icon: 'fas fa-poll',            href: '/admin/dashboard/student-portal/results' },
];

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const isStudentPortal = pathname.startsWith('/admin/dashboard/student-portal');
  const tabs = isStudentPortal ? STUDENT_TABS : TABS;

  const isTabActive = (tab) => {
    if (tab.id === 'overview') return pathname === tab.href;
    return pathname === tab.href || pathname.startsWith(tab.href.replace('/entry-dates', '') + '/') || pathname.startsWith(tab.href + '/');
  };

  return (
    <div className={layoutStyles.shell}>

      {/* Page Header */}
      <div className={layoutStyles.header}>
        <div className={layoutStyles.headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ width: 34, height: 34, borderRadius: '9px', background: '#eff6ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-tachometer-alt" style={{ color: '#2563eb', fontSize: '0.9rem' }} />
              </span>
              Dashboard
            </h1>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: '#94a3b8', fontWeight: 400 }}>
              {isStudentPortal ? 'Welcome to your student portal' : 'Welcome to DeepFlux Admissions Admin Portal'}
            </p>
          </div>

          {!isStudentPortal && <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600,
              background: '#fff', border: '1.5px solid #e2e8f0', color: '#475569', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#fff'; }}
            >
              <i className="fas fa-download" style={{ fontSize: '0.75rem' }} />
              Export
            </button>
            <Link href="/admin/dashboard/applications/new" style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.825rem', fontWeight: 600,
              background: '#1e3a5f', color: '#fff', textDecoration: 'none', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#2563eb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#1e3a5f'; }}
            >
              <i className="fas fa-plus" style={{ fontSize: '0.75rem' }} />
              Quick Add
            </Link>
          </div>}
        </div>

        {/* Tab Bar */}
        <div className={layoutStyles.tabs}>
          {tabs.map((tab) => {
            const active = isTabActive(tab);
            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`${layoutStyles.tab} ${active ? layoutStyles.tabActive : ''}`}
              >
                <i className={tab.icon} style={{ fontSize: '0.8rem' }} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className={layoutStyles.content}>
        {children}
      </div>
    </div>
  );
}
