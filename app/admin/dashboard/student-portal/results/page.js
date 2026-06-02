'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { API_ENDPOINTS, API_URL, apiService } from '@/services/api';
import s from '@/styles/student-portal.module.css';

const fmt = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

const unwrapResults = (payload) => {
  const candidates = [
    payload,
    payload?.data,
    payload?.data?.data,
    payload?.data?.results,
    payload?.data?.data?.results,
    payload?.results,
  ];
  return candidates.find(Array.isArray) || [];
};

export default function StudentResults() {
  const { data: session, status } = useSession();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    const loadResults = async () => {
      if (status !== 'authenticated') return;
      try {
        setLoading(true);
        setError('');
        const res = await apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.MY_RESULTS);
        setResults(unwrapResults(res));
      } catch (err) {
        setError(err.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    loadResults();
  }, [status]);

  const downloadLetter = async (applicantId, applicationNumber) => {
    try {
      setDownloading(applicantId);
      const res = await fetch(`${API_URL}${API_ENDPOINTS.APPLICATIONS.ADMISSION.MY_LETTER_DOWNLOAD(applicantId)}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      if (!res.ok) throw new Error('Admission letter is not available');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admission_letter_${applicationNumber || applicantId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download admission letter');
    } finally {
      setDownloading(null);
    }
  };

  if (status === 'loading' || loading) {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status" /></div>;
  }

  return (
    <div className={s.wrap}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}><i className="fas fa-poll" /></span>
            My Results
          </h1>
          <p className={s.pageSub}>Exam scores and admission status</p>
        </div>
      </div>

      {error && <div className={s.alertDanger}><i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />{error}</div>}

      {results.length === 0 ? (
        <div className={s.card}>
          <div className={s.emptyState}>
            <div className={s.emptyIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}><i className="fas fa-poll" /></div>
            <h5 className={s.emptyTitle}>No Results Available</h5>
            <p className={s.emptySub}>Your exam results will appear here once they are published by the admissions office.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/admin/dashboard/student-portal/applications" className={s.btnPrimary}><i className="fas fa-file-alt" />My Applications</Link>
              <Link href="/admin/dashboard/student-portal/exams" className={s.btnOutline}><i className="fas fa-clipboard-check" />Exam Details</Link>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {results.map((result) => {
            const successful = Boolean(result.is_successful);
            const approved = result.admission_status === 'approved';
            const letterAvailable = successful && approved;
            return (
              <div key={result.applicant_id} className={s.card}>
                <div className={s.cardHeader}>
                  <span className={s.cardTitle}>
                    <i className="fas fa-award" style={{ color: successful ? '#059669' : '#d97706' }} />
                    {result.application_number}
                  </span>
                  <span className={`${s.badge} ${letterAvailable ? s.badgeApproved : successful ? s.badgePending : s.badgeRejected}`}>
                    {letterAvailable ? 'Approved' : successful ? 'Awaiting Approval' : 'Not Yet Admitted'}
                  </span>
                </div>
                <div className={s.cardBody}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                    {[
                      ['Program', result.schema_display_name || result.schema_name || 'N/A'],
                      ['Total Score', fmt(result.total_score)],
                      ['Average', fmt(result.average_score)],
                      ['Benchmark', fmt(result.benchmark_score)],
                      ['Decision', result.admission_status || 'pending'],
                    ].map(([label, value]) => (
                      <div key={label} className={s.statCard} style={{ '--accent': successful ? '#059669' : '#d97706' }}>
                        <div className={s.statLabel}>{label}</div>
                        <div className={s.statNumber} style={{ color: '#1e293b', fontSize: '1rem' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Score</th>
                          <th>Max</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(result.subjects || []).map((subject) => (
                          <tr key={subject.subject_id}>
                            <td>{subject.subject_name}</td>
                            <td><strong>{fmt(subject.score)}</strong></td>
                            <td>{fmt(subject.max_score)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {letterAvailable ? (
                      <button className={s.btnGreen} onClick={() => downloadLetter(result.applicant_id, result.application_number)} disabled={downloading === result.applicant_id}>
                        {downloading === result.applicant_id ? <><span className="spinner-border spinner-border-sm" />Downloading…</> : <><i className="fas fa-file-pdf" />Download Admission Letter</>}
                      </button>
                    ) : successful ? (
                      <span className={`${s.badge} ${s.badgePending}`}><i className="fas fa-hourglass-half" />Admission letter awaiting approval</span>
                    ) : (
                      <Link href="/admin/dashboard/student-portal/help" className={s.btnOutline}><i className="fas fa-headset" />Contact Admissions</Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
