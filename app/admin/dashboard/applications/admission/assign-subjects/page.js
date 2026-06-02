'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { API_ENDPOINTS, apiService } from '@/services/api';
import { usePermissions } from '@/hooks/usePermissions';
import s from '@/styles/admin-portal.module.css';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

export default function AssignAdmissionSubjectsPage() {
  const { status } = useSession();
  const { hasPermission } = usePermissions();
  const [entryDates, setEntryDates] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [subjectForm, setSubjectForm] = useState({ subject_name: '', max_score: 100 });
  const [examDateId, setExamDateId] = useState('');
  const [subjectIds, setSubjectIds] = useState([]);
  const [selectedApplicantIds, setSelectedApplicantIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canManageSubjects = hasPermission('admission_subject.create') || hasPermission('admission_subject.update');

  const loadAssignments = useCallback(async (scheduleId = '') => {
    const query = scheduleId ? `?exam_date_id=${scheduleId}` : '';
    const res = await apiService.get(`${API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECT_ASSIGNMENTS}${query}`);
    setAssignments(res.data || []);
  }, []);

  useEffect(() => {
    const load = async () => {
      if (status !== 'authenticated') return;
      try {
        setError('');
        const [datesRes, subjectsRes] = await Promise.all([
          apiService.get(API_ENDPOINTS.EXAMS.ENTRY_DATES.GET_ALL),
          apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECTS),
        ]);
        setEntryDates(datesRes.data || []);
        setSubjects(subjectsRes.data || []);
        await loadAssignments();
      } catch (err) {
        setError(err.message || 'Failed to load subject assignment data');
      }
    };
    load();
  }, [status, loadAssignments]);

  useEffect(() => {
    setSelectedApplicantIds([]);
    if (status === 'authenticated') loadAssignments(examDateId);
  }, [examDateId, status, loadAssignments]);

  const scheduleApplicants = useMemo(() => assignments, [assignments]);
  const assignedCount = useMemo(() => scheduleApplicants.filter(app => Number(app.assigned_count || 0) > 0).length, [scheduleApplicants]);
  const unassignedCount = scheduleApplicants.length - assignedCount;
  const allSelected = scheduleApplicants.length > 0 && scheduleApplicants.every(app => selectedApplicantIds.includes(app.applicant_id));

  const toggleSubject = (id) => setSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleApplicant = (id) => setSelectedApplicantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAllApplicants = () => {
    setSelectedApplicantIds(allSelected ? [] : scheduleApplicants.map(app => app.applicant_id));
  };

  const reloadSubjects = async () => {
    const subjectsRes = await apiService.get(API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECTS);
    setSubjects(subjectsRes.data || []);
  };

  const handleCreateSubject = async (e) => {
    e.preventDefault();
    if (!canManageSubjects) return;
    try {
      setBusy(true);
      setError('');
      setNotice('');
      await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECTS, {
        subject_name: subjectForm.subject_name,
        max_score: Number(subjectForm.max_score || 100),
      });
      setSubjectForm({ subject_name: '', max_score: 100 });
      setNotice('Subject created.');
      await reloadSubjects();
    } catch (err) {
      setError(err.message || 'Failed to create subject');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateSubject = async (subject, patch) => {
    if (!canManageSubjects) return;
    try {
      setBusy(true);
      setError('');
      setNotice('');
      await apiService.put(`${API_ENDPOINTS.APPLICATIONS.ADMISSION.SUBJECTS}/${subject.id}`, {
        subject_name: patch.subject_name ?? subject.subject_name,
        max_score: Number(patch.max_score ?? subject.max_score),
        ...(Object.prototype.hasOwnProperty.call(patch, 'is_active') ? { is_active: patch.is_active } : {}),
      });
      setNotice('Subject updated.');
      await reloadSubjects();
    } catch (err) {
      setError(err.message || 'Failed to update subject');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!examDateId) { setError('Select an exam schedule.'); return; }
    if (!subjectIds.length) { setError('Select at least one subject.'); return; }
    try {
      setBusy(true); setError(''); setNotice('');
      const res = await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.EXAM_DATE_SUBJECTS(examDateId), {
        subject_ids: subjectIds,
      });
      setNotice(`Assigned ${res.data?.subject_count || subjectIds.length} subjects to ${res.data?.applicant_count || 0} applicants.`);
      setSelectedApplicantIds([]);
      await loadAssignments(examDateId);
    } catch (err) {
      setError(err.message || 'Failed to assign subjects');
    } finally {
      setBusy(false);
    }
  };

  const handleAssignSelected = async () => {
    if (!selectedApplicantIds.length) { setError('Select at least one applicant.'); return; }
    if (!subjectIds.length) { setError('Select at least one subject.'); return; }
    try {
      setBusy(true); setError(''); setNotice('');
      const res = await apiService.post(API_ENDPOINTS.APPLICATIONS.ADMISSION.BULK_APPLICANT_SUBJECTS, {
        applicant_ids: selectedApplicantIds,
        subject_ids: subjectIds,
      });
      setNotice(`Assigned ${res.data?.subject_count || subjectIds.length} subjects to ${res.data?.applicant_count || selectedApplicantIds.length} selected applicant${selectedApplicantIds.length !== 1 ? 's' : ''}.`);
      setSelectedApplicantIds([]);
      await loadAssignments(examDateId);
    } catch (err) {
      setError(err.message || 'Failed to assign selected applicants');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', padding: '1.5rem' }}>
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#eff6ff', color: '#2563eb' }}><i className="fas fa-tasks" /></span>
            Assign Admission Subjects
          </h1>
          <p className={s.pageSub}>Track assigned subjects and assign by schedule or selected applicants</p>
        </div>
        <div className={s.pageActions}>
          <Link href="/admin/dashboard/applications/admission" className={`${s.btn} ${s.btnOutline}`}><i className="fas fa-arrow-left" />Admission</Link>
          <Link href="/admin/dashboard/applications/admission/scores" className={`${s.btn} ${s.btnPrimary}`}><i className="fas fa-pencil-alt" />Scores</Link>
        </div>
      </div>

      {error && <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-exclamation-triangle" />{error}</div>}
      {notice && <div className={`${s.alert} ${s.alertSuccess}`}><i className="fas fa-check-circle" />{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div className={s.card} style={{ marginBottom: 0 }}>
          <div className={s.cardHeader}><span className={s.cardTitle}><i className="fas fa-calendar" style={{ color: '#d97706' }} />Exam Schedule</span></div>
          <div className={s.cardBody}>
            <label className={s.formLabel}>Schedule</label>
            <select className={s.formSelect} value={examDateId} onChange={e => setExamDateId(e.target.value)}>
              <option value="">All schedules</option>
              {entryDates.map(date => (
                <option key={date.id} value={date.id}>{date.exam_title} - {fmtDate(date.exam_date)} {date.exam_time}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.74rem', color: '#166534' }}>Assigned</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#059669' }}>{assignedCount}</div>
              </div>
              <div style={{ padding: '0.65rem', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div style={{ fontSize: '0.74rem', color: '#92400e' }}>Unassigned</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>{unassignedCount}</div>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <label className={s.formLabel}>Subjects</label>
              {canManageSubjects && (
                <form onSubmit={handleCreateSubject} style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input className={s.formInput} placeholder="Subject name" value={subjectForm.subject_name} onChange={e => setSubjectForm(prev => ({ ...prev, subject_name: e.target.value }))} required />
                  <input className={s.formInput} type="number" min={1} placeholder="Max score" value={subjectForm.max_score} onChange={e => setSubjectForm(prev => ({ ...prev, max_score: e.target.value }))} />
                  <button className={`${s.btn} ${s.btnOutline}`} disabled={busy} type="submit" style={{ justifyContent: 'center' }}>
                    <i className="fas fa-plus" />Add Subject
                  </button>
                </form>
              )}
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {subjects.map(subject => (
                  <div key={subject.id} style={{ display: 'grid', gridTemplateColumns: canManageSubjects ? '28px 1fr 70px 32px' : '28px 1fr 54px', alignItems: 'center', gap: 6, padding: '0.55rem', background: subjectIds.includes(subject.id) ? '#eff6ff' : '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                    <input type="checkbox" checked={subjectIds.includes(subject.id)} onChange={() => toggleSubject(subject.id)} />
                    {canManageSubjects ? (
                      <>
                        <input className={s.formInput} defaultValue={subject.subject_name} onBlur={e => e.target.value !== subject.subject_name && handleUpdateSubject(subject, { subject_name: e.target.value })} style={{ padding: '0.38rem 0.5rem', fontSize: '0.82rem' }} />
                        <input className={s.formInput} type="number" defaultValue={subject.max_score} onBlur={e => Number(e.target.value) !== Number(subject.max_score) && handleUpdateSubject(subject, { max_score: e.target.value })} style={{ padding: '0.38rem 0.5rem', fontSize: '0.82rem' }} />
                        <button className={s.btnIcon} type="button" title="Deactivate" disabled={busy} onClick={() => handleUpdateSubject(subject, { is_active: false })}><i className="fas fa-times" /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '0.86rem', color: '#374151' }}>{subject.subject_name}</span>
                        <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>/{subject.max_score}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button className={`${s.btn} ${s.btnPrimary}`} disabled={busy || !selectedApplicantIds.length} onClick={handleAssignSelected} style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
              {busy ? <><span className="spinner-border spinner-border-sm" />Assigning...</> : <><i className="fas fa-check-square" />Assign Selected ({selectedApplicantIds.length})</>}
            </button>
            <button className={`${s.btn} ${s.btnGreen}`} disabled={busy || !examDateId} onClick={handleBulkAssign} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
              <i className="fas fa-users" />Assign All in Schedule
            </button>
            {!examDateId && <p style={{ margin: '0.5rem 0 0', color: '#9ca3af', fontSize: '0.76rem' }}>Select one schedule to use Assign All. Use checkboxes for late applicants.</p>}
          </div>
        </div>

        <div className={s.card} style={{ marginBottom: 0 }}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}><i className="fas fa-users" style={{ color: '#059669' }} />Subject Assignment Tracker <span style={{ color: '#9ca3af', fontWeight: 400 }}>({scheduleApplicants.length})</span></span>
          </div>
          {selectedApplicantIds.length > 0 && (
            <div className={s.bulkBar}>
              <span className={s.bulkBarInfo}><i className="fas fa-check-square" />{selectedApplicantIds.length} selected</span>
              <button onClick={() => setSelectedApplicantIds([])} className={`${s.btn} ${s.btnOutline} ${s.btnSm}`}>Deselect all</button>
            </div>
          )}
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th style={{ width: 40, paddingLeft: '1.25rem' }}><input type="checkbox" className={s.checkbox} checked={allSelected} onChange={toggleAllApplicants} /></th>
                  <th>Application</th>
                  <th>Candidate</th>
                  <th>Schedule</th>
                  <th>Assigned Subjects</th>
                  <th style={{ paddingRight: '1.25rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {scheduleApplicants.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>No approved paid applicants found.</td></tr>
                ) : scheduleApplicants.map(app => (
                  <tr key={app.applicant_id}>
                    <td style={{ paddingLeft: '1.25rem' }}>
                      <input type="checkbox" className={s.checkbox} checked={selectedApplicantIds.includes(app.applicant_id)} onChange={() => toggleApplicant(app.applicant_id)} />
                    </td>
                    <td><span className={s.tdMono}>{app.application_number}</span></td>
                    <td><div className={s.tdName}>{`${app.first_name || ''} ${app.last_name || ''}`.trim() || 'Applicant'}</div><div className={s.tdEmail}>{app.email}</div></td>
                    <td>
                      <div style={{ fontSize: '0.82rem', color: '#374151' }}>{app.exam_title || 'No schedule'}</div>
                      <div style={{ fontSize: '0.76rem', color: '#9ca3af' }}>{fmtDate(app.exam_date)} {app.exam_time || ''}</div>
                    </td>
                    <td>
                      {app.assigned_subject_names?.length ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          {app.assigned_subject_names.map(name => <span key={name} className={`${s.badge} ${s.badgeInfo}`}>{name}</span>)}
                        </div>
                      ) : (
                        <span style={{ color: '#d97706', fontSize: '0.82rem' }}>No subjects assigned</span>
                      )}
                    </td>
                    <td style={{ paddingRight: '1.25rem' }}>
                      <span className={`${s.badge} ${Number(app.assigned_count || 0) > 0 ? s.badgeApproved : s.badgePending}`}>
                        {Number(app.assigned_count || 0) > 0 ? 'Assigned' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
