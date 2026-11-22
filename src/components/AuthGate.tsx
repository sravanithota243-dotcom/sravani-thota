import { ArrowRight, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import React, { useState } from 'react';
import type { UserProfile } from '../types';
import { api } from '../utils/api';

interface AuthGateProps {
  onAuthenticated: (user: UserProfile) => void;
}

export function AuthGate({ onAuthenticated }: AuthGateProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, fullName);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoAccess = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await api.loginDemo();
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar Contract: 3 zones */}
      <header className="bg-white border-b border-slate-200 px-6 lg:px-10 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <a href="/" className="text-xl font-bold tracking-tight text-indigo-700 hover:text-indigo-800 transition-colors whitespace-nowrap shrink-0">
            SkinSense
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#capabilities" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Screening
            </a>
            <a href="#quality" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Quality Check
            </a>
            <a href="#longitudinal" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Longitudinal Links
            </a>
            <a href="#voice" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Voice Assistant
            </a>
          </nav>
          <button
            type="button"
            onClick={handleDemoAccess}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            Try Clinical Demo
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-10 lg:py-14">
        <div className="grid lg:grid-cols-12 gap-10 items-stretch">
          {/* Left: Clinical Overview & Hero Visual */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="text-xs font-medium text-teal-700 tracking-wide">
                Dermatological Screening · Longitudinal Tracking · Multilingual Voice
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 tracking-tight leading-[1.12] [text-wrap:balance]">
                Smart Skin Detection Voice-Enabled Assistance.
              </h1>
              <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
                Capture via camera or upload skin photographs, run automated sharpness and lighting preprocessing,
                inspect calibrated confidence scores and problem checking alerts, compare progression against prior
                scans, export clinical PDF reports, and converse with a voice assistant in 10 languages.
              </p>
            </div>

            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white min-h-[280px] flex-1">
              {!heroImgFailed ? (
                <img
                  src="/src/assets/images/clinical_hero_dermatoscope_1795185794549.jpg"
                  alt="SkinSense digital dermatoscope clinical workstation"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover min-h-[280px] max-h-[380px]"
                />
              ) : (
                <div className="w-full h-full min-h-[280px] bg-slate-100 flex items-center justify-center p-8 text-slate-500 text-sm">
                  SkinSense Clinical Dermoscopy Workstation
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/45 to-transparent p-6 text-white">
                <div className="text-xs font-mono text-teal-300">
                  Encrypted Patient Workspace · Tokenized Longitudinal URLs
                </div>
                <p className="text-sm text-slate-100 mt-1">
                  All skin records, quality metrics, and comparison timelines are isolated to your authenticated
                  session.
                </p>
              </div>
            </div>
          </div>

          {/* Right: Authentication Card */}
          <div className="lg:col-span-5 flex flex-col">
            <div className="bg-white border border-slate-200 rounded-xl p-7 sm:p-8 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      {mode === 'login' ? 'Sign in to SkinSense' : 'Create Clinical Account'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Protected with salted scrypt hashing and session isolation
                    </p>
                  </div>
                  <Lock className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
                </div>

                {/* Segmented Control */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                    }}
                    className={`py-2 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      mode === 'login'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className={`py-2 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      mode === 'register'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  {mode === 'register' && (
                    <div>
                      <label htmlFor="auth-fullname" className="block text-sm font-medium text-slate-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        id="auth-fullname"
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Dr. Sarah Chen"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="clinician@example.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                      Password
                    </label>
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                    />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <span>{isSubmitting ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </form>

                <div className="mt-6 pt-6 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={handleDemoAccess}
                    disabled={isSubmitting}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <UserCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    <span>Instant Access: Demo Clinical Workspace</span>
                  </button>
                  <p className="text-xs text-slate-500 mt-2.5 text-center">
                    Includes seeded baseline &amp; follow-up forearm scans ready for comparison and PDF export.
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                <span>AI screening decision-support only. Always consult a licensed dermatologist.</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4-column Feature Strip below Hero Split */}
        <section id="capabilities" className="mt-12 pt-10 border-t border-slate-200 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div id="quality">
            <div className="text-xs font-mono text-slate-400">01</div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">Image Quality Preprocessing</h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Laplacian focus scoring, exposure calibration, glare compression, and ROI framing before AI inference.
            </p>
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400">02</div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">Confidence &amp; Problem Check</h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Calibrated confidence percentages paired with explicit problem checking triage alerts and red-flag notes.
            </p>
          </div>
          <div id="longitudinal">
            <div className="text-xs font-mono text-slate-400">03</div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">Longitudinal Comparison &amp; URL</h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Interactive split-slider against prior images plus shareable longitudinal case links and PDF reports.
            </p>
          </div>
          <div id="voice">
            <div className="text-xs font-mono text-slate-400">04</div>
            <h3 className="text-base font-semibold text-slate-900 mt-1">Multilingual Voice Assistant</h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              Speak or listen in 10 languages including English, Hindi, Spanish, French, Arabic, Chinese, Telugu, and Tamil.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
