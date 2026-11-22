import * as d3 from 'd3';
import {
  AlertTriangle,
  ArrowRight,
  GitCompareArrows,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  LesionCase,
  LongitudinalComparison,
  ProgressionStatus,
  SkinScanRecord,
} from '../types';
import { formatDurationLabel } from '../utils/duration';

interface ComparisonSummarySidebarProps {
  selectedCase: LesionCase | null;
  isNewCase: boolean;
  caseScans: SkinScanRecord[];
  caseComparisons: LongitudinalComparison[];
  latestFreshScanId?: string | null;
  onJumpToCompare: (scanId: string) => void;
}

const PROGRESSION_RANK: Record<ProgressionStatus, number> = {
  improving: 1,
  stable: 2,
  evolving: 3,
  worsening: 4,
};

const PROGRESSION_LABEL: Record<ProgressionStatus, string> = {
  improving: 'Improving',
  stable: 'Stable',
  evolving: 'Evolving',
  worsening: 'Worsening',
};

const PROGRESSION_HEX: Record<ProgressionStatus, string> = {
  improving: '#16A34A',
  stable: '#0F766E',
  evolving: '#D97706',
  worsening: '#DC2626',
};

const PROGRESSION_TEXT_CLASS: Record<ProgressionStatus, string> = {
  improving: 'text-emerald-700',
  stable: 'text-teal-700',
  evolving: 'text-amber-700',
  worsening: 'text-rose-700',
};

