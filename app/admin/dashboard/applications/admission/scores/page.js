'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { API_ENDPOINTS, API_URL, apiService } from '@/services/api';
import s from '@/styles/admin-portal.module.css';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
const keyFor = (applicantId, subjectId) => `${applicantId}:${subjectId}`;

export default function AdmissionScoresPage() {
  const { data: session, status } = useSession();
  const [entryDates, setEntryDates] = useState([]);
  const [examDateId, setExamDateId] = useState('');
  const [scoreSheet, setScoreSheet] = useState([]);
  const [scoreEntries, setScoreEntries] = useState({});
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const load = async () => {
      if (status !== 'authenticated') return;
      try {
        setError('');
        const datesRes = await apiService.get(API_ENDPOINTS.EXAMS.ENTRY_DATES.GET_ALL);
        setEntryDates(datesRes.data || []);
      } catch (err) {
        setError(err.message || 'Failed to load score entry data');
      }
    };
    load();
  }, [status]);

  const loadScoreSheet = useCallback(async (scheduleId) => {
    setScoreSheet([]);
    setScoreEntries({});
    if (!scheduleId) return;
    try {
      setLoadingSheet(true);
      setError('');
      const res = await apiService.get(`${API_ENDPOINTS.APPLICATIONS.ADMISSION.SCORES_SHEET}?exam_date_id=${scheduleId}`);
      const rows = res.data || [];
      const entries = {};
      rows.forEach((applicant) => {
        (applicant.subjects || []).forEach((subject) => {
          entries[keyFor(applicant.applicant_id, subject.subject_id)] = subject.score ?? '';
        });
      });
      setScoreSheet(rows);
      setScoreEntries(entries);
    } catch (err) {
      setError(err.message || 'Failed to load score sheet');
    } finally {
      setLoadingSheet(false);
    }
  }, []);

  const subjectColumns = useMemo(() => {
    const byId = new Map();
    scoreSheet.forEach((applicant) => {
      (applicant.subjects || []).forEach((subject) => {
        if (!byId.has(subject.subject_id)) byId.set(subject.subject_id, subject);
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.subject_name.localeCompare(b.subject_name));
  }, [scoreSheet]);

  const saveAllScores = async () => {
    if (!scoreSheet.length) { setError('No applicants with assigned subjects found for this schedule.'); return; }
    try {
      setBusy(true);
      setError('');
      setNotice('');
      const applicants = scoreSheet.map((applicant) => ({
        applicant_id: applicant.applicant_id,
        scores: (applicant.subjects || []).map((subject) => ({
          subject_id: subject.subject_id,
          score: Number(scoreEntries[keyFor(applicant.applicant_id, subject.subject_id)] || 0),
        })),
      })).filter((applicant) => applicant.scores.length > 0);

      const res = await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.SCORES_BULK, { applicants });
      setNotice(`Scores saved for ${res.data?.updatedApplicants || applicants.length} applicant${applicants.length !== 1 ? 's' : ''}.`);
      await loadScoreSheet(examDateId);
    } catch (err) {
      setError(err.message || 'Failed to save scores');
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = async () => {
    try {
      const res = await fetch(`${API_URL}${API_ENDPOINTS.APPLICATIONS.ADMISSION.SCORES_EXPORT}`, {
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to download CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'admission_scores.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to download CSV');
    }
  };

  const uploadCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setBusy(true);
      setError('');
      setNotice('');
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.SCORES_IMPORT, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setNotice(`CSV imported. Updated applicants: ${res.data?.updatedApplicants || 0}. Errors: ${(res.data?.errors || []).length}.`);
      if (examDateId) await loadScoreSheet(examDateId);
    } catch (err) {
      setError(err.message || 'Failed to upload CSV');
    } finally {
      e.target.value = '';
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', padding: '1.5rem' }}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#fef3c7', color: '#d97706' }}><i className="fas fa-pencil-alt" /></span>
            Admission Score Sheet
          </h1>
          <p className={s.pageSub}>Select an exam schedule, enter scores for the full list, then save once</p>
        </div>
        <div className={s.pageActions}>
          <button className={`${s.btn} ${s.btnOutline}`} onClick={downloadCsv}><i className="fas fa-download" />Download CSV</button>
          <label className={`${s.btn} ${s.btnGreen}`} style={{ margin: 0 }}>
            <i className="fas fa-upload" />Upload CSV
            <input type="file" accept=".csv,text/csv" onChange={uploadCsv} style={{ display: 'none' }} />
          </label>
          <Link href="/admin/dashboard/applications/admission/assign-subjects" className={`${s.btn} ${s.btnPrimary}`}><i className="fas fa-tasks" />Assign Subjects</Link>
          <Link href="/admin/dashboard/applications/admission" className={`${s.btn} ${s.btnOutline}`}><i className="fas fa-arrow-left" />Letters</Link>
        </div>
      </div>

      {error && <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-exclamation-triangle" />{error}</div>}
      {notice && <div className={`${s.alert} ${s.alertSuccess}`}><i className="fas fa-check-circle" />{notice}</div>}

      <div className={s.card} style={{ marginBottom: '1.25rem' }}>
        <div className={s.cardBody} style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 420px) auto', gap: '1rem', alignItems: 'end' }}>
          <div>
            <label className={s.formLabel}>Exam Schedule</label>
            <select className={s.formSelect} value={examDateId} onChange={e => { setExamDateId(e.target.value); loadScoreSheet(e.target.value); }}>
              <option value="">Select schedule...</option>
              {entryDates.map(date => (
                <option key={date.id} value={date.id}>{date.exam_title} - {fmtDate(date.exam_date)} {date.exam_time}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className={`${s.btn} ${s.btnPrimary}`} onClick={saveAllScores} disabled={busy || loadingSheet || !scoreSheet.length}>
              {busy ? <><span className="spinner-border spinner-border-sm" />Saving...</> : <><i className="fas fa-save" />Save All Scores</>}
            </button>
            <span className={`${s.badge} ${s.badgeInfo}`} style={{ alignSelf: 'center' }}>{scoreSheet.length} applicant{scoreSheet.length !== 1 ? 's' : ''}</span>
            <span className={`${s.badge} ${s.badgePending}`} style={{ alignSelf: 'center' }}>{subjectColumns.length} subject{subjectColumns.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className={s.card} style={{ marginBottom: 0 }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}><i className="fas fa-list-ol" style={{ color: '#059669' }} />Scores</span>
        </div>
        {loadingSheet ? (
          <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status" /></div>
        ) : !examDateId ? (
          <div className={s.emptyState}><div className={s.emptyTitle}>Select an exam schedule</div><p className={s.emptySub}>Applicants with assigned subjects will appear here.</p></div>
        ) : scoreSheet.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyTitle}>No score sheet yet</div>
            <p className={s.emptySub}>Assign subjects to applicants in this schedule before entering scores.</p>
            <Link href="/admin/dashboard/applications/admission/assign-subjects" className={`${s.btn} ${s.btnPrimary}`}><i className="fas fa-tasks" />Assign Subjects</Link>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ minWidth: 130, paddingLeft: '1.25rem' }}>Application</th>
                  <th style={{ minWidth: 190 }}>Applicant</th>
                  {subjectColumns.map((subject) => (
                    <th key={subject.subject_id} style={{ minWidth: 130 }}>
                      {subject.subject_name}
                      <span style={{ display: 'block', color: '#9ca3af', fontWeight: 400, fontSize: '0.72rem' }}>/{subject.max_score}</span>
                    </th>
                  ))}
                  <th style={{ minWidth: 110, paddingRight: '1.25rem' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {scoreSheet.map((applicant) => {
                  const assignedIds = new Set((applicant.subjects || []).map(subject => subject.subject_id));
                  return (
                    <tr key={applicant.applicant_id}>
                      <td style={{ paddingLeft: '1.25rem' }}><span className={s.tdMono}>{applicant.application_number}</span></td>
                      <td>
                        <div className={s.tdName}>{`${applicant.first_name || ''} ${applicant.last_name || ''}`.trim() || 'Applicant'}</div>
                        <div className={s.tdEmail}>{applicant.email}</div>
                      </td>
                      {subjectColumns.map((subject) => {
                        const isAssigned = assignedIds.has(subject.subject_id);
                        const scoreKey = keyFor(applicant.applicant_id, subject.subject_id);
                        return (
                          <td key={subject.subject_id}>
                            {isAssigned ? (
                              <input
                                className={s.formInput}
                                type="number"
                                min={0}
                                max={subject.max_score}
                                value={scoreEntries[scoreKey] ?? ''}
                                onChange={e => setScoreEntries(prev => ({ ...prev, [scoreKey]: e.target.value }))}
                                style={{ width: 92, padding: '0.45rem 0.55rem' }}
                              />
                            ) : (
                              <span style={{ color: '#cbd5e1' }}>-</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ paddingRight: '1.25rem' }}>
                        {applicant.total_score !== null && applicant.total_score !== undefined ? (
                          <div>
                            <strong style={{ color: '#1e3a5f' }}>{applicant.total_score}</strong>
                            <div><span className={`${s.badge} ${applicant.is_successful ? s.badgeApproved : s.badgeRejected}`}>{applicant.is_successful ? 'Pass' : 'Below'}</span></div>
                          </div>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.82rem' }}>Not saved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
