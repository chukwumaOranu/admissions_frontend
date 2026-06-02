'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { API_ENDPOINTS, API_URL, apiService } from '@/services/api';
import { useApplications } from '@/hooks/useRedux';
import { usePermissions } from '@/hooks/usePermissions';
import s from '@/styles/admin-portal.module.css';

const initials = (name) => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function AdmissionLettersPage() {
  const { data: session, status } = useSession();
  const { applications, fetchApplications } = useApplications();
  const { hasPermission } = usePermissions();
  const loadedRef = useRef(false);

  const [subjects, setSubjects] = useState([]);
  const [benchmark, setBenchmark] = useState(180);
  const [successfulCandidates, setSuccessful] = useState([]);
  const [selectedSuccessful, setSelSuccessful] = useState([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canReadAdmission = hasPermission('admission_result.read');
  const canUpdateBenchmark = hasPermission('admission_benchmark.update');
  const canSendLetters = hasPermission('admission_letter.send');
  const canDownloadLetter = hasPermission('admission_letter.generate');

  const eligible = useMemo(
    () => applications.filter(a => a.status === 'approved' && a.payment_status === 'paid'),
    [applications]
  );

  const loadAdmissionData = async () => {
    try {
      setError('');
      const [subjectsRes, benchRes, successRes] = await Promise.all([
        apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECTS),
        apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.BENCHMARK),
        apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.SUCCESSFUL),
      ]);
      setSubjects(subjectsRes.data || []);
      setBenchmark(Number(benchRes.data?.benchmark_score || 180));
      setSuccessful(successRes.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load admission letter data');
    }
  };

  useEffect(() => { loadedRef.current = false; }, [session?.user?.id]);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id && !loadedRef.current) {
      loadedRef.current = true;
      fetchApplications();
      loadAdmissionData();
    }
  }, [status, session?.user?.id, fetchApplications]);

  const handleSaveBenchmark = async () => {
    if (!canUpdateBenchmark) return;
    try {
      setBusy(true);
      setError('');
      await apiService.put(API_ENDPOINTS.APPLICATIONS.ADMISSION.BENCHMARK, {
        benchmark_score: Number(benchmark),
      });
      setNotice('Benchmark updated.');
      await loadAdmissionData();
    } catch (err) {
      setError(err.message || 'Failed to update benchmark');
    } finally {
      setBusy(false);
    }
  };

  const handleSendLetters = async () => {
    const approvedSelected = selectedSuccessful.filter((id) => {
      const candidate = successfulCandidates.find((item) => item.applicant_id === id);
      return candidate?.admission_status === 'approved';
    });

    if (!canSendLetters || !approvedSelected.length) {
      setError('Select at least one approved successful candidate.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const res = await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.LETTER_SEND, {
        applicant_ids: approvedSelected,
      });
      setNotice(`Letters processed. Sent: ${res.data?.sent || 0}, Failed: ${res.data?.failed || 0}`);
      await loadAdmissionData();
    } catch (err) {
      setError(err.message || 'Failed to send admission letters');
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (candidate, admissionStatus) => {
    if (!hasPermission('admission_decision.update')) return;
    try {
      setBusy(true);
      setError('');
      await apiService.put(API_ENDPOINTS.APPLICATIONS.ADMISSION.DECISION(candidate.applicant_id), {
        admission_status: admissionStatus,
        decision_notes: admissionStatus === 'approved'
          ? 'Approved for admission letter release'
          : admissionStatus === 'rejected'
            ? 'Not approved for admission letter release'
            : 'Returned to pending review'
      });
      setNotice(`Admission decision updated for ${candidate.application_number}.`);
      await loadAdmissionData();
    } catch (err) {
      setError(err.message || 'Failed to update admission decision');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadLetter = async (candidate) => {
    try {
      setDownloading(candidate.applicant_id);
      setError('');
      const res = await fetch(`${API_URL}${API_ENDPOINTS.APPLICATIONS.ADMISSION.LETTER_DOWNLOAD(candidate.applicant_id)}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        let message = 'Admission letter is not available';
        try { message = JSON.parse(text)?.message || message; } catch {}
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admission_letter_${candidate.application_number || candidate.applicant_id}.pdf`;
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

  const toggleSuccessful = (id) => setSelSuccessful(prev => (
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  ));

  const allSuccessful = successfulCandidates.length > 0
    && successfulCandidates.every(c => selectedSuccessful.includes(c.applicant_id));

  const toggleAllSuccessful = () => {
    setSelSuccessful(allSuccessful ? [] : successfulCandidates.map(c => c.applicant_id));
  };

  if (status === 'loading') {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status" /></div>;
  }

  const approvedCount = successfulCandidates.filter((candidate) => candidate.admission_status === 'approved').length;

  if (!canReadAdmission) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-lock" />You don&apos;t have permission to view admission letters.</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', padding: '1.5rem' }}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#d1fae5', color: '#059669' }}><i className="fas fa-graduation-cap" /></span>
            Admission Letters
          </h1>
          <p className={s.pageSub}>Review successful applicants and send or download admission letters</p>
        </div>
        <div className={s.pageActions}>
          <Link href="/admin/dashboard/applications/admission/assign-subjects" className={`${s.btn} ${s.btnOutline}`}>
            <i className="fas fa-tasks" />Assign Subjects
          </Link>
          <Link href="/admin/dashboard/applications/admission/scores" className={`${s.btn} ${s.btnPrimary}`}>
            <i className="fas fa-pencil-alt" />Scores & CSV
          </Link>
          <Link href="/admin/dashboard/applications" className={`${s.btn} ${s.btnOutline}`}>
            <i className="fas fa-arrow-left" />Applications
          </Link>
        </div>
      </div>

      {error && <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-exclamation-triangle" />{error}<button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="fas fa-times" /></button></div>}
      {notice && <div className={`${s.alert} ${s.alertSuccess}`}><i className="fas fa-check-circle" />{notice}<button onClick={() => setNotice('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#059669' }}><i className="fas fa-times" /></button></div>}

      <div className={s.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Subjects', value: subjects.length, icon: 'fas fa-book', color: '#2563eb' },
          { label: 'Eligible', value: eligible.length, icon: 'fas fa-file-alt', color: '#d97706' },
          { label: 'Passed Benchmark', value: successfulCandidates.length, icon: 'fas fa-check-circle', color: '#059669' },
          { label: 'Approved Letters', value: approvedCount, icon: 'fas fa-stamp', color: '#0891b2' },
          { label: 'Benchmark', value: benchmark, icon: 'fas fa-chart-bar', color: '#7c3aed' },
        ].map(stat => (
          <div key={stat.label} className={s.statCard} style={{ '--accent': stat.color }}>
            <div className={s.statInfo}>
              <div className={s.statLabel}>{stat.label}</div>
              <div className={s.statNumber} style={{ color: stat.color }}>{stat.value}</div>
            </div>
            <div className={s.statIcon} style={{ background: `${stat.color}18`, color: stat.color }}>
              <i className={stat.icon} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className={s.card} style={{ marginBottom: 0 }}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}><i className="fas fa-chart-bar" style={{ color: '#7c3aed' }} />Benchmark Score</span>
            </div>
            <div className={s.cardBody} style={{ display: 'flex', gap: '0.5rem' }}>
              <input className={s.formInput} type="number" value={benchmark} onChange={e => setBenchmark(e.target.value)} style={{ flex: 1 }} />
              <button className={`${s.btn} ${s.btnPrimary}`} disabled={busy || !canUpdateBenchmark} onClick={handleSaveBenchmark}>Save</button>
            </div>
            {!canUpdateBenchmark && <p style={{ padding: '0 1rem 0.875rem', fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>Read-only access</p>}
          </div>

          <div className={s.card} style={{ marginBottom: 0 }}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}><i className="fas fa-route" style={{ color: '#2563eb' }} />Admission Flow</span>
            </div>
            <div className={s.cardBody} style={{ display: 'grid', gap: '0.75rem' }}>
              <Link href="/admin/dashboard/applications/admission/assign-subjects" className={`${s.btn} ${s.btnOutline}`} style={{ justifyContent: 'flex-start' }}>
                <i className="fas fa-tasks" />Assign subjects by schedule
              </Link>
              <Link href="/admin/dashboard/applications/admission/scores" className={`${s.btn} ${s.btnOutline}`} style={{ justifyContent: 'flex-start' }}>
                <i className="fas fa-file-csv" />Enter or upload scores
              </Link>
              <Link href="/admin/dashboard/student-portal/results" className={`${s.btn} ${s.btnOutline}`} style={{ justifyContent: 'flex-start' }}>
                <i className="fas fa-user-graduate" />Student result view
              </Link>
            </div>
          </div>
        </div>

        <div className={s.card} style={{ marginBottom: 0 }}>
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0f4f8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className={s.cardTitle} style={{ margin: 0 }}>
              <i className="fas fa-check-circle" style={{ color: '#059669' }} />Passed Benchmark
              <span className={`${s.badge} ${s.badgeApproved}`} style={{ marginLeft: '0.5rem' }}>{successfulCandidates.length}</span>
            </span>
            <button className={`${s.btn} ${s.btnGreen}`} disabled={busy || !canSendLetters || !selectedSuccessful.length} onClick={handleSendLetters}>
              {busy ? <><span className="spinner-border spinner-border-sm" />Sending...</> : <><i className="fas fa-envelope" />Send Letters ({selectedSuccessful.length})</>}
            </button>
          </div>

          {selectedSuccessful.length > 0 && (
            <div className={s.bulkBar}>
              <span className={s.bulkBarInfo}><i className="fas fa-check-square" />{selectedSuccessful.length} selected</span>
              <button onClick={() => setSelSuccessful([])} className={`${s.btn} ${s.btnOutline} ${s.btnSm}`}>Deselect all</button>
            </div>
          )}

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ width: 40, paddingLeft: '1.25rem' }}>
                    <input type="checkbox" className={s.checkbox} checked={allSuccessful} onChange={toggleAllSuccessful} />
                  </th>
                  <th>App #</th>
                  <th>Candidate</th>
                  <th>Total Score</th>
                  <th>Decision</th>
                  <th style={{ paddingRight: '1.25rem' }}>Letter</th>
                </tr>
              </thead>
              <tbody>
                {successfulCandidates.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af', fontSize: '0.875rem' }}>No candidates have passed the benchmark yet. Enter scores from the Scores & CSV page.</td></tr>
                ) : successfulCandidates.map(candidate => (
                  <tr key={candidate.applicant_id}>
                    <td style={{ paddingLeft: '1.25rem' }}>
                      <input type="checkbox" className={s.checkbox} checked={selectedSuccessful.includes(candidate.applicant_id)} onChange={() => toggleSuccessful(candidate.applicant_id)} />
                    </td>
                    <td><span className={s.tdMono}>{candidate.application_number}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={s.tdAvatar}>{initials(`${candidate.first_name} ${candidate.last_name}`)}</span>
                        <div>
                          <div className={s.tdName}>{candidate.first_name} {candidate.last_name}</div>
                          <div className={s.tdEmail}>{candidate.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 700, color: '#059669', fontSize: '0.95rem' }}>{candidate.total_score}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className={`${s.badge} ${candidate.admission_status === 'approved' ? s.badgeApproved : candidate.admission_status === 'rejected' ? s.badgeRejected : s.badgePending}`}>
                          {candidate.admission_status || 'pending'}
                        </span>
                        {hasPermission('admission_decision.update') && (
                          <>
                            <button className={`${s.btn} ${s.btnGreen} ${s.btnSm}`} disabled={busy || candidate.admission_status === 'approved'} onClick={() => handleDecision(candidate, 'approved')}>
                              Approve
                            </button>
                            <button className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} disabled={busy || candidate.admission_status === 'rejected'} onClick={() => handleDecision(candidate, 'rejected')}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ paddingRight: '1.25rem' }}>
                      {canDownloadLetter && candidate.admission_status === 'approved' ? (
                        <button className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} onClick={() => handleDownloadLetter(candidate)} disabled={downloading === candidate.applicant_id}>
                          {downloading === candidate.applicant_id ? <><span className="spinner-border spinner-border-sm" />PDF</> : <><i className="fas fa-file-pdf" />Download</>}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>{canDownloadLetter ? 'Approval required' : 'No access'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={s.mobileList}>
            {successfulCandidates.map(candidate => (
              <div key={candidate.applicant_id} className={s.mobileCard}>
                <div className={s.mobileCardHead}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" className={s.checkbox} checked={selectedSuccessful.includes(candidate.applicant_id)} onChange={() => toggleSuccessful(candidate.applicant_id)} />
                    <span className={s.tdAvatar}>{initials(`${candidate.first_name} ${candidate.last_name}`)}</span>
                    <div>
                      <div className={s.tdName}>{candidate.first_name} {candidate.last_name}</div>
                      <div className={s.tdEmail}>{candidate.email}</div>
                    </div>
                  </div>
                  <span style={{ fontWeight: 700, color: '#059669' }}>{candidate.total_score}</span>
                </div>
                <div className={s.mobileCardBody}>
                  <div className={s.mobileCardRow}>
                    <span className={s.mobileCardKey}>App #</span>
                    <span className={s.mobileCardVal}>{candidate.application_number}</span>
                  </div>
                  <div className={s.mobileCardRow}>
                    <span className={s.mobileCardKey}>Decision</span>
                    <span className={s.mobileCardVal}>{candidate.admission_status || 'pending'}</span>
                  </div>
                </div>
                {hasPermission('admission_decision.update') && (
                  <div className={s.mobileCardFoot}>
                    <button className={`${s.btn} ${s.btnGreen} ${s.btnSm}`} disabled={busy || candidate.admission_status === 'approved'} onClick={() => handleDecision(candidate, 'approved')}>Approve</button>
                    <button className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} disabled={busy || candidate.admission_status === 'rejected'} onClick={() => handleDecision(candidate, 'rejected')}>Reject</button>
                  </div>
                )}
                {canDownloadLetter && candidate.admission_status === 'approved' && (
                  <div className={s.mobileCardFoot}>
                    <button className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} onClick={() => handleDownloadLetter(candidate)} disabled={downloading === candidate.applicant_id}>
                      <i className="fas fa-file-pdf" />Download PDF
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {successfulCandidates.length > 0 && (
            <div className={s.cardFooter}>
              <span><strong>{successfulCandidates.length}</strong> successful candidate{successfulCandidates.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 991px) {
          div[style*="grid-template-columns: 320px 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
