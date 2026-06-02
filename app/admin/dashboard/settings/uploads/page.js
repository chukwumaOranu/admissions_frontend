'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePermissions } from '@/hooks/usePermissions';
import { API_ENDPOINTS, apiService } from '@/services/api';
import s from '@/styles/admin-portal.module.css';

const isImg  = (t) => t?.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(t?.toLowerCase());
const fmtSz  = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(1)} KB`;
const fmtD   = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function FileUploadsSettingsPage() {
  const { data: session, status } = useSession();
  const { hasPermission, loading: permLoading } = usePermissions();

  const [uploadingLogo, setUploadingLogo]       = useState(false);
  const [logoPreview, setLogoPreview]           = useState(null);
  const [selectedLogoFile, setSelectedLogoFile] = useState(null);
  const [fileUploads, setFileUploads]           = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [error, setError]                       = useState('');
  const [notice, setNotice]                     = useState('');
  const [uploadSettings, setUploadSettings]     = useState({
    max_file_size: 10485760,
    allowed_extensions: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx'],
    upload_path: '/uploads',
    auto_rename: true,
    create_thumbnails: true,
    thumbnail_size: 300,
  });

  const logoInputRef = useRef(null);
  const loadedRef    = useRef(false);

  const fetchFileUploads = async () => {
    try {
      setLoading(true); setError('');
      const res  = await apiService.get(API_ENDPOINTS.SETTINGS.UPLOADS.GET_ALL);
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setFileUploads(data);
    } catch { setError('Failed to load file uploads'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadedRef.current = false; }, [session?.user?.id]);
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id && !loadedRef.current) {
      loadedRef.current = true; fetchFileUploads();
    }
  }, [status, session?.user?.id]);

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true); setError(''); setNotice('');
      await apiService.put(API_ENDPOINTS.SETTINGS.UPLOADS.UPDATE_SETTINGS, uploadSettings);
      setNotice('Upload settings updated successfully!');
    } catch { setError('Failed to update upload settings'); }
    finally { setSaving(false); }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUploadSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? Number(value) : value),
    }));
  };

  const handleLogoFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.type)) { setError('Please select a valid image file (JPEG, PNG, GIF, or WebP)'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Logo file size must be less than 2 MB'); return; }
    setError('');
    setSelectedLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = async () => {
    if (!selectedLogoFile) { setError('Please select a logo file first'); return; }
    try {
      setUploadingLogo(true); setError(''); setNotice('');
      const formData = new FormData();
      formData.append('file', selectedLogoFile);
      formData.append('file_category', 'school_logo');
      formData.append('description', 'School logo upload');
      const res = await apiService.post('/settings/upload/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data?.fileUpload) {
        const current = await apiService.get('/settings/school');
        await apiService.put('/settings/school', { ...current.data, school_logo: res.data.fileUpload.file_path });
        setNotice('School logo uploaded and saved successfully!');
        setSelectedLogoFile(null); setLogoPreview(null);
        if (logoInputRef.current) logoInputRef.current.value = '';
        fetchFileUploads();
      } else {
        setError(res.data?.message || 'Upload failed');
      }
    } catch { setError('Failed to upload logo. Please try again.'); }
    finally { setUploadingLogo(false); }
  };

  const handleDownloadFile = async (file) => {
    try {
      const res  = await apiService.get(`/settings/files/${file.id}/download`, { responseType: 'blob' });
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const a    = document.createElement('a');
      a.href = url; a.download = file.original_name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setNotice(`"${file.original_name}" downloaded.`);
    } catch (err) {
      const st = err.response?.status;
      setError(st === 401 ? 'Authentication required' : st === 403 ? 'No permission to download' : st === 404 ? 'File not found' : err.response?.data?.message || 'Failed to download file');
    }
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete "${file.original_name}"? This cannot be undone.`)) return;
    try {
      await apiService.delete(`/settings/files/${file.id}`);
      setNotice(`"${file.original_name}" deleted.`);
      fetchFileUploads();
    } catch (err) {
      const st = err.response?.status;
      setError(st === 401 ? 'Authentication required' : st === 403 ? 'No permission to delete' : st === 404 ? 'File not found' : err.response?.data?.message || 'Failed to delete file');
    }
  };

  if (status === 'loading' || permLoading) {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status" /></div>;
  }

  if (!hasPermission('settings.read')) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-lock" />You don&apos;t have permission to view upload settings.</div>
      </div>
    );
  }

  const images = fileUploads.filter(f => isImg(f.file_type));
  const docs   = fileUploads.filter(f => !isImg(f.file_type));

  return (
    <div style={{ background: '#f0f4f8', minHeight: '100vh', padding: '1.5rem' }}>

      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#eff6ff', color: '#2563eb' }}><i className="fas fa-cloud-upload-alt" /></span>
            File Upload Settings
          </h1>
          <p className={s.pageSub}>Manage file upload configurations and restrictions</p>
        </div>
        <div className={s.pageActions}>
          <Link href="/admin/dashboard/settings" className={`${s.btn} ${s.btnOutline}`}>
            <i className="fas fa-arrow-left" />Settings
          </Link>
        </div>
      </div>

      {error  && <div className={`${s.alert} ${s.alertDanger}`}><i className="fas fa-exclamation-triangle" />{error}<button onClick={() => setError('')}  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><i className="fas fa-times" /></button></div>}
      {notice && <div className={`${s.alert} ${s.alertSuccess}`}><i className="fas fa-check-circle" />{notice}<button onClick={() => setNotice('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#059669' }}><i className="fas fa-times" /></button></div>}

      {/* Stats */}
      <div className={s.statsGrid} style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Files', value: fileUploads.length, icon: 'fas fa-file',     color: '#2563eb' },
          { label: 'Images',      value: images.length,      icon: 'fas fa-image',    color: '#059669' },
          { label: 'Documents',   value: docs.length,        icon: 'fas fa-file-alt', color: '#0891b2' },
          { label: 'Max Size',    value: `${(uploadSettings.max_file_size / 1048576).toFixed(0)} MB`, icon: 'fas fa-weight', color: '#d97706', isText: true },
        ].map(st => (
          <div key={st.label} className={s.statCard} style={{ '--accent': st.color, cursor: 'default' }}>
            <div className={s.statInfo}>
              <div className={s.statLabel}>{st.label}</div>
              <div className={s.statNumber} style={{ color: st.color, fontSize: st.isText ? '1.1rem' : undefined }}>{st.value}</div>
            </div>
            <div className={s.statIcon} style={{ background: `${st.color}18`, color: st.color }}><i className={st.icon} /></div>
          </div>
        ))}
      </div>

      {/* Logo Upload */}
      <div className={s.card} style={{ marginBottom: '1.25rem' }}>
        <div className={s.cardHeader}>
          <span className={s.cardTitle}>
            <span style={{ width: 28, height: 28, borderRadius: 6, background: '#d1fae5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <i className="fas fa-image" style={{ fontSize: '0.75rem' }} />
            </span>
            School Logo Upload
          </span>
        </div>
        <div className={s.cardBody} style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px' }}>
              <label className={s.formLabel}>Select Logo File</label>
              <input
                ref={logoInputRef}
                type="file"
                className={s.formInput}
                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                onChange={handleLogoFileSelect}
                style={{ padding: '0.4rem 0.75rem' }}
              />
              <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: '0.25rem 0 1rem' }}>
                Supported: JPEG, PNG, GIF, WebP — max 2 MB
              </p>
              <button
                type="button"
                onClick={handleLogoUpload}
                className={`${s.btn} ${s.btnGreen}`}
                disabled={!selectedLogoFile || uploadingLogo || !hasPermission('settings.update')}
              >
                {uploadingLogo
                  ? <><span className="spinner-border spinner-border-sm" />Uploading…</>
                  : <><i className="fas fa-upload" />Upload Logo</>}
              </button>
            </div>
            {logoPreview && (
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 600 }}>Preview</div>
                <Image
                  src={logoPreview}
                  alt="Logo Preview"
                  width={200}
                  height={150}
                  unoptimized
                  style={{ maxHeight: 150, maxWidth: 200, border: '1px solid #e5e7eb', borderRadius: 8, objectFit: 'contain' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings + Guidelines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>

        {/* Upload Configuration */}
        <div className={s.card} style={{ marginBottom: 0 }}>
          <div className={s.cardHeader}>
            <span className={s.cardTitle}>
              <span style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                <i className="fas fa-cog" style={{ fontSize: '0.75rem' }} />
              </span>
              Upload Configuration
            </span>
          </div>
          <div className={s.cardBody} style={{ padding: '1.25rem' }}>
            <form onSubmit={handleUpdateSettings}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label className={s.formLabel}>Max File Size (bytes)</label>
                  <input type="number" className={s.formInput} name="max_file_size" value={uploadSettings.max_file_size} onChange={handleInputChange} min="1024" max="104857600" />
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>= {(uploadSettings.max_file_size / 1048576).toFixed(1)} MB</p>
                </div>
                <div>
                  <label className={s.formLabel}>Upload Path</label>
                  <input type="text" className={s.formInput} name="upload_path" value={uploadSettings.upload_path} onChange={handleInputChange} placeholder="/uploads" />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className={s.formLabel}>Allowed Extensions</label>
                <input
                  type="text"
                  className={s.formInput}
                  value={uploadSettings.allowed_extensions.join(', ')}
                  onChange={(e) => setUploadSettings(prev => ({ ...prev, allowed_extensions: e.target.value.split(',').map(x => x.trim()) }))}
                  placeholder="jpg, jpeg, png, pdf, doc, docx"
                />
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0.2rem 0 0' }}>Comma-separated</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" name="auto_rename" checked={uploadSettings.auto_rename} onChange={handleInputChange} style={{ width: 15, height: 15, accentColor: '#2563eb' }} />
                  Auto Rename Files
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" name="create_thumbnails" checked={uploadSettings.create_thumbnails} onChange={handleInputChange} style={{ width: 15, height: 15, accentColor: '#2563eb' }} />
                  Create Thumbnails
                </label>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label className={s.formLabel}>Thumbnail Size (px)</label>
                <input type="number" className={s.formInput} name="thumbnail_size" value={uploadSettings.thumbnail_size} onChange={handleInputChange} min="100" max="1000" style={{ maxWidth: 160 }} />
              </div>

              <button type="submit" className={`${s.btn} ${s.btnPrimary}`} disabled={saving || !hasPermission('settings.update')}>
                {saving ? <><span className="spinner-border spinner-border-sm" />Saving…</> : <><i className="fas fa-save" />Save Settings</>}
              </button>
            </form>
          </div>
        </div>

        {/* Guidelines sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={s.card} style={{ marginBottom: 0 }}>
            <div className={s.cardHeader}>
              <span className={s.cardTitle}>
                <span style={{ width: 28, height: 28, borderRadius: 6, background: '#e0f2fe', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0891b2' }}>
                  <i className="fas fa-lightbulb" style={{ fontSize: '0.75rem' }} />
                </span>
                Upload Guidelines
              </span>
            </div>
            <div className={s.cardBody} style={{ padding: '1rem 1.25rem' }}>
              <div className={`${s.alert} ${s.alertInfo}`} style={{ marginBottom: '0.75rem' }}>
                <i className="fas fa-info-circle" />
                <span style={{ fontSize: '0.82rem' }}>Set reasonable file size limits to balance usability and storage capacity.</span>
              </div>
              <ul style={{ fontSize: '0.82rem', color: '#374151', paddingLeft: '1.1rem', lineHeight: 1.9, margin: 0 }}>
                <li>Only allow necessary file types</li>
                <li>Enable auto-rename for security</li>
                <li>Use descriptive upload paths</li>
                <li>Enable thumbnails for image previews</li>
              </ul>
            </div>
          </div>

          <div className={s.card} style={{ marginBottom: 0 }}>
            <div className={s.cardBody} style={{ padding: '1rem 1.25rem' }}>
              <div className={`${s.alert} ${s.alertDanger}`} style={{ marginBottom: 0, alignItems: 'flex-start' }}>
                <i className="fas fa-shield-alt" style={{ marginTop: '0.1rem' }} />
                <div>
                  <strong style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.3rem' }}>Security Warning</strong>
                  <span style={{ fontSize: '0.78rem', lineHeight: 1.5 }}>Restrict file types and sizes to prevent malicious uploads. Never allow executable file types.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* File Uploads List */}
      <div className={s.card} style={{ marginBottom: 0 }}>
        <div className={s.cardHeader} style={{ justifyContent: 'space-between' }}>
          <span className={s.cardTitle}><i className="fas fa-history" style={{ color: '#0891b2' }} />Recent File Uploads</span>
          <button onClick={fetchFileUploads} className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} disabled={loading}>
            <i className="fas fa-sync" />Refresh
          </button>
        </div>

        {loading ? (
          <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status" /></div>
        ) : fileUploads.length === 0 ? (
          <div className={s.emptyState}>
            <div className={s.emptyIcon} style={{ background: '#eff6ff', color: '#2563eb' }}><i className="fas fa-cloud-upload-alt" /></div>
            <div className={s.emptyTitle}>No Files Uploaded</div>
            <p className={s.emptySub}>Files uploaded to the system will appear here.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>File Name</th>
                    <th>Size</th>
                    <th>Type</th>
                    <th>Uploaded By</th>
                    <th>Date</th>
                    <th style={{ paddingRight: '1.25rem' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fileUploads.map(file => (
                    <tr key={file.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: 28, height: 28, borderRadius: 6, background: isImg(file.file_type) ? '#d1fae5' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isImg(file.file_type) ? '#059669' : '#2563eb', flexShrink: 0 }}>
                            <i className={`fas fa-${isImg(file.file_type) ? 'image' : 'file-alt'}`} style={{ fontSize: '0.7rem' }} />
                          </span>
                          <span className={s.tdName}>{file.original_name}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize: '0.82rem', color: '#374151' }}>{fmtSz(file.file_size)}</span></td>
                      <td><span className={`${s.badge} ${s.badgeInfo}`}>{file.file_type}</span></td>
                      <td><span style={{ fontSize: '0.82rem', color: '#374151' }}>{file.uploaded_by_name || file.uploaded_by || 'Unknown'}</span></td>
                      <td><span style={{ fontSize: '0.82rem', color: '#374151' }}>{fmtD(file.created_at)}</span></td>
                      <td className={s.actionsCell} style={{ paddingRight: '1.25rem' }}>
                        <div className={s.actionBtns}>
                          <button onClick={() => handleDownloadFile(file)} className={s.btnIcon} title="Download" disabled={!hasPermission('settings.read')}>
                            <i className="fas fa-download" />
                          </button>
                          {hasPermission('settings.delete') && (
                            <button onClick={() => handleDeleteFile(file)} className={`${s.btnIcon} ${s.btnIconDanger}`} title="Delete">
                              <i className="fas fa-trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className={s.mobileList}>
              {fileUploads.map(file => (
                <div key={file.id} className={s.mobileCard}>
                  <div className={s.mobileCardHead}>
                    <span className={s.tdName}>{file.original_name}</span>
                    <span className={`${s.badge} ${s.badgeInfo}`}>{file.file_type}</span>
                  </div>
                  <div className={s.mobileCardBody}>
                    <div className={s.mobileCardRow}><span className={s.mobileCardKey}>Size</span><span className={s.mobileCardVal}>{fmtSz(file.file_size)}</span></div>
                    <div className={s.mobileCardRow}><span className={s.mobileCardKey}>Uploaded By</span><span className={s.mobileCardVal}>{file.uploaded_by_name || file.uploaded_by || 'Unknown'}</span></div>
                    <div className={s.mobileCardRow}><span className={s.mobileCardKey}>Date</span><span className={s.mobileCardVal}>{fmtD(file.created_at)}</span></div>
                  </div>
                  <div className={s.mobileCardFoot}>
                    <button onClick={() => handleDownloadFile(file)} className={`${s.btn} ${s.btnOutline} ${s.btnSm}`} disabled={!hasPermission('settings.read')}><i className="fas fa-download" />Download</button>
                    {hasPermission('settings.delete') && (
                      <button onClick={() => handleDeleteFile(file)} className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}><i className="fas fa-trash" />Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {fileUploads.length > 0 && (
          <div className={s.cardFooter}>
            <span><strong>{fileUploads.length}</strong> file{fileUploads.length !== 1 ? 's' : ''} total — <strong>{images.length}</strong> image{images.length !== 1 ? 's' : ''}, <strong>{docs.length}</strong> document{docs.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
}
