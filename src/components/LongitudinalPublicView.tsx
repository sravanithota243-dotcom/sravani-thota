import { ArrowLeft, FileDown, Loader2, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PublicCasePayload } from '../types';
import { api } from '../utils/api';
import { generateComparisonPdfReport, generateScanPdfReport } from '../utils/pdfReport';

interface LongitudinalPublicViewProps {
  shareToken: string;
  onExitPublicView: () => void;
}

export function LongitudinalPublicView({ shareToken, onExitPublicView }: LongitudinalPublicViewProps) {
  const [payload, setPayload] = useState<PublicCasePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .getPublicCase(shareToken)
      .then((data) => {
        if (active) setPayload(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load longitudinal link.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [shareToken]);

  const currentUrl = `${window.location.origin}/?case=${encodeURIComponent(shareToken)}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 lg:px-10 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <a href="/" className="text-xl font-bold tracking-tight text-indigo-700 hover:text-indigo-800 transition-colors whitespace-nowrap shrink-0">
            SkinSense
          </a>
          <div className="hidden sm:block text-xs font-mono text-slate-500 truncate">
            Longitudinal Clinical Timeline · Token {shareToken}
          </div>
          <button
            type="button"
            onClick={onExitPublicView}
            className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to SkinSense</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex items-center justify-center gap-3 text-sm text-slate-600">
            <Loader2 className="w-5 h-5 animate-spin text-teal-700" aria-hidden="true" />
            <span>Loading longitudinal case timeline...</span>
          </div>
        ) : error || !payload ? (
          <div className="bg-white border border-rose-200 rounded-xl p-10 text-center max-w-lg mx-auto">
            <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto mb-3" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">Longitudinal Link Unavailable</h2>
            <p className="text-sm text-slate-600 mt-1.5">{error || 'This link could not be resolved.'}</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Case Summary */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="text-xs font-mono text-teal-700">
                  Longitudinal Case Record · {payload.caseInfo.bodyLocation}
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">{payload.caseInfo.title}</h1>
                <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                  {payload.scans.length} Chronological Scan{payload.scans.length === 1 ? '' : 's'} · Updated{' '}
                  {new Date(payload.caseInfo.updatedAt).toLocaleString()}
                </p>
              </div>

              {payload.scans.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const latestScan = payload.scans[payload.scans.length - 1];
                    const latestCmp = payload.comparisons[0];
                    if (latestCmp && payload.scans.length >= 2) {
                      const prev =
                        payload.scans.find((s) => s.id === latestCmp.previousScanId) || payload.scans[0];
                      const curr =
                        payload.scans.find((s) => s.id === latestCmp.currentScanId) || latestScan;
                      void generateComparisonPdfReport(latestCmp, prev, curr, currentUrl);
                    } else {
                      void generateScanPdfReport(latestScan, currentUrl);
                    }
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileDown className="w-4 h-4" aria-hidden="true" />
                  <span>Download Longitudinal PDF</span>
                </button>
              )}
            </div>

            {/* Confidence & Quality Trend SVG Chart (if >= 2 scans) */}
            {payload.scans.length >= 2 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="text-sm font-bold text-slate-900">Confidence &amp; Image Quality Trajectory</h2>
                <div className="w-full overflow-x-auto">
                  <svg viewBox="0 0 600 140" className="w-full max-w-2xl h-36">
                    <line x1="40" y1="20" x2="560" y2="20" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="40" y1="65" x2="560" y2="65" stroke="#E2E8F0" strokeDasharray="3 3" />
                    <line x1="40" y1="110" x2="560" y2="110" stroke="#CBD5E1" />
                    <text x="8" y="24" fontSize="10" fill="#64748B" fontFamily="monospace">
                      100%
                    </text>
                    <text x="14" y="69" fontSize="10" fill="#64748B" fontFamily="monospace">
                      50%
                    </text>
                    <text x="20" y="114" fontSize="10" fill="#64748B" fontFamily="monospace">
                      0%
                    </text>
                    <polyline
                      fill="none"
                      stroke="#0D9488"
                      strokeWidth="2.5"
                      points={payload.scans
                        .map((s, idx) => {
                          const x =
                            40 + (idx * 520) / Math.max(1, payload.scans.length - 1);
                          const y = 110 - (s.analysis.confidenceScore / 100) * 90;
                          return `${x},${y}`;
                        })
                        .join(' ')}
                    />
                    {payload.scans.map((s, idx) => {
                      const x = 40 + (idx * 520) / Math.max(1, payload.scans.length - 1);
                      const y = 110 - (s.analysis.confidenceScore / 100) * 90;
                      return (
                        <g key={s.id}>
                          <circle cx={x} cy={y} r="4.5" fill="#0F766E" />
                          <text
                            x={x}
                            y="130"
                            textAnchor="middle"
                            fontSize="9"
                            fill="#475569"
                            fontFamily="monospace"
                          >
                            {new Date(s.createdAt).toLocaleDateString()}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            )}

            {/* Chronological Scan Timeline */}
            <div className="grid md:grid-cols-2 gap-6">
              {payload.scans.map((scan, idx) => (
                <article key={scan.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-xs font-mono text-slate-500 tabular-nums">
                      Visit {idx + 1} · {new Date(scan.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs font-mono font-semibold text-teal-700 tabular-nums">
                      Confidence {scan.analysis.confidenceScore}%
                    </div>
                  </div>

                  <img
                    src={scan.imageDataUrl}
                    alt={scan.analysis.primaryCondition}
                    referrerPolicy="no-referrer"
                    className="w-full aspect-square object-cover rounded-lg border border-slate-200 bg-slate-950"
                  />

                  <div>
                    <h3 className="text-base font-bold text-slate-900">{scan.analysis.primaryCondition}</h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{scan.analysis.clinicalSummary}</p>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800">
                    <span className="font-semibold">Problem Check ({scan.analysis.severityLevel}): </span>
                    {scan.analysis.problemCheckingMessage}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
