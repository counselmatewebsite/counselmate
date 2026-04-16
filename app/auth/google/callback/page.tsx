'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/auth-context';
import { authAPI, apiClient } from '@/lib/api';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';

export default function GoogleCallbackPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setUser }  = useAuth();

  const [phase, setPhase] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code       = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam || !code) {
        setErrorMsg(errorParam === 'access_denied'
          ? 'You declined Google sign-in. Please try again.'
          : 'No authorisation code received. Please try again.');
        setPhase('error');
        setTimeout(() => router.push('/auth/login'), 3500);
        return;
      }

      try {
        const pendingRole = typeof window !== 'undefined'
          ? sessionStorage.getItem('pendingRole')
          : null;

        const response = await authAPI.googleCallback({
          code,
          desired_role: pendingRole === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'APPRENTICE',
        });

        if (!response.access_token || !response.user || !response.refresh_token) {
          throw new Error('Incomplete response from authentication server.');
        }

        apiClient.setToken(response.access_token);

        if (typeof window !== 'undefined') {
          localStorage.setItem('refresh_token', response.refresh_token);
          sessionStorage.removeItem('pendingRole');
          sessionStorage.removeItem('pendingProfessionType');
        }

        setUser(response.user);
        setPhase('success');
        toast.success('Signed in successfully.');

        setTimeout(() => {
          if (pendingRole === 'PROFESSIONAL') {
            router.push('/profile/professional/create');
          } else {
            router.push('/dashboard');
          }
        }, 1200);

      } catch (err) {
        console.error('OAuth callback error:', err);
        setErrorMsg(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
        setPhase('error');
        setTimeout(() => router.push('/auth/login'), 3500);
      }
    };

    handleCallback();
  }, [searchParams, router, setUser]);

  return (
    <>
      <style>{css}</style>
      <div className="gcb-root">

        {/* Left panel — decorative */}
        <div className="gcb-left">
          <img
            src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=1200&q=80&fit=crop"
            alt=""
            className="gcb-bg-img"
            aria-hidden
          />
          <div className="gcb-left-overlay" />
          <div className="gcb-left-content">
            <div className="gcb-left-logo">CounselMate</div>
            <blockquote className="gcb-left-quote">
              "Access to justice should not depend on who you know."
            </blockquote>
            <div className="gcb-left-attr">India's Verified Legal &amp; Financial Directory</div>
          </div>
        </div>

        {/* Right panel — status */}
        <div className="gcb-right">
          <div className="gcb-card">

            {/* Loading */}
            {phase === 'loading' && (
              <>
                <div className="gcb-spinner-wrap">
                  <div className="gcb-ring">
                    <div className="gcb-ring-track" />
                    <div className="gcb-ring-head" />
                  </div>
                  <div className="gcb-google-icon" aria-hidden>
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                </div>
                <h1 className="gcb-title">Completing sign-in</h1>
                <p className="gcb-desc">Verifying your Google account and preparing your session. This takes just a moment.</p>
                <div className="gcb-steps">
                  <Step label="Verifying Google identity"    done />
                  <Step label="Checking credentials"         active />
                  <Step label="Preparing your workspace"     />
                </div>
              </>
            )}

            {/* Success */}
            {phase === 'success' && (
              <>
                <div className="gcb-icon-wrap success">
                  <CheckCircle2 size={32} />
                </div>
                <h1 className="gcb-title">Signed in</h1>
                <p className="gcb-desc">Your Google account has been verified. Redirecting you now…</p>
                <div className="gcb-redirect-bar">
                  <div className="gcb-redirect-fill" />
                </div>
              </>
            )}

            {/* Error */}
            {phase === 'error' && (
              <>
                <div className="gcb-icon-wrap error">
                  <XCircle size={32} />
                </div>
                <h1 className="gcb-title">Sign-in failed</h1>
                <p className="gcb-desc">{errorMsg}</p>
                <p className="gcb-redirect-note">Returning to login in a moment…</p>
                <button
                  className="gcb-manual-btn"
                  onClick={() => router.push('/auth/login')}
                >
                  Return to Login <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>

          <div className="gcb-footer">
            <span>© 2025 CounselMate</span>
            <span className="gcb-footer-sep">·</span>
            <span>Secure authentication via Google OAuth 2.0</span>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Step indicator ──────────────────────────────── */
function Step({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className={`gcb-step${done ? ' done' : active ? ' active' : ''}`}>
      <div className="gcb-step-dot">
        {done && (
          <svg viewBox="0 0 10 10" width="10" height="10">
            <polyline points="2,5 4,7.5 8,2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {active && <div className="gcb-step-pulse" />}
      </div>
      <span>{label}</span>
    </div>
  )
}

/* ─── Styles ─────────────────────────────────────── */

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap');

  :root {
    --ink: #0d0f1a;
    --ink-muted: #7b7d94;
    --cream: #f7f5f0;
    --cream-dark: #e8e4dc;
    --gold: #c9a84c;
    --gold-light: #e8c97a;
    --night: #0e0d0b;
    --surface: #ffffff;
    --red-err: #b91c1c;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .gcb-root {
    display: flex;
    min-height: 100vh;
    font-family: 'DM Sans', sans-serif;
    background: var(--night);
  }

  /* ════════ LEFT PANEL ════════ */
  .gcb-left {
    flex: 1;
    position: relative;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .gcb-bg-img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    filter: grayscale(30%) brightness(0.45);
  }
  .gcb-left-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(
      to top,
      rgba(10,9,8,0.92) 0%,
      rgba(10,9,8,0.4) 50%,
      rgba(10,9,8,0.15) 100%
    );
  }
  .gcb-left-content {
    position: relative; z-index: 2;
    padding: 3rem 3.5rem;
    display: flex; flex-direction: column; gap: 1rem;
  }
  .gcb-left-logo {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 1.5rem; font-weight: 700;
    color: #fff; letter-spacing: 0.04em;
    margin-bottom: 0.5rem;
  }
  .gcb-left-quote {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: clamp(1.2rem, 2vw, 1.8rem);
    font-style: italic;
    color: var(--gold-light);
    line-height: 1.4;
    max-width: 420px;
  }
  .gcb-left-attr {
    font-family: 'DM Mono', monospace;
    font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,0.3);
  }

  /* ════════ RIGHT PANEL ════════ */
  .gcb-right {
    width: 480px;
    flex-shrink: 0;
    background: var(--cream);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2.5rem;
    gap: 2rem;
    position: relative;
  }

  /* ════════ CARD ════════ */
  .gcb-card {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--cream-dark);
    border-radius: 20px;
    padding: 2.75rem 2.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    text-align: center;
  }

  /* ── Spinner ── */
  .gcb-spinner-wrap {
    position: relative;
    width: 72px; height: 72px;
    margin-bottom: 0.5rem;
  }
  .gcb-ring {
    width: 72px; height: 72px;
    border-radius: 50%;
    position: absolute; inset: 0;
  }
  .gcb-ring-track {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 3px solid var(--cream-dark);
  }
  .gcb-ring-head {
    position: absolute; inset: 0;
    border-radius: 50%;
    border: 3px solid transparent;
    border-top-color: var(--ink);
    animation: spin 0.9s linear infinite;
  }
  .gcb-google-icon {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    display: flex; align-items: center; justify-content: center;
  }

  /* ── Icon states ── */
  .gcb-icon-wrap {
    width: 64px; height: 64px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 0.25rem;
    animation: popIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .gcb-icon-wrap.success { background: #f0fdf4; color: #16a34a; border: 2px solid #86efac; }
  .gcb-icon-wrap.error   { background: #fef2f2; color: var(--red-err); border: 2px solid #fca5a5; }

  /* ── Text ── */
  .gcb-title {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 1.5rem; font-weight: 700; color: var(--ink);
    line-height: 1.2;
  }
  .gcb-desc {
    font-size: 0.875rem; color: var(--ink-muted);
    line-height: 1.65; font-weight: 300;
    max-width: 300px;
  }

  /* ── Steps ── */
  .gcb-steps {
    display: flex; flex-direction: column; gap: 0.6rem;
    width: 100%; margin-top: 0.5rem;
    padding: 1.25rem 1rem;
    background: var(--cream);
    border-radius: 12px;
    border: 1px solid var(--cream-dark);
    text-align: left;
  }
  .gcb-step {
    display: flex; align-items: center; gap: 0.65rem;
    font-size: 0.8rem; color: var(--ink-muted); font-weight: 300;
    transition: color 0.2s;
  }
  .gcb-step.done   { color: #16a34a; }
  .gcb-step.active { color: var(--ink); font-weight: 500; }

  .gcb-step-dot {
    width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
    border: 1.5px solid var(--cream-dark);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: border-color 0.2s, background 0.2s;
  }
  .gcb-step.done .gcb-step-dot {
    background: #f0fdf4; border-color: #86efac; color: #16a34a;
  }
  .gcb-step.active .gcb-step-dot {
    border-color: var(--ink);
  }

  .gcb-step-pulse {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--ink);
    animation: pulse 1.4s ease-in-out infinite;
  }

  /* ── Redirect bar ── */
  .gcb-redirect-bar {
    width: 100%; height: 3px; border-radius: 100px;
    background: var(--cream-dark); overflow: hidden;
    margin-top: 0.5rem;
  }
  .gcb-redirect-fill {
    height: 100%;
    background: #16a34a;
    animation: fillBar 1.2s ease forwards;
  }

  /* ── Error extras ── */
  .gcb-redirect-note {
    font-family: 'DM Mono', monospace;
    font-size: 0.68rem; color: var(--ink-muted);
    letter-spacing: 0.06em;
  }
  .gcb-manual-btn {
    display: inline-flex; align-items: center; gap: 0.45rem;
    background: var(--ink); color: #fff;
    border: none; border-radius: 10px;
    padding: 0.7rem 1.4rem; font-size: 0.875rem; font-weight: 500;
    font-family: 'DM Sans', sans-serif; cursor: pointer;
    margin-top: 0.25rem;
    transition: background 0.2s, transform 0.15s;
  }
  .gcb-manual-btn:hover {
    background: #1a2b6d; transform: translateY(-1px);
  }

  /* ── Footer ── */
  .gcb-footer {
    display: flex; align-items: center; gap: 0.6rem;
    font-family: 'DM Mono', monospace;
    font-size: 0.6rem; color: var(--ink-muted);
    letter-spacing: 0.06em;
  }
  .gcb-footer-sep { opacity: 0.4; }

  /* ════════ ANIMATIONS ════════ */
  @keyframes spin    { to { transform: rotate(360deg); } }
  @keyframes pulse   { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1); } }
  @keyframes fillBar { from { width: 0; } to { width: 100%; } }
  @keyframes popIn   { from { opacity:0; transform:scale(0.6); } to { opacity:1; transform:scale(1); } }

  /* ════════ RESPONSIVE ════════ */
  @media (max-width: 768px) {
    .gcb-root { flex-direction: column; }
    .gcb-left {
      min-height: 220px;
      flex: none;
      align-items: flex-start;
    }
    .gcb-left-content { padding: 2rem; }
    .gcb-left-quote { font-size: 1.1rem; }
    .gcb-right {
      width: 100%; flex: 1;
      padding: 2rem 1.25rem;
    }
  }
`