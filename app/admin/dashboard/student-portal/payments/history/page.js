'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePayments } from '@/hooks/useRedux';
import apiService from '@/services/api';
import s from '@/styles/student-portal.module.css';

const STATUS_CFG = {
  success:   { cls: s.badgeApproved,  icon: 'fa-check-circle', text: 'Successful' },
  pending:   { cls: s.badgePending,   icon: 'fa-clock',        text: 'Pending' },
  failed:    { cls: s.badgeFailed,    icon: 'fa-times-circle', text: 'Failed' },
  cancelled: { cls: s.badgeCancelled, icon: 'fa-ban',          text: 'Cancelled' },
};

function PayBadge({ status }) {
  const b = STATUS_CFG[status] || STATUS_CFG.pending;
  return <span className={`${s.badge} ${b.cls}`}><i className={`fas ${b.icon}`} />{b.text}</span>;
}

const fmt = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PaymentHistoryPage() {
  const { payments, loading, error, fetchMyPayments } = usePayments();
  const [downloadingInvoice, setDownloadingInvoice] = useState(null);

  useEffect(() => { fetchMyPayments(); }, [fetchMyPayments]);

  const handleDownloadInvoice = async (ref) => {
    try {
      setDownloadingInvoice(ref);
      const res = await apiService.get(`/payments/invoice/${ref}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url; link.download = `payment-invoice-${ref}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch { alert('Failed to download invoice. Please try again.'); }
    finally { setDownloadingInvoice(null); }
  };

  const successful = payments.filter((p) => p.payment_status === 'success');
  const totalPaid = successful.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  const STATS = [
    { label: 'Successful', value: successful.length, color: '#059669', icon: 'fa-check-circle' },
    { label: 'Total Paid', value: `₦${totalPaid.toLocaleString()}`, color: '#1e3a5f', icon: 'fa-naira-sign' },
  ];

  if (loading) {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status"><span className="visually-hidden">Loading…</span></div></div>;
  }

  if (error) {
    return (
      <div className={s.wrap}>
        <div className={`${s.alertDanger} mb-4`}><i className="fas fa-exclamation-triangle me-2" />{error}</div>
        <button className={s.btnOutline} onClick={() => fetchMyPayments()}><i className="fas fa-refresh" />Try Again</button>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#f0fdf4', color: '#059669' }}><i className="fas fa-history" /></span>
            Payment History
          </h1>
          <p className={s.pageSub}>Successful payment receipts only</p>
        </div>
        <Link href="/admin/dashboard/student-portal/payments" className={s.btnOutline}><i className="fas fa-arrow-left" />Back to Payments</Link>
      </div>

      {/* Stats */}
      <div className="row g-3 mb-4">
        {STATS.map((st) => (
          <div key={st.label} className="col-md-3 col-6">
            <div className={s.statCard} style={{ '--accent': st.color }}>
              <div className={s.statLeft}>
                <div className={s.statIcon} style={{ background: `${st.color}15`, color: st.color }}>
                  <i className={`fas ${st.icon}`} />
                </div>
                <div>
                  <div className={s.statLabel}>{st.label}</div>
                  <div className={s.statNumber} style={{ color: st.color, fontSize: '1.4rem' }}>{st.value}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}><i className="fas fa-list me-2" style={{ color: '#2563eb' }} />Successful Transactions</span>
        </div>

        {successful.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><i className="fas fa-receipt" /></div>
            <h5 className={s.emptyTitle}>No Successful Payments Yet</h5>
            <p className={s.emptySub}>Only successful payments and receipts will appear here.</p>
            <Link href="/admin/dashboard/student-portal/applications" className={s.btnPrimary}><i className="fas fa-plus" />Submit Application</Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {successful.map((p) => (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: '0.75rem', color: '#2563eb' }}>{p.transaction_reference}</code></td>
                    <td><strong style={{ color: '#059669' }}>₦{parseFloat(p.amount || 0).toLocaleString()}</strong></td>
                    <td><PayBadge status={p.payment_status} /></td>
                    <td>
                      <span className={`${s.badge} ${s.badgeDraft}`}><i className="fas fa-credit-card" />{p.payment_method || 'Card'}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>{fmt(p.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <Link href={`/admin/dashboard/student-portal/payments/receipt?reference=${p.transaction_reference}`} className={`${s.btnGreen} ${s.btnSm}`}>
                          <i className="fas fa-receipt" />Receipt
                        </Link>
                        <button
                          className={`${s.btnOutline} ${s.btnSm}`}
                          onClick={() => handleDownloadInvoice(p.transaction_reference)}
                          disabled={downloadingInvoice === p.transaction_reference}
                        >
                          {downloadingInvoice === p.transaction_reference
                            ? <span className="spinner-border spinner-border-sm" />
                            : <i className="fas fa-download" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
