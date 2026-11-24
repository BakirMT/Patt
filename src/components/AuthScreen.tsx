import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type AuthMode = 'login' | 'register' | 'forgot';

function mapAuthError(error: unknown): { message: string; showProviderHelp?: boolean } {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return { message: 'Invalid email address or password. Please check your credentials.' };
    case 'auth/email-already-in-use':
      return { message: 'An account already exists with this email address. Please sign in.' };
    case 'auth/weak-password':
      return { message: 'Password must be at least 6 characters long.' };
    case 'auth/invalid-email':
      return { message: 'Please enter a valid email address.' };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts. Please wait a moment before trying again.' };
    case 'auth/popup-closed-by-user':
      return { message: 'Google sign-in window was closed before completing authentication.' };
    case 'auth/operation-not-allowed':
      return {
        message:
          'Email/Password sign-in is not yet enabled in your Firebase Console. Use "Continue with Google" below, or enable Email/Password under Firebase Console → Authentication → Sign-in method.',
        showProviderHelp: true,
      };
    default:
      return {
        message:
          error instanceof Error ? error.message : 'Authentication failed. Please try again.',
      };
  }
}

export function AuthScreen() {
  const {
    user,
    signInGoogle,
    signInEmail,
    registerEmail,
    resetPassword,
    resendVerification,
    refreshUserVerification,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Email verification gate for newly registered email/password users
  if (user && !user.emailVerified) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0D1424] border border-slate-800 rounded-xl p-7 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Verify Your Email</h1>
              <p className="text-xs text-slate-400">{user.email}</p>
            </div>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            For account security, please open the verification link we sent to your inbox before accessing your private financial ledger.
          </p>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                setErrorMsg(null);
                setInfoMsg(null);
                try {
                  const verified = await refreshUserVerification();
                  if (!verified) {
                    setErrorMsg(
                      'Your email is not verified yet. Click the link in your inbox, then try again.'
                    );
                  }
                } catch (err) {
                  setErrorMsg(mapAuthError(err).message);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-[#D4AF37] text-[#070B14] font-semibold text-sm hover:bg-[#E5C55C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${submitting ? 'animate-spin' : ''}`} />
              I Have Verified — Continue
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                setErrorMsg(null);
                setInfoMsg(null);
                try {
                  await resendVerification();
                  setInfoMsg('Verification email sent. Check your inbox and spam folder.');
                } catch (err) {
                  setErrorMsg(mapAuthError(err).message);
                } finally {
                  setSubmitting(false);
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-700 text-slate-200 font-medium text-sm hover:bg-slate-800/80 transition-colors disabled:opacity-50"
            >
              Resend Verification Email
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Sign out and use another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (mode === 'forgot') {
      setSubmitting(true);
      try {
        await resetPassword(email);
        setInfoMsg(
          'Password reset link sent. Check your inbox to reset your password.'
        );
      } catch (err) {
        setErrorMsg(mapAuthError(err).message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMsg('Please enter your full name.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInEmail(email, password);
      } else {
        await registerEmail(name, email, password);
      }
    } catch (err) {
      setErrorMsg(mapAuthError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setSubmitting(true);
    try {
      await signInGoogle();
    } catch (err) {
      setErrorMsg(mapAuthError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] grid lg:grid-cols-12">
      {/* Left Brand & Architecture Column */}
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 border-r border-slate-800/80 bg-[#0A101E]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
            <BookOpenCheck className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap">
            SMART PATT BOOK
          </span>
        </div>

        <div className="space-y-8 max-w-md">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-100 leading-tight">
              Private Financial Ledger &amp; Balance Control
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Track money given, money received, payables, and settlements with exact decimal precision, manual person codes, printable statements, and PIN-locked privacy.
            </p>
          </div>

          <div className="space-y-4 pt-2 border-t border-slate-800/80">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Strict Account Isolation
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every account has private Cloud Firestore storage protected by Firebase Authentication and owner-only security rules.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <KeyRound className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Separate Receivable &amp; Payable Accounting
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Receivable and payable balances are always calculated independently using integer-cent accuracy.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-[#D4AF37] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  Server-Verified PIN Lock
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Protect your book after login with a salted 4-digit or 6-digit PIN verified on the server with attempt rate limiting.
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          SMART PATT BOOK &middot; Private Financial Management
        </p>
      </div>

      {/* Right Authentication Form Column */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <BookOpenCheck className="w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-100">
              SMART PATT BOOK
            </span>
          </div>

          <div className="bg-[#0D1424] border border-slate-800 rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-xl font-bold text-slate-100">
                {mode === 'login'
                  ? 'Sign in to your ledger'
                  : mode === 'register'
                  ? 'Create your private account'
                  : 'Reset your password'}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {mode === 'login'
                  ? 'Access your personal persons, balances, and reports.'
                  : mode === 'register'
                  ? 'Set up an isolated account for your financial records.'
                  : 'Enter your registered email to receive a password reset link.'}
              </p>
            </div>

            {mode !== 'forgot' && (
              <>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGoogle}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#121C32] border border-slate-700 hover:border-[#D4AF37]/50 text-slate-100 font-medium text-sm transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.3-2 3l3.2 2.5c1.9-1.7 3-4.3 3-7.3 0-.7-.1-1.4-.2-2.1H12z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 22c2.7 0 5-0.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.9-1.8-5.7-4.2L3 16.4C4.7 19.8 8.1 22 12 22z"
                    />
                    <path
                      fill="#4A90E2"
                      d="M6.3 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3 7.6C2.4 8.9 2 10.4 2 12s.4 3.1 1 4.4l3.3-2.5z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3 7.6l3.3 2.5C7.1 7.7 9.4 5.9 12 5.9z"
                    />
                  </svg>
                  Continue with Google
                </button>

                <div className="relative flex items-center">
                  <div className="flex-1 border-t border-slate-800" />
                  <span className="px-3 text-xs text-slate-500">or with email</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>
              </>
            )}

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 leading-relaxed">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{infoMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Muhammed Ali"
                      required
                      maxLength={120}
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setErrorMsg(null);
                          setInfoMsg(null);
                        }}
                        className="text-xs text-[#D4AF37] hover:text-[#E5C55C] transition-colors"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      required
                      minLength={6}
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
                      className="w-full pl-9 pr-10 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#070B14] border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-lg bg-[#D4AF37] text-[#070B14] font-semibold text-sm hover:bg-[#E5C55C] transition-colors disabled:opacity-50"
              >
                {submitting
                  ? 'Please wait...'
                  : mode === 'login'
                  ? 'Sign In'
                  : mode === 'register'
                  ? 'Create Account'
                  : 'Send Reset Link'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800/80 text-center text-xs text-slate-400">
              {mode === 'login' ? (
                <span>
                  New to SMART PATT BOOK?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="text-[#D4AF37] font-medium hover:text-[#E5C55C]"
                  >
                    Create an account
                  </button>
                </span>
              ) : (
                <span>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="text-[#D4AF37] font-medium hover:text-[#E5C55C]"
                  >
                    Back to sign in
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
