'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useApplications } from '@/hooks/useRedux';
import { API_ENDPOINTS, API_URL, apiService } from '@/services/api';
import s from '@/styles/student-portal.module.css';

const inp = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.875rem', color: '#374151', background: '#fff', outline: 'none', boxSizing: 'border-box' };
const IMAGE_URL = API_URL.replace(/\/api\/?$/, '');

export default function NewApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const { schemas, loading: schemasLoading, createApplication, submitApplication } = useApplications();

  const schemaId = searchParams.get('schema');

  const [schema, setSchema]   = useState(null);
  const [fields, setFields]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState('');
  const [formData, setFormData]           = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [filePreviews, setFilePreviews]   = useState({});
  const [studentProfile, setStudentProfile] = useState(null);
  const [savedDocuments, setSavedDocuments] = useState({});
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState(null);

  const fetchSchemaAndProfile = useCallback(async () => {
    try {
      setLoading(true); setError('');

      let foundSchema = schemas.find(sc => Number(sc.id) === Number(schemaId));
      if (!foundSchema) {
        const schemaResponse = await apiService.get(API_ENDPOINTS.APPLICATIONS.SCHEMAS.GET_BY_ID(schemaId));
        foundSchema = schemaResponse.data?.data || schemaResponse.data;
      }
      if (!foundSchema?.id) throw new Error('Program not found');
      setSchema(foundSchema);

      const [fieldsRes, profileRes, applicationsRes] = await Promise.all([
        apiService.get(API_ENDPOINTS.APPLICATIONS.SCHEMAS.FIELDS.GET_ALL(schemaId)),
        apiService.get(API_ENDPOINTS.STUDENTS.GET_ME),
        apiService.get(API_ENDPOINTS.APPLICATIONS.GET_MY),
      ]);

      const fieldsData = fieldsRes.data?.fields || fieldsRes.data || [];
      setFields(fieldsData.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));

      const student = profileRes.data || profileRes;
      const applications = applicationsRes.data?.data || [];
      const existingDraft = applications.find(
        app => Number(app.schema_id) === Number(schemaId) && app.status === 'draft'
      );
      const draftCustomData = existingDraft?.custom_data && typeof existingDraft.custom_data === 'string'
        ? JSON.parse(existingDraft.custom_data)
        : existingDraft?.custom_data || {};
      const existingDocuments = Object.fromEntries(
        Object.entries(draftCustomData).filter(([, value]) => typeof value === 'string' && value.startsWith('/uploads/documents/'))
      );

      setStudentProfile(student);
      setSavedDocuments(existingDocuments);
      setFormData({
        applicant_name:  existingDraft
          ? `${existingDraft.first_name || ''} ${existingDraft.last_name || ''}`.trim()
          : `${student.first_name} ${student.last_name}`,
        applicant_email: existingDraft?.email || student.email,
        applicant_phone: existingDraft?.phone || student.phone || '',
        date_of_birth:   existingDraft?.date_of_birth?.split('T')[0] || (student.date_of_birth ? student.date_of_birth.split('T')[0] : ''),
        gender:          existingDraft?.gender || student.gender || '',
        address:         existingDraft?.address || student.address || '',
        city:            student.city || '',
        state:           student.state || '',
        country:         student.country || 'Nigeria',
        guardian_name:   existingDraft?.emergency_contact_name || student.guardian_name || '',
        guardian_phone:  existingDraft?.emergency_contact_phone || student.guardian_phone || '',
        guardian_email:  student.guardian_email || '',
        ...draftCustomData,
      });
    } catch (loadError) {
      setError(loadError.response?.data?.message || loadError.message || 'Failed to load application form');
    }
    finally { setLoading(false); }
  }, [schemas, schemaId]);

  useEffect(() => {
    if (status === 'authenticated' && schemaId) fetchSchemaAndProfile();
  }, [status, schemaId, fetchSchemaAndProfile]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleFileChange = (fieldName, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadedFiles(prev => ({ ...prev, [fieldName]: file }));
    setFilePreviews(prev => {
      if (prev[fieldName]) URL.revokeObjectURL(prev[fieldName]);
      return {
        ...prev,
        [fieldName]: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      };
    });
    setError('');
  };

  const handleProfilePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image for your profile photo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be smaller than 5MB.');
      return;
    }

    if (profilePhotoPreview) URL.revokeObjectURL(profilePhotoPreview);
    setProfilePhotoFile(file);
    setProfilePhotoPreview(URL.createObjectURL(file));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentProfile?.profile_photo && !profilePhotoFile) {
      setError('Please upload your profile photo before submitting your application.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      setSubmitting(true); setError('');

      if (profilePhotoFile) {
        const photoForm = new FormData();
        photoForm.append('profile_photo', profilePhotoFile);
        const photoResponse = await apiService.post(
          `/students/${studentProfile.id}/upload-photo`,
          photoForm
        );
        const profilePhoto = photoResponse.data?.profile_photo || photoResponse.profile_photo;
        if (!profilePhoto) throw new Error('Profile photo upload failed. Please try again.');
        setStudentProfile(current => ({ ...current, profile_photo: profilePhoto }));
      }

      const customData = { ...savedDocuments };
      fields.forEach(field => { if (formData[field.field_name]) customData[field.field_name] = formData[field.field_name]; });

      const applicationPayload = {
        schema_id: schemaId, applicant_name: formData.applicant_name,
        applicant_email: formData.applicant_email, applicant_phone: formData.applicant_phone,
        date_of_birth: formData.date_of_birth, gender: formData.gender,
        address: formData.address, city: formData.city, state: formData.state,
        country: formData.country, guardian_name: formData.guardian_name,
        guardian_phone: formData.guardian_phone, guardian_email: formData.guardian_email,
        custom_data: customData,
      };

      const myApplicationsResponse = await apiService.get(API_ENDPOINTS.APPLICATIONS.GET_MY);
      const myApplications = myApplicationsResponse.data?.data || [];
      const existingDraft = myApplications.find(
        app => Number(app.schema_id) === Number(schemaId) && app.status === 'draft'
      );

      let createdApplication;
      if (existingDraft) {
        const nameParts = formData.applicant_name.trim().split(/\s+/);
        const updatedDraft = await apiService.put(
          API_ENDPOINTS.APPLICATIONS.UPDATE(existingDraft.id),
          {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' '),
            email: formData.applicant_email,
            phone: formData.applicant_phone,
            date_of_birth: formData.date_of_birth,
            gender: formData.gender,
            address: formData.address,
            emergency_contact_name: formData.guardian_name,
            emergency_contact_phone: formData.guardian_phone,
            custom_data: customData,
          }
        );
        createdApplication = updatedDraft.data?.data;
      } else {
        createdApplication = await createApplication(applicationPayload).unwrap();
      }

      const uploadedDocuments = {};
      for (const [fieldName, file] of Object.entries(uploadedFiles)) {
        const documentForm = new FormData();
        documentForm.append('document', file);
        const uploadResponse = await apiService.post(
          API_ENDPOINTS.APPLICATIONS.UPLOAD_DOCUMENT(createdApplication.id),
          documentForm
        );
        const documentUrl = uploadResponse.data?.data?.document_url;
        if (!documentUrl) throw new Error(`Failed to save ${file.name}`);
        uploadedDocuments[fieldName] = documentUrl;
      }

      if (Object.keys(uploadedDocuments).length > 0) {
        await apiService.put(API_ENDPOINTS.APPLICATIONS.UPDATE(createdApplication.id), {
          custom_data: { ...customData, ...uploadedDocuments },
        });
      }

      await submitApplication(createdApplication.id).unwrap();

      router.push('/admin/dashboard/student-portal/applications');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to submit application');
    } finally { setSubmitting(false); }
  };

  const renderField = (field) => {
    const common = { name: field.field_name, value: formData[field.field_name] || '', onChange: handleChange, required: field.is_required, placeholder: field.placeholder || '', style: inp };
    switch (field.field_type) {
      case 'textarea': return <textarea {...common} rows={3} style={{ ...inp, resize: 'vertical' }} />;
      case 'select': return (
        <select {...common} style={inp}>
          <option value="">Select an option</option>
          {field.field_options && field.field_options.split(',').map((opt, i) => <option key={i} value={opt.trim()}>{opt.trim()}</option>)}
        </select>
      );
      case 'radio': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {field.field_options && field.field_options.split(',').map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="radio" name={field.field_name} value={opt.trim()} checked={formData[field.field_name] === opt.trim()} onChange={handleChange} required={field.is_required} />
              {opt.trim()}
            </label>
          ))}
        </div>
      );
      case 'checkbox': return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {field.field_options && field.field_options.split(',').map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="checkbox" value={opt.trim()} onChange={(e) => {
                const current = formData[field.field_name] || [];
                const newVal = e.target.checked ? [...current, opt.trim()] : current.filter(v => v !== opt.trim());
                setFormData(prev => ({ ...prev, [field.field_name]: newVal }));
              }} />
              {opt.trim()}
            </label>
          ))}
        </div>
      );
      case 'file': return (
        <div>
          <input type="file" accept=".jpg,.jpeg,.png,.gif,.pdf" style={inp} onChange={(e) => handleFileChange(field.field_name, e)} required={field.is_required && !savedDocuments[field.field_name]} />
          {savedDocuments[field.field_name] && !uploadedFiles[field.field_name] && (
            <p style={{ fontSize: '0.8rem', color: '#059669', margin: '0.25rem 0 0' }}>
              <i className="fas fa-check-circle" style={{ marginRight: 4 }} />Previously uploaded
            </p>
          )}
          {uploadedFiles[field.field_name] && (
            <>
              <p style={{ fontSize: '0.8rem', color: '#059669', margin: '0.25rem 0 0' }}>
                <i className="fas fa-check-circle" style={{ marginRight: 4 }} />{uploadedFiles[field.field_name].name}
              </p>
              {filePreviews[field.field_name] && (
                <Image
                  src={filePreviews[field.field_name]}
                  alt={`${field.field_label} preview`}
                  width={112}
                  height={112}
                  unoptimized
                  style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 8, border: '1px solid #d1d5db', marginTop: 8 }}
                />
              )}
            </>
          )}
        </div>
      );
      default: return <input type={field.field_type === 'phone' ? 'tel' : field.field_type || 'text'} {...common} />;
    }
  };

  const lbl = (text, required) => (
    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>
      {text}{required && <span style={{ color: '#dc2626', marginLeft: 2 }}>*</span>}
    </label>
  );

  const field = (label, child, required) => (
    <div style={{ marginBottom: '1rem' }}>
      {lbl(label, required)}
      {child}
    </div>
  );

  if (loading || schemasLoading || status === 'loading') {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#059669' }} role="status" /></div>;
  }

  if (!schema) {
    return (
      <div className={s.wrap}>
        <div className={s.alertWarning}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />Program not found.
        </div>
        <Link href="/admin/dashboard/student-portal/applications/browse" className={s.btnOutline} style={{ marginTop: '0.75rem', display: 'inline-flex' }}>
          <i className="fas fa-search" />Browse Programs
        </Link>
      </div>
    );
  }

  const docFields = fields.filter(f => f.field_type === 'file');
  const profilePhotoUrl = profilePhotoPreview || (
    studentProfile?.profile_photo
      ? `${IMAGE_URL}${studentProfile.profile_photo}`
      : null
  );

  return (
    <div className={s.wrap}>

      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#d1fae5', color: '#059669' }}><i className="fas fa-file-alt" /></span>
            New Application
          </h1>
          <p className={s.pageSub}>{schema.display_name || schema.schema_name}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/admin/dashboard/student-portal/applications/browse" className={s.btnOutline}>
            <i className="fas fa-arrow-left" />Browse
          </Link>
        </div>
      </div>

      {error && (
        <div className={s.alertDanger} style={{ marginBottom: '1rem' }}>
          <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }} />{error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}><i className="fas fa-times" /></button>
        </div>
      )}

      {/* Progress Steps */}
      <div className={s.card} style={{ marginBottom: '1.25rem' }}>
        <div className={s.cardBody} style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
            {[{ n: 1, label: 'Fill Form', active: true }, { n: 2, label: 'Review', active: false }, { n: 3, label: 'Payment', active: false }].map((step, idx) => (
              <div key={step.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: step.active ? '#059669' : '#e5e7eb', color: step.active ? '#fff' : '#6b7280', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.95rem' }}>{step.n}</div>
                  <div style={{ fontSize: '0.78rem', color: step.active ? '#059669' : '#9ca3af', marginTop: 4 }}>{step.label}</div>
                </div>
                {idx < 2 && <div style={{ height: 2, background: '#e5e7eb', flex: 1, margin: '0 0.5rem' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className={s.responsiveGrid}>

          {/* Left column: forms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Profile Photo */}
            <div className={s.formSection}>
              <div className={s.formSectionHead}>
                <div className={s.iconBox} style={{ background: '#f0fdf4', color: '#059669' }}><i className="fas fa-camera" /></div>
                <span className={s.formSectionTitle}>Profile Photo</span>
              </div>
              <div className={s.formSectionBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  {profilePhotoUrl ? (
                    <Image
                      src={profilePhotoUrl}
                      alt="Profile photo"
                      width={112}
                      height={112}
                      unoptimized
                      style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 8, border: '1px solid #d1d5db' }}
                    />
                  ) : (
                    <div style={{ width: 112, height: 112, borderRadius: 8, border: '1px dashed #9ca3af', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '2rem' }}>
                      <i className="fas fa-user" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>
                      Upload Profile Photo <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input type="file" accept="image/*" onChange={handleProfilePhotoChange} style={inp} />
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.35rem 0 0' }}>
                      Required before submission. Maximum size: 5MB.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Basic Information */}
            <div className={s.formSection}>
              <div className={s.formSectionHead}>
                <div className={s.iconBox} style={{ background: '#eff6ff', color: '#2563eb' }}><i className="fas fa-user" /></div>
                <span className={s.formSectionTitle}>Basic Information</span>
              </div>
              <div className={s.formSectionBody}>
                <div className={s.alertInfo} style={{ marginBottom: '1rem' }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 6 }} />
                  <span style={{ fontSize: '0.82rem' }}>Pre-filled from your profile — edit if needed.</span>
                </div>
                {field('Full Name', <input type="text" name="applicant_name" value={formData.applicant_name || ''} onChange={handleChange} required style={inp} />, true)}
                <div className={s.formGrid2}>
                  <div>{field('Email', <input type="email" name="applicant_email" value={formData.applicant_email || ''} onChange={handleChange} required style={inp} />, true)}</div>
                  <div>{field('Phone', <input type="tel" name="applicant_phone" value={formData.applicant_phone || ''} onChange={handleChange} required style={inp} />, true)}</div>
                  <div>{field('Date of Birth', <input type="date" name="date_of_birth" value={formData.date_of_birth || ''} onChange={handleChange} style={inp} />)}</div>
                  <div>
                    {field('Gender', (
                      <select name="gender" value={formData.gender || ''} onChange={handleChange} style={inp}>
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    ))}
                  </div>
                </div>
                {field('Address', <textarea name="address" value={formData.address || ''} onChange={handleChange} rows={2} placeholder="Full address" style={{ ...inp, resize: 'vertical' }} />)}
                <div className={s.formGrid3}>
                  <div>{field('City',    <input type="text" name="city"    value={formData.city    || ''} onChange={handleChange} style={inp} />)}</div>
                  <div>{field('State',   <input type="text" name="state"   value={formData.state   || ''} onChange={handleChange} style={inp} />)}</div>
                  <div>{field('Country', <input type="text" name="country" value={formData.country || ''} onChange={handleChange} style={inp} />)}</div>
                </div>
              </div>
            </div>

            {/* Guardian */}
            <div className={s.formSection}>
              <div className={s.formSectionHead}>
                <div className={s.iconBox} style={{ background: '#fef3c7', color: '#d97706' }}><i className="fas fa-user-friends" /></div>
                <span className={s.formSectionTitle}>Guardian / Parent</span>
              </div>
              <div className={s.formSectionBody}>
                {field('Guardian Name', <input type="text" name="guardian_name" value={formData.guardian_name || ''} onChange={handleChange} placeholder="Full name" style={inp} />)}
                <div className={s.formGrid2}>
                  <div>{field('Phone', <input type="tel" name="guardian_phone" value={formData.guardian_phone || ''} onChange={handleChange} placeholder="+234 XXX XXX XXXX" style={inp} />)}</div>
                  <div>{field('Email', <input type="email" name="guardian_email" value={formData.guardian_email || ''} onChange={handleChange} placeholder="guardian@email.com" style={inp} />)}</div>
                </div>
              </div>
            </div>

            {/* Dynamic Fields */}
            {fields.length > 0 && (
              <div className={s.formSection}>
                <div className={s.formSectionHead}>
                  <div className={s.iconBox} style={{ background: '#d1fae5', color: '#059669' }}><i className="fas fa-edit" /></div>
                  <span className={s.formSectionTitle}>Additional Information</span>
                </div>
                <div className={s.formSectionBody}>
                  {fields.map(f => (
                    <div key={f.id} style={{ marginBottom: '1rem' }}>
                      {lbl(f.field_label, f.is_required)}
                      {renderField(f)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className={s.mobileActions}>
              <button type="submit" className={s.btnGreen} disabled={submitting} style={{ flex: 1 }}>
                {submitting
                  ? <><span className="spinner-border spinner-border-sm" />Submitting…</>
                  : <><i className="fas fa-paper-plane" />Submit Application</>}
              </button>
              <Link href="/admin/dashboard/student-portal/applications/browse" className={s.btnOutline}>
                <i className="fas fa-times" />Cancel
              </Link>
            </div>
          </div>

          {/* Sidebar: Application Summary */}
          <div>
            <div className={`${s.card} ${s.stickySummary}`}>
              <div className={s.cardHeader}>
                <span className={s.cardTitle}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: '#d1fae5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                    <i className="fas fa-info-circle" style={{ fontSize: '0.75rem' }} />
                  </span>
                  Application Summary
                </span>
              </div>
              <div className={s.cardBody} style={{ padding: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.75rem' }}>{schema.display_name}</div>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Application Fee</span>
                    <strong style={{ color: '#059669', fontSize: '1.1rem' }}>₦{parseFloat(schema.application_fee || 0).toLocaleString()}</strong>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Payable after submission</p>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Your Information</p>
                  {[
                    { label: 'Name',  value: formData.applicant_name },
                    { label: 'Email', value: formData.applicant_email },
                    { label: 'Phone', value: formData.applicant_phone },
                  ].map(row => (
                    <div key={row.label} className={s.infoRow}>
                      <span className={s.infoLabel}>{row.label}</span>
                      <span className={s.infoValue}>{row.value || '—'}</span>
                    </div>
                  ))}
                </div>

                {docFields.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.4rem' }}>Required Documents</p>
                    <ul style={{ fontSize: '0.8rem', color: '#374151', paddingLeft: '1rem', margin: 0, lineHeight: 2 }}>
                      {docFields.map(f => (
                        <li key={f.id}>
                          {f.field_label}
                          {uploadedFiles[f.field_name] && <i className="fas fa-check-circle" style={{ color: '#059669', marginLeft: 6 }} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className={s.alertWarning} style={{ margin: 0 }}>
                  <i className="fas fa-exclamation-triangle" />
                  <span style={{ fontSize: '0.78rem' }}>Review all information before submitting.</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </form>
    </div>
  );
}
