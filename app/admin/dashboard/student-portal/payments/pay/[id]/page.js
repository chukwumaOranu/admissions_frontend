'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useApplications } from '@/hooks/useRedux';
import { API_ENDPOINTS, apiService } from '@/services/api';
import s from '@/styles/student-portal.module.css';

const VERIFY_ATTEMPTS = 24;
const VERIFY_INTERVAL_MS = 2500;
const getStoredReferenceKey = (applicationId) => `pending-payment-reference:${applicationId}`;

export default function PayApplicationFeePage() {
  const params = useParams();
  const router = useRouter();
  const { status } = useSession();
  const { applications, fetchMyApplications } = useApplications();
  const verifyTimerRef = useRef(null);

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchApplication = useCallback(async () => {
    try {
      setLoading(true);
      const found = applications.find((a) => a.id == params.id);
      if (found) { setApplication(found); return; }
      const res = await apiService.get(API_ENDPOINTS.APPLICATIONS.GET_BY_ID(params.id));
      setApplication(res?.data || res);
    } catch (err) {
      console.error(err);
      setError('Failed to load application details');
    } finally {
      setLoading(false);
    }
  }, [applications, params.id]);

  useEffect(() => {
    if (status === 'authenticated' && params.id) fetchApplication();
  }, [status, params.id, fetchApplication]);

  useEffect(() => () => {
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
  }, []);

  const verifyPayment = useCallback(async (reference, attemptsRemaining = VERIFY_ATTEMPTS) => {
    if (!reference || paymentComplete) return;

    setVerifying(true);
    try {
      const response = await apiService.get(API_ENDPOINTS.PAYMENTS.VERIFY(reference));
      const result = response?.data || response;

      if (result?.payment_status === 'success' || result?.transaction?.payment_status === 'success') {
        if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
        localStorage.removeItem(getStoredReferenceKey(params.id));
        setPaymentComplete(true);
        setApplication((current) => current ? { ...current, payment_status: 'paid', payment_reference: reference } : current);
        setPaying(false);
        setVerifying(false);
        setSuccess('Payment confirmed. Your application has been updated.');
        await fetchMyApplications();
        return;
      }

      if (attemptsRemaining > 1) {
        verifyTimerRef.current = setTimeout(
          () => verifyPayment(reference, attemptsRemaining - 1),
          VERIFY_INTERVAL_MS
        );
        return;
      }

      setSuccess('Payment is still being confirmed. Use “Check payment status” below in a moment.');
    } catch (err) {
      if (attemptsRemaining > 1) {
        verifyTimerRef.current = setTimeout(
          () => verifyPayment(reference, attemptsRemaining - 1),
          VERIFY_INTERVAL_MS
        );
        return;
      }
      setError(err?.message || err?.data?.message || 'We could not confirm the payment yet. Please check again.');
    } finally {
      if (attemptsRemaining <= 1) {
        setVerifying(false);
        setPaying(false);
      }
    }
  }, [fetchMyApplications, params.id, paymentComplete]);

  useEffect(() => {
    if (status !== 'authenticated' || !params.id || paymentComplete) return;
    const storedReference = localStorage.getItem(getStoredReferenceKey(params.id));
    if (storedReference) {
      setPaymentReference(storedReference);
      setSuccess('Checking the status of your previous payment attempt...');
      verifyPayment(storedReference);
    }
  }, [params.id, paymentComplete, status, verifyPayment]);

  const handlePayNow = async () => {
    setPaying(true);
    setError('');
    setSuccess('');
    try {
      if (!checkoutReady || !window.PaystackPop) {
        setError('Secure checkout is still loading. Please try again in a moment.');
        setPaying(false);
        return;
      }
      if (!application?.application_fee || application.application_fee <= 0) {
        setError('Application fee is not available or invalid');
        setPaying(false);
        return;
      }
      const response = await apiService.post(API_ENDPOINTS.PAYMENTS.INITIALIZE, {
        applicant_id: params.id,
      });
      const payment = response?.data || response;

      if (!payment?.access_code || !payment?.reference) {
        setError('Failed to initialize payment. Please try again.');
        setPaying(false);
        return;
      }

      setPaymentReference(payment.reference);
      localStorage.setItem(getStoredReferenceKey(params.id), payment.reference);
      setSuccess('Secure checkout opened. This page will confirm your payment automatically.');
      const popup = new window.PaystackPop();
      popup.resumeTransaction(payment.access_code);
      verifyPayment(payment.reference);
    } catch (err) {
      setError(err?.message || err?.data?.message || 'Failed to initialize payment');
      setPaying(false);
    }
  };

  const handleCheckStatus = () => {
    setError('');
    setSuccess('Checking your payment with Paystack...');
    verifyPayment(paymentReference);
  };

  if (loading) {
    return <div className={s.spinnerWrap}><div className="spinner-border" style={{ color: '#1e3a5f' }} role="status"><span className="visually-hidden">Loading…</span></div></div>;
  }

  if (!application) {
    return (
      <div className={s.wrap}>
        <div className={s.card}>
          <div className={s.emptyState}>
            <div className={s.emptyIcon}><i className="fas fa-exclamation-triangle" style={{ color: '#d97706' }} /></div>
            <h5 className={s.emptyTitle}>Application Not Found</h5>
            <p className={s.emptySub}>We could not load this application&apos;s details.</p>
            <Link href="/admin/dashboard/student-portal/applications" className={s.btnPrimary}><i className="fas fa-arrow-left" />Back to Applications</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <Script
        src="https://js.paystack.co/v2/inline.js"
        strategy="afterInteractive"
        onLoad={() => setCheckoutReady(true)}
        onReady={() => setCheckoutReady(true)}
        onError={() => setError('Secure checkout could not load. Check your connection and refresh the page.')}
      />
      {/* Header */}
      <div className={s.pageHeader}>
        <div>
          <h1 className={s.pageTitle}>
            <span className={s.iconBox} style={{ background: '#f0fdf4', color: '#059669' }}><i className="fas fa-credit-card" /></span>
            Application Payment
          </h1>
          <p className={s.pageSub}>Complete your application fee payment securely</p>
        </div>
        <Link href="/admin/dashboard/student-portal/applications" className={s.btnOutline}><i className="fas fa-arrow-left" />Back</Link>
      </div>

      <div className="row justify-content-center">
        <div className="col-lg-7">
          {/* Alerts */}
          {error && (
            <div className={`${s.alertDanger} mb-4`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span><i className="fas fa-exclamation-triangle me-2" />{error}</span>
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#991b1b', lineHeight: 1 }}>×</button>
            </div>
          )}
          {success && (
            <div className={`${s.alertSuccess} mb-4`}>
              <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}><i className="fas fa-check-circle me-2" />Payment Update</div>
              <div style={{ fontSize: '0.875rem' }}>{success}</div>
            </div>
          )}

          {/* Payment card */}
          <div className={s.card}>
            <div className={s.navyBanner}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}><i className="fas fa-money-bill-wave" /></div>
              <h3 style={{ fontWeight: 700, margin: '0 0 0.3rem' }}>Application Fee Payment</h3>
              <p style={{ margin: 0, opacity: 0.75, fontSize: '0.875rem' }}>Secure payment powered by Paystack</p>
            </div>

            <div style={{ padding: '2rem' }}>
              {/* Application details */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem' }}>Application Details</div>
                {[
                  ['Application ID', application.application_number || `APP${params.id}`],
                  ['Program', application.schema_display_name || application.schema_name],
                  ['Applicant', application.applicant_name],
                  ['Email', application.applicant_email || application.email],
                ].map(([label, value]) => value && (
                  <div key={label} className={s.infoRow}>
                    <span className={s.infoLabel}>{label}</span>
                    <span className={s.infoValue}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Amount */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>Amount to Pay</div>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#059669', lineHeight: 1 }}>
                  ₦{parseFloat(application.application_fee || 0).toLocaleString()}
                </div>
              </div>

              {/* Payment methods */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                  <i className="fas fa-check-circle me-2" style={{ color: '#059669' }} />Accepted Payment Methods
                </div>
                <div className="row g-2">
                  {[
                    { icon: 'fas fa-credit-card', label: 'Debit Card', color: '#2563eb' },
                    { icon: 'fas fa-university',  label: 'Bank Transfer', color: '#059669' },
                    { icon: 'fas fa-mobile-alt',  label: 'USSD', color: '#d97706' },
                  ].map((m) => (
                    <div key={m.label} className="col-4">
                      <div style={{ border: '1px solid #e5eaf2', borderRadius: '10px', padding: '0.75rem', textAlign: 'center', background: '#fafbfc' }}>
                        <i className={m.icon} style={{ color: m.color, fontSize: '1.4rem', display: 'block', marginBottom: '0.3rem' }} />
                        <div style={{ fontSize: '0.75rem', fontWeight: 500, color: '#374151' }}>{m.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security notice */}
              <div className={`${s.alertInfo} mb-4`} style={{ fontSize: '0.8rem' }}>
                <i className="fas fa-shield-alt me-2" />
                Your payment is processed securely by Paystack. We do not store your card details. All transactions are encrypted and PCI DSS compliant.
              </div>

              {/* CTA */}
              <button
                onClick={handlePayNow}
                disabled={paying || verifying || paymentComplete || application.payment_status === 'paid' || !checkoutReady}
                className={s.btnGreen}
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', fontSize: '1rem', borderRadius: '10px' }}
              >
                {paymentComplete || application.payment_status === 'paid'
                  ? <><i className="fas fa-check-circle" />Payment Confirmed</>
                  : paying || verifying
                  ? <><span className="spinner-border spinner-border-sm" />Confirming Payment…</>
                  : !checkoutReady
                  ? <><span className="spinner-border spinner-border-sm" />Loading Secure Checkout…</>
                  : <><i className="fas fa-lock" />Pay ₦{parseFloat(application.application_fee || 0).toLocaleString()} Now</>
                }
              </button>

              {paymentReference && !paymentComplete && (
                <button
                  onClick={handleCheckStatus}
                  disabled={verifying}
                  className={s.btnOutline}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }}
                >
                  <i className="fas fa-sync-alt" />
                  {verifying ? 'Checking Payment…' : 'Check Payment Status'}
                </button>
              )}

              {(paymentComplete || application.payment_status === 'paid') && (
                <button
                  onClick={() => router.push('/admin/dashboard/student-portal/applications?payment_success=true')}
                  className={s.btnPrimary}
                  style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }}
                >
                  <i className="fas fa-arrow-right" />Continue to Applications
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                <i className="fas fa-question-circle me-1" />
                Having trouble? <Link href="/admin/dashboard/student-portal/help" style={{ color: '#2563eb' }}>Contact Support</Link>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className={s.card} style={{ marginTop: '1.25rem' }}>
            <div className={s.cardHeader}><span className={s.cardTitle}><i className="fas fa-info-circle me-2" style={{ color: '#2563eb' }} />Payment Instructions</span></div>
            <div className={s.cardBody}>
              <ol style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.875rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <li>Click the <strong>Pay Now</strong> button above</li>
                <li>Secure Paystack checkout opens over this page</li>
                <li>Choose your payment method (Card, Bank Transfer, or USSD)</li>
                <li>Complete the payment without leaving the portal</li>
                <li>This page verifies the payment and updates your application automatically</li>
                <li>A payment confirmation will be sent to your email</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