export function ComparisonSummarySidebar({
  selectedCase,
  isNewCase,
  caseScans,
  caseComparisons,
  latestFreshScanId,
  onJumpToCompare,
}: ComparisonSummarySidebarProps) {
  const progressionSvgRef = useRef<SVGSVGElement | null>(null);
  const confidenceSvgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredCmp, setHoveredCmp] = useState<LongitudinalComparison | null>(null);

  const sortedComparisons = useMemo(
    () =>
      [...caseComparisons].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [caseComparisons]
  );

  const sortedScans = useMemo(
    () =>
      [...caseScans].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [caseScans]
  );

  const latestComparison =
    sortedComparisons.length > 0 ? sortedComparisons[sortedComparisons.length - 1] : null;
  const activeComparison = hoveredCmp || latestComparison;

  const avgComparisonConfidence = useMemo(() => {
    if (sortedComparisons.length === 0) return null;
    const sum = sortedComparisons.reduce((acc, c) => acc + c.confidenceScore, 0);
    return Math.round(sum / sortedComparisons.length);
  }, [sortedComparisons]);

  const avgSessionDurationSeconds = useMemo(() => {
    const durations = sortedScans
      .map((s) => s.metadata?.sessionDurationSeconds)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0);
    if (durations.length === 0) return null;
    return Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length);
  }, [sortedScans]);

  // Mini-chart 1: Historical Progression Status Trajectory from comparison records
  useEffect(() => {
    const svgEl = progressionSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (sortedComparisons.length === 0) return;

    const width = 260;
    const height = 86;
    const margin = { top: 10, right: 12, bottom: 18, left: 12 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, sortedComparisons.length - 1)])
      .range([sortedComparisons.length === 1 ? innerW / 2 : 6, sortedComparisons.length === 1 ? innerW / 2 : innerW - 6]);

    const yScale = d3.scaleLinear().domain([0.6, 4.4]).range([innerH, 0]);

    // Subtle reference bands
    [1, 2, 3, 4].forEach((lvl) => {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', yScale(lvl))
        .attr('y2', yScale(lvl))
        .attr('stroke', lvl === 4 ? '#FECDD3' : '#E2E8F0')
        .attr('stroke-dasharray', '2 2')
        .attr('stroke-width', 0.8);
    });

    if (sortedComparisons.length >= 2) {
      const areaGen = d3
        .area<LongitudinalComparison>()
        .x((_, idx) => xScale(idx))
        .y0(innerH)
        .y1((d) => yScale(PROGRESSION_RANK[d.progressionStatus]))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(sortedComparisons)
        .attr('d', areaGen)
        .attr('fill', 'rgba(15, 118, 110, 0.1)');

      const lineGen = d3
        .line<LongitudinalComparison>()
        .x((_, idx) => xScale(idx))
        .y((d) => yScale(PROGRESSION_RANK[d.progressionStatus]))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(sortedComparisons)
        .attr('d', lineGen)
        .attr('fill', 'none')
        .attr('stroke', '#0F766E')
        .attr('stroke-width', 2);
    }

    g.selectAll('circle.cmp-node')
      .data(sortedComparisons)
      .enter()
      .append('circle')
      .attr('class', 'cmp-node')
      .attr('cx', (_, idx) => xScale(idx))
      .attr('cy', (d) => yScale(PROGRESSION_RANK[d.progressionStatus]))
      .attr('r', 4.5)
      .attr('fill', (d) => PROGRESSION_HEX[d.progressionStatus])
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('mouseenter', (_, d) => setHoveredCmp(d))
      .on('mouseleave', () => setHoveredCmp(null));

    // Compact start/end date axis labels
    const firstDate = new Date(sortedComparisons[0].createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    const lastDate = new Date(
      sortedComparisons[sortedComparisons.length - 1].createdAt
    ).toLocaleDateString([], { month: 'short', day: 'numeric' });

    g.append('text')
      .attr('x', 0)
      .attr('y', innerH + 13)
      .attr('fill', '#64748B')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(firstDate);

    if (sortedComparisons.length > 1) {
      g.append('text')
        .attr('x', innerW)
        .attr('y', innerH + 13)
        .attr('text-anchor', 'end')
        .attr('fill', '#64748B')
        .attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(lastDate);
    }
  }, [sortedComparisons]);

  // Mini-chart 2: Confidence Score Bar/Line History (Comparisons + Scan Trend)
  useEffect(() => {
    const svgEl = confidenceSvgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const dataPoints =
      sortedComparisons.length > 0
        ? sortedComparisons.map((c) => ({
            id: c.id,
            label: new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            confidence: c.confidenceScore,
            color: PROGRESSION_HEX[c.progressionStatus],
            isFresh: false,
            cmp: c as LongitudinalComparison | null,
          }))
        : sortedScans.map((s) => ({
            id: s.id,
            label: new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            confidence: s.analysis.confidenceScore,
            color:
              s.analysis.severityLevel === 'urgent'
                ? '#DC2626'
                : s.analysis.severityLevel === 'monitor'
                  ? '#D97706'
                  : '#0F766E',
            isFresh: s.id === latestFreshScanId,
            cmp: null as LongitudinalComparison | null,
          }));

    if (dataPoints.length === 0) return;

    const width = 260;
    const height = 82;
    const margin = { top: 8, right: 8, bottom: 18, left: 26 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleBand()
      .domain(dataPoints.map((_, i) => String(i)))
      .range([0, innerW])
      .padding(0.28);

    const yScale = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);

    // 50% and 100% guides
    [50, 100].forEach((tick) => {
      g.append('line')
        .attr('x1', 0)
        .attr('x2', innerW)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick))
        .attr('stroke', '#E2E8F0')
        .attr('stroke-dasharray', '2 2')
        .attr('stroke-width', 0.8);

      g.append('text')
        .attr('x', -4)
        .attr('y', yScale(tick) + 3)
        .attr('text-anchor', 'end')
        .attr('fill', '#94A3B8')
        .attr('font-size', '8px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(`${tick}`);
    });

    g.selectAll('rect.conf-bar')
      .data(dataPoints)
      .enter()
      .append('rect')
      .attr('class', 'conf-bar')
      .attr('x', (_, i) => xScale(String(i)) || 0)
      .attr('y', (d) => yScale(d.confidence))
      .attr('width', Math.min(28, xScale.bandwidth()))
      .attr('height', (d) => Math.max(2, innerH - yScale(d.confidence)))
      .attr('rx', 2.5)
      .attr('fill', (d) => d.color)
      .attr('opacity', (d) => (d.isFresh ? 1 : 0.82))
      .style('cursor', (d) => (d.cmp ? 'pointer' : 'default'))
      .on('mouseenter', (_, d) => {
        if (d.cmp) setHoveredCmp(d.cmp);
      })
      .on('mouseleave', () => setHoveredCmp(null));

    // Baseline X labels
    g.append('text')
      .attr('x', 0)
      .attr('y', innerH + 12)
      .attr('fill', '#64748B')
      .attr('font-size', '9px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text(dataPoints[0].label);

    if (dataPoints.length > 1) {
      g.append('text')
        .attr('x', innerW)
        .attr('y', innerH + 12)
        .attr('text-anchor', 'end')
        .attr('fill', '#64748B')
        .attr('font-size', '9px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(dataPoints[dataPoints.length - 1].label);
    }
  }, [sortedComparisons, sortedScans, latestFreshScanId]);

  const jumpScanId =
    latestFreshScanId ||
    sortedScans[sortedScans.length - 1]?.id ||
    latestComparison?.currentScanId ||
    '';

  return (
    <aside
      aria-label="Comparison Summary"
      className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 xl:sticky xl:top-24"
    >
      <div className="pb-3.5 border-b border-slate-200 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-bold text-slate-900">Comparison Summary</h2>
          </div>
          {sortedComparisons.length > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {sortedComparisons.length} record{sortedComparisons.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 truncate">
          {isNewCase || !selectedCase
            ? 'New lesion baseline — no prior comparison history yet'
            : `${selectedCase.title} · ${selectedCase.bodyLocation}${
                avgSessionDurationSeconds ? ` · Avg ${formatDurationLabel(avgSessionDurationSeconds)}` : ''
              }`}
        </p>
      </div>

      {isNewCase || !selectedCase ? (
        <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 leading-relaxed space-y-2">
          <p>
            Select an existing tracked lesion case under <span className="font-semibold text-slate-800">02. Lesion Case &amp; Symptom Context</span> to inspect its historical progression mini-charts alongside a fresh scan.
          </p>
          <p className="text-slate-500">
            Saving this new case establishes its baseline scan for future longitudinal comparisons.
          </p>
        </div>
      ) : (
        <>
          {/* Quick Progression & Metrics KPI Row */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                Latest Status
              </div>
              {latestComparison ? (
                <div
                  className={`text-sm font-bold mt-0.5 flex items-center gap-1 ${
                    PROGRESSION_TEXT_CLASS[latestComparison.progressionStatus]
                  }`}
                >
                  {latestComparison.progressionStatus === 'worsening' ||
                  latestComparison.progressionStatus === 'evolving' ? (
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{PROGRESSION_LABEL[latestComparison.progressionStatus]}</span>
                </div>
              ) : (
                <div className="text-xs font-medium text-slate-500 mt-1">Baseline Only</div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                {avgComparisonConfidence !== null ? 'Avg Cmp Conf' : 'Prior Scans'}
              </div>
              <div className="text-sm font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                {avgComparisonConfidence !== null
                  ? `${avgComparisonConfidence}%`
                  : `${sortedScans.length}`}
              </div>
            </div>
          </div>

          {/* Mini-Chart 1: D3 Progression Trajectory */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-slate-700">Progression Trajectory</span>
              <span className="text-slate-400 font-mono">Improving → Worsening</span>
            </div>

            {sortedComparisons.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 leading-relaxed">
                No comparison records yet for this lesion. Run a scan comparison to track morphological evolution over time.
              </div>
            ) : (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <svg
                  ref={progressionSvgRef}
                  aria-label="Mini chart of historical lesion progression status"
                  className="w-full h-auto"
                />
              </div>
            )}
          </div>

          {/* Mini-Chart 2: D3 Confidence History */}
          {(sortedComparisons.length > 0 || sortedScans.length > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold text-slate-700">
                  {sortedComparisons.length > 0
                    ? 'Comparison Confidence (%)'
                    : 'Scan Confidence History (%)'}
                </span>
                <span className="text-slate-400 font-mono tabular-nums">
                  {sortedComparisons.length > 0
                    ? `${sortedComparisons.length} cmp`
                    : `${sortedScans.length} scan${sortedScans.length === 1 ? '' : 's'}`}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <svg
                  ref={confidenceSvgRef}
                  aria-label="Mini chart of historical confidence scores"
                  className="w-full h-auto"
                />
              </div>
            </div>
          )}

          {/* Active/Latest Comparison Visual Deltas & Summary */}
          {activeComparison && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-900">
                  {hoveredCmp ? 'Inspected Comparison' : 'Most Recent Comparison'}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500">
                  {new Date(activeComparison.createdAt).toLocaleDateString()} ·{' '}
                  <span className={`font-semibold ${PROGRESSION_TEXT_CLASS[activeComparison.progressionStatus]}`}>
                    {activeComparison.confidenceScore}%
                  </span>
                </span>
              </div>

              {activeComparison.progressionStatus === 'worsening' && (
                <div className="flex items-start gap-1.5 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-md p-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{activeComparison.problemCheckingMessage}</span>
                </div>
              )}

              <p className="text-xs text-slate-700 leading-relaxed line-clamp-3">
                {activeComparison.changeSummary}
              </p>

              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px]">
                <div className="bg-white border border-slate-200 rounded p-2">
                  <div className="text-slate-400 font-medium">Size</div>
                  <div className="text-slate-800 truncate" title={activeComparison.visualDeltas.sizeAndArea}>
                    {activeComparison.visualDeltas.sizeAndArea}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <div className="text-slate-400 font-medium">Border</div>
                  <div className="text-slate-800 truncate" title={activeComparison.visualDeltas.borderEvolution}>
                    {activeComparison.visualDeltas.borderEvolution}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <div className="text-slate-400 font-medium">Pigment</div>
                  <div className="text-slate-800 truncate" title={activeComparison.visualDeltas.pigmentationShift}>
                    {activeComparison.visualDeltas.pigmentationShift}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <div className="text-slate-400 font-medium">Inflammation</div>
                  <div className="text-slate-800 truncate" title={activeComparison.visualDeltas.inflammationChange}>
                    {activeComparison.visualDeltas.inflammationChange}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Jump to Compare Workspace */}
          {jumpScanId && (
            <button
              type="button"
              onClick={() => onJumpToCompare(jumpScanId)}
              className="w-full py-2 px-3 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Open Full Comparison View</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </aside>
  );
}
