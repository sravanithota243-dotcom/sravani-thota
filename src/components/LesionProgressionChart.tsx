import * as d3 from 'd3';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LesionCase, SeverityLevel, SkinScanRecord } from '../types';
import { formatDurationLabel } from '../utils/duration';
import type { LesionTrendAlert } from '../utils/trendAlert';

export type ProgressionMetric = 'confidence' | 'severity' | 'duration';

interface LesionProgressionChartProps {
  cases: LesionCase[];
  scans: SkinScanRecord[];
  selectedCaseId: string;
  onSelectCaseId: (caseId: string) => void;
  onSelectScanId?: (scanId: string) => void;
  trendAlertsByCase?: Map<string, LesionTrendAlert>;
}

const SEVERITY_VALUE: Record<SeverityLevel, number> = {
  routine: 1,
  monitor: 2,
  urgent: 3,
};

const SEVERITY_LABELS: Record<number, string> = {
  1: 'Routine',
  2: 'Monitor',
  3: 'Urgent',
};

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  routine: '#16A34A',
  monitor: '#D97706',
  urgent: '#DC2626',
};

export function LesionProgressionChart({
  cases,
  scans,
  selectedCaseId,
  onSelectCaseId,
  onSelectScanId,
  trendAlertsByCase,
}: LesionProgressionChartProps) {
  const [metric, setMetric] = useState<ProgressionMetric>('confidence');
  const [hoveredScan, setHoveredScan] = useState<SkinScanRecord | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(640);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const activeTrendAlert = trendAlertsByCase?.get(selectedCaseId) || null;

  const caseScans = useMemo(() => {
    return scans
      .filter((s) => s.caseId === selectedCaseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [scans, selectedCaseId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    observer.observe(el);
    setContainerWidth(Math.floor(el.getBoundingClientRect().width) || 640);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (caseScans.length === 0) return;

    const height = 240;
    const margin = { top: 20, right: 24, bottom: 34, left: metric === 'severity' ? 66 : 48 };
    const width = Math.max(320, containerWidth);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const dates = caseScans.map((d) => new Date(d.createdAt));
    let minDate = d3.min(dates) as Date;
    let maxDate = d3.max(dates) as Date;
    if (minDate.getTime() === maxDate.getTime()) {
      minDate = new Date(minDate.getTime() - 24 * 60 * 60 * 1000);
      maxDate = new Date(maxDate.getTime() + 24 * 60 * 60 * 1000);
    } else {
      const span = maxDate.getTime() - minDate.getTime();
      minDate = new Date(minDate.getTime() - span * 0.06);
      maxDate = new Date(maxDate.getTime() + span * 0.06);
    }

    const xScale = d3.scaleTime().domain([minDate, maxDate]).range([0, innerW]);

    const maxDuration = Math.max(
      60,
      Math.ceil(((d3.max(caseScans, (d) => d.metadata?.sessionDurationSeconds ?? 0) || 60) * 1.15) / 30) *
        30
    );

    const yScale =
      metric === 'confidence'
        ? d3.scaleLinear().domain([0, 100]).range([innerH, 0])
        : metric === 'severity'
          ? d3.scaleLinear().domain([0.6, 3.4]).range([innerH, 0])
          : d3.scaleLinear().domain([0, maxDuration]).range([innerH, 0]);

    // Horizontal grid lines
    const yTicks =
      metric === 'confidence'
        ? [0, 25, 50, 75, 100]
        : metric === 'severity'
          ? [1, 2, 3]
          : [0, Math.round(maxDuration * 0.33), Math.round(maxDuration * 0.66), maxDuration];
    g.append('g')
      .selectAll('line.grid-y')
      .data(yTicks)
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', innerW)
      .attr('y1', (d) => yScale(d))
      .attr('y2', (d) => yScale(d))
      .attr('stroke', '#E2E8F0')
      .attr('stroke-dasharray', '3 3');

    // X axis
    const xAxis = d3
      .axisBottom<Date>(xScale)
      .ticks(Math.min(6, Math.max(2, caseScans.length)))
      .tickFormat(d3.timeFormat('%b %d'));

    const xAxisGroup = g
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(xAxis);

    xAxisGroup.select('.domain').attr('stroke', '#CBD5E1');
    xAxisGroup.selectAll('.tick line').attr('stroke', '#CBD5E1');
    xAxisGroup
      .selectAll('.tick text')
      .attr('fill', '#64748B')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    // Y axis
    const yAxis = d3
      .axisLeft<number>(yScale)
      .tickValues(yTicks)
      .tickFormat((d) =>
        metric === 'confidence'
          ? `${d}%`
          : metric === 'severity'
            ? SEVERITY_LABELS[Number(d)] || ''
            : d === 0
              ? '0s'
              : formatDurationLabel(Number(d))
      );

    const yAxisGroup = g.append('g').call(yAxis);
    yAxisGroup.select('.domain').attr('stroke', '#CBD5E1');
    yAxisGroup.selectAll('.tick line').attr('stroke', '#CBD5E1');
    yAxisGroup
      .selectAll('.tick text')
      .attr('fill', '#64748B')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px');

    const getYValue = (d: SkinScanRecord) =>
      metric === 'confidence'
        ? d.analysis.confidenceScore
        : metric === 'severity'
          ? SEVERITY_VALUE[d.analysis.severityLevel]
          : d.metadata?.sessionDurationSeconds ?? 0;

    const isAlertLine =
      Boolean(activeTrendAlert) &&
      ((metric === 'confidence' && activeTrendAlert?.rapidConfidenceIncrease) ||
        (metric === 'severity' && activeTrendAlert?.worseningSeverity) ||
        Boolean(activeTrendAlert));

    // Confidence uncertainty ribbon when viewing confidence
    if (metric === 'confidence' && caseScans.length > 1) {
      const bandArea = d3
        .area<SkinScanRecord>()
        .x((d) => xScale(new Date(d.createdAt)))
        .y0((d) => yScale(Math.max(0, d.analysis.confidenceScore - d.analysis.uncertaintyMargin)))
        .y1((d) => yScale(Math.min(100, d.analysis.confidenceScore + d.analysis.uncertaintyMargin)))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(caseScans)
        .attr('fill', isAlertLine ? 'rgba(225, 29, 72, 0.12)' : 'rgba(13, 148, 136, 0.12)')
        .attr('d', bandArea);
    } else if ((metric === 'severity' || metric === 'duration') && caseScans.length > 1) {
      const areaGen = d3
        .area<SkinScanRecord>()
        .x((d) => xScale(new Date(d.createdAt)))
        .y0(innerH)
        .y1((d) => yScale(getYValue(d)))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(caseScans)
        .attr(
          'fill',
          isAlertLine
            ? 'rgba(225, 29, 72, 0.12)'
            : metric === 'duration'
              ? 'rgba(79, 70, 229, 0.10)'
              : 'rgba(217, 119, 6, 0.08)'
        )
        .attr('d', areaGen);
    }

    // Primary line
    const lineColor = isAlertLine
      ? '#E11D48'
      : metric === 'confidence'
        ? '#0D9488'
        : metric === 'duration'
          ? '#4338CA'
          : '#0F172A';
    if (caseScans.length > 1) {
      const lineGen = d3
        .line<SkinScanRecord>()
        .x((d) => xScale(new Date(d.createdAt)))
        .y((d) => yScale(getYValue(d)))
        .curve(d3.curveMonotoneX);

      g.append('path')
        .datum(caseScans)
        .attr('fill', 'none')
        .attr('stroke', lineColor)
        .attr('stroke-width', 2.25)
        .attr('d', lineGen);
    }

    // Hairline crosshair line (hidden initially)
    const crosshair = g
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', '#94A3B8')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2 2')
      .style('opacity', 0);

    // Data point nodes
    g.selectAll('circle.scan-node')
      .data(caseScans)
      .enter()
      .append('circle')
      .attr('class', 'scan-node')
      .attr('cx', (d) => xScale(new Date(d.createdAt)))
      .attr('cy', (d) => yScale(getYValue(d)))
      .attr('r', 5.5)
      .attr('fill', (d) =>
        isAlertLine
          ? '#E11D48'
          : metric === 'severity'
            ? SEVERITY_COLORS[d.analysis.severityLevel]
            : metric === 'duration'
              ? '#4338CA'
              : '#0F766E'
      )
      .attr('stroke', '#FFFFFF')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseenter', (_event, d) => {
        const cx = xScale(new Date(d.createdAt));
        crosshair.attr('x1', cx).attr('x2', cx).style('opacity', 1);
        setHoveredScan(d);
      })
      .on('mouseleave', () => {
        crosshair.style('opacity', 0);
        setHoveredScan(null);
      })
      .on('click', (_event, d) => {
        onSelectScanId?.(d.id);
      });

    // Point value labels
    g.selectAll('text.node-label')
      .data(caseScans)
      .enter()
      .append('text')
      .attr('x', (d) => xScale(new Date(d.createdAt)))
      .attr('y', (d) => yScale(getYValue(d)) - 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#334155')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('font-weight', '600')
      .text((d) =>
        metric === 'confidence'
          ? `${d.analysis.confidenceScore}%`
          : metric === 'severity'
            ? SEVERITY_LABELS[SEVERITY_VALUE[d.analysis.severityLevel]]
            : formatDurationLabel(d.metadata?.sessionDurationSeconds)
      );
  }, [caseScans, containerWidth, metric, onSelectScanId, activeTrendAlert]);

  const activeCase = cases.find((c) => c.id === selectedCaseId);

  return (
    <section
      className={`rounded-xl p-6 space-y-5 border ${
        activeTrendAlert ? 'bg-rose-50/30 border-rose-300' : 'bg-white border-slate-200'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp
              className={`w-4 h-4 ${activeTrendAlert ? 'text-rose-700' : 'text-teal-700'}`}
              aria-hidden="true"
            />
            <h2 className="text-base font-bold text-slate-900">
              Lesion Progression Trajectory (D3.js)
            </h2>
            {activeTrendAlert && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Trend Alert</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Track longitudinal changes in confidence score (±margin) or clinical severity across visits. Click any node
            to inspect that report.
          </p>
          {activeTrendAlert && (
            <p className="text-xs font-medium text-rose-800 pt-0.5">{activeTrendAlert.summaryText}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {cases.length > 0 && (
            <select
              aria-label="Select lesion case for progression chart"
              value={selectedCaseId}
              onChange={(e) => onSelectCaseId(e.target.value)}
              className={`px-3 py-1.5 text-xs bg-white border rounded-lg text-slate-800 ${
                activeTrendAlert ? 'border-rose-300 text-rose-950' : 'border-slate-300'
              }`}
            >
              {cases.map((c) => {
                const hasCaseAlert = trendAlertsByCase?.has(c.id);
                return (
                  <option key={c.id} value={c.id}>
                    {hasCaseAlert ? `[Trend Alert] ` : ''}
                    {c.title} ({c.bodyLocation})
                  </option>
                );
              })}
            </select>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMetric('confidence')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                metric === 'confidence'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Confidence Score
            </button>
            <button
              type="button"
              onClick={() => setMetric('severity')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                metric === 'severity'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Severity Level
            </button>
            <button
              type="button"
              onClick={() => setMetric('duration')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                metric === 'duration'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Session Time
            </button>
          </div>
        </div>
      </div>

      {/* Chart Viewport */}
      <div ref={containerRef} className="w-full relative">
        {caseScans.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
            No scans recorded yet for {activeCase?.title || 'this case'}.
          </div>
        ) : (
          <>
            <svg ref={svgRef} className="w-full overflow-visible select-none" />
            {caseScans.length === 1 && (
              <p className="text-xs text-slate-500 mt-2">
                Single baseline scan plotted. Add follow-up scans to this lesion case to visualize longitudinal trend
                lines.
              </p>
            )}
          </>
        )}
      </div>

      {/* Interactive Crosshair HUD */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
        {hoveredScan ? (
          <div className="flex flex-wrap items-center gap-3 text-slate-700 font-mono tabular-nums">
            <span className="font-semibold text-slate-900">
              {new Date(hoveredScan.createdAt).toLocaleString()}
            </span>
            <span aria-hidden="true">·</span>
            <span>{hoveredScan.analysis.primaryCondition}</span>
            <span aria-hidden="true">·</span>
            <span className="text-teal-700 font-semibold">
              Confidence {hoveredScan.analysis.confidenceScore}% (±{hoveredScan.analysis.uncertaintyMargin}%)
            </span>
            <span aria-hidden="true">·</span>
            <span className="uppercase font-semibold">{hoveredScan.analysis.severityLevel}</span>
            {hoveredScan.metadata?.sessionDurationSeconds ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-indigo-700 font-semibold">
                  Session {formatDurationLabel(hoveredScan.metadata.sessionDurationSeconds)}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <div className="text-slate-500">
            Hover over a scan point to inspect timestamp, confidence margin, severity tier, and session duration.
          </div>
        )}

        <div className="text-xs font-mono text-slate-500 tabular-nums">
          {caseScans.length} Scan{caseScans.length === 1 ? '' : 's'} Plotted
        </div>
      </div>
    </section>
  );
}
