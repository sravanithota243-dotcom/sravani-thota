import * as d3 from 'd3';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ImageQualityMetrics } from '../types';

interface HeatmapCell {
  col: number;
  row: number;
  uncertainty: number; // 0 (low uncertainty) -> 1 (high uncertainty)
  localConfidence: number;
  intervalHalfWidth: number;
  driver: string;
}

interface ConfidenceHeatmapOverlayProps {
  imageUrl: string;
  qualityMetrics: ImageQualityMetrics | null;
  confidenceScore?: number;
  uncertaintyMargin?: number;
  visible: boolean;
  children: React.ReactNode;
}

const GRID_COLS = 16;
const GRID_ROWS = 12;

export function ConfidenceHeatmapOverlay({
  imageUrl,
  qualityMetrics,
  confidenceScore,
  uncertaintyMargin,
  visible,
  children,
}: ConfidenceHeatmapOverlayProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const legendSvgRef = useRef<SVGSVGElement | null>(null);
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);

  const overallQuality = qualityMetrics?.overallScore ?? 75;
  const baseConfidence = confidenceScore ?? Math.max(40, Math.min(95, overallQuality));
  const baseMargin =
    uncertaintyMargin ??
    Math.max(4, Math.min(24, Math.round((100 - overallQuality) * 0.35 + 4)));

  // Sample local pixel variance, blur, glare, and shadow across the 16x12 grid
  useEffect(() => {
    if (!visible || !imageUrl) return;
    let active = true;

    const img = new Image();
    if (!imageUrl.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (!active) return;

      const sampleW = GRID_COLS * 8;
      const sampleH = GRID_ROWS * 8;
      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0, sampleW, sampleH);
      let imageData: ImageData;
      try {
        imageData = ctx.getImageData(0, 0, sampleW, sampleH);
      } catch {
        return;
      }

      const data = imageData.data;
      const gray = new Float32Array(sampleW * sampleH);
      for (let i = 0; i < sampleW * sampleH; i++) {
        const idx = i * 4;
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }

      const rawCells: Array<{
        col: number;
        row: number;
        glareFraction: number;
        shadowFraction: number;
        edgeMean: number;
        colorSpread: number;
        centerDist: number;
      }> = [];

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const x0 = c * 8;
          const y0 = r * 8;
          let glareCount = 0;
          let shadowCount = 0;
          let edgeSum = 0;
          let lumSum = 0;
          let lumSqSum = 0;
          let rgDiffSum = 0;
          let pxCount = 0;

          for (let dy = 0; dy < 8; dy++) {
            const py = y0 + dy;
            for (let dx = 0; dx < 8; dx++) {
              const px = x0 + dx;
              const pIdx = py * sampleW + px;
              const g = gray[pIdx];
              lumSum += g;
              lumSqSum += g * g;
              if (g > 228) glareCount++;
              if (g < 42) shadowCount++;

              const right = px + 1 < sampleW ? gray[pIdx + 1] : g;
              const down = py + 1 < sampleH ? gray[pIdx + sampleW] : g;
              edgeSum += Math.abs(g - right) + Math.abs(g - down);

              const rgbaIdx = pIdx * 4;
              rgDiffSum += Math.abs(data[rgbaIdx] - data[rgbaIdx + 1]);
              pxCount++;
            }
          }

          const meanLum = lumSum / pxCount;
          const variance = Math.max(0, lumSqSum / pxCount - meanLum * meanLum);
          const normX = (c + 0.5) / GRID_COLS - 0.5;
          const normY = (r + 0.5) / GRID_ROWS - 0.5;
          const centerDist = Math.sqrt(normX * normX + normY * normY) / 0.707;

          rawCells.push({
            col: c,
            row: r,
            glareFraction: glareCount / pxCount,
            shadowFraction: shadowCount / pxCount,
            edgeMean: edgeSum / pxCount,
            colorSpread: Math.sqrt(variance) * 0.6 + (rgDiffSum / pxCount) * 0.4,
            centerDist,
          });
        }
      }

      const maxEdge = Math.max(1, ...rawCells.map((c) => c.edgeMean));
      const maxSpread = Math.max(1, ...rawCells.map((c) => c.colorSpread));
      const globalUncertaintyBoost = Math.min(1, (baseMargin / 20) * 0.45 + (100 - baseConfidence) / 140);

      const computed: HeatmapCell[] = rawCells.map((cell) => {
        const edgeNorm = cell.edgeMean / maxEdge;
        const spreadNorm = cell.colorSpread / maxSpread;
        const blurPenalty = Math.max(0, 0.55 - edgeNorm) * 0.7;
        const borderTransition = spreadNorm * 0.55;
        const lightingPenalty = cell.glareFraction * 0.9 + cell.shadowFraction * 0.75;
        const focusRimPenalty = cell.centerDist * 0.16;

        const rawScore =
          0.14 +
          lightingPenalty * 0.45 +
          borderTransition * 0.34 +
          blurPenalty * 0.3 +
          focusRimPenalty +
          globalUncertaintyBoost * 0.32;

        const uncertainty = Math.max(0.05, Math.min(0.98, rawScore));

        let driver = 'Clear skin margin';
        if (cell.glareFraction > 0.22) {
          driver = 'Specular glare / high exposure';
        } else if (cell.shadowFraction > 0.25) {
          driver = 'Low-light shadow occlusion';
        } else if (spreadNorm > 0.58) {
          driver = 'Pigment & border transition zone';
        } else if (edgeNorm < 0.24) {
          driver = 'Soft micro-focus / low edge contrast';
        } else if (cell.centerDist > 0.68) {
          driver = 'Peripheral lens falloff';
        }

        const intervalHalfWidth = Math.max(
          2,
          Math.min(28, Math.round(baseMargin * (0.65 + uncertainty * 0.95)))
        );
        const localConfidence = Math.max(
          18,
          Math.min(99, Math.round(baseConfidence + (0.42 - uncertainty) * 26))
        );

        return {
          col: cell.col,
          row: cell.row,
          uncertainty,
          localConfidence,
          intervalHalfWidth,
          driver,
        };
      });

      setCells(computed);
    };

    img.src = imageUrl;

    return () => {
      active = false;
    };
  }, [imageUrl, visible, baseConfidence, baseMargin]);

  const colorInterpolator = useMemo(
    () =>
      d3.interpolateRgbBasis([
        'rgba(15, 118, 110, 0.08)',
        'rgba(20, 184, 166, 0.22)',
        'rgba(245, 158, 11, 0.48)',
        'rgba(225, 29, 72, 0.72)',
      ]),
    []
  );

  // Render D3 uncertainty heatmap + contour bands over SVG layer
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    if (!visible || cells.length === 0) return;

    const width = 400;
    const height = 300;
    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;

    svg
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'none');

    const defs = svg.append('defs');
    const blurFilter = defs
      .append('filter')
      .attr('id', 'heatmap-gaussian-blur')
      .attr('x', '-15%')
      .attr('y', '-15%')
      .attr('width', '130%')
      .attr('height', '130%');
    blurFilter.append('feGaussianBlur').attr('stdDeviation', '9');

    // Blurred thermal base layer
    const heatLayer = svg.append('g').attr('filter', 'url(#heatmap-gaussian-blur)');
    heatLayer
      .selectAll('rect.heat-blob')
      .data(cells)
      .enter()
      .append('rect')
      .attr('class', 'heat-blob')
      .attr('x', (d) => d.col * cellW - 2)
      .attr('y', (d) => d.row * cellH - 2)
      .attr('width', cellW + 4)
      .attr('height', cellH + 4)
      .attr('fill', (d) => colorInterpolator(d.uncertainty));

    // D3 uncertainty contour rings highlighting elevated-uncertainty zones
    const gridValues = cells.map((c) => c.uncertainty);
    const contourGen = d3
      .contours()
      .size([GRID_COLS, GRID_ROWS])
      .thresholds([0.48, 0.62, 0.76]);
    const contours = contourGen(gridValues);

    const contourPath = d3.geoPath(
      d3.geoIdentity().scale(width / GRID_COLS)
    );

    svg
      .append('g')
      .selectAll('path.uncertainty-contour')
      .data(contours)
      .enter()
      .append('path')
      .attr('class', 'uncertainty-contour')
      .attr('d', (d) => contourPath(d) || '')
      .attr('fill', 'none')
      .attr('stroke', (d) =>
        d.value >= 0.72
          ? 'rgba(255, 255, 255, 0.85)'
          : d.value >= 0.58
            ? 'rgba(254, 240, 138, 0.75)'
            : 'rgba(255, 255, 255, 0.45)'
      )
      .attr('stroke-width', (d) => (d.value >= 0.72 ? 1.5 : 1))
      .attr('stroke-dasharray', (d) => (d.value >= 0.72 ? 'none' : '3 2'));

    // Interactive inspection grid cells
    svg
      .append('g')
      .selectAll('rect.inspect-cell')
      .data(cells)
      .enter()
      .append('rect')
      .attr('class', 'inspect-cell')
      .attr('x', (d) => d.col * cellW)
      .attr('y', (d) => d.row * cellH)
      .attr('width', cellW)
      .attr('height', cellH)
      .attr('fill', 'transparent')
      .attr('stroke', 'rgba(255, 255, 255, 0.08)')
      .attr('stroke-width', 0.5)
      .style('cursor', 'crosshair')
      .on('mouseenter', function (_, d) {
        d3.select(this)
          .attr('stroke', '#FFFFFF')
          .attr('stroke-width', 1.5)
          .attr('fill', 'rgba(255,255,255,0.12)');
        setHoveredCell(d);
      })
      .on('mouseleave', function () {
        d3.select(this)
          .attr('stroke', 'rgba(255, 255, 255, 0.08)')
          .attr('stroke-width', 0.5)
          .attr('fill', 'transparent');
      });
  }, [cells, visible, colorInterpolator]);

  // Render D3 gradient scale bar for legend
  useEffect(() => {
    const legendEl = legendSvgRef.current;
    if (!legendEl || !visible) return;

    const svg = d3.select(legendEl);
    svg.selectAll('*').remove();

    const w = 180;
    const h = 10;
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);

    const defs = svg.append('defs');
    const grad = defs.append('linearGradient').attr('id', 'ci-heatmap-legend-grad');
    const stops = [0, 0.33, 0.66, 1];
    stops.forEach((t) => {
      grad
        .append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorInterpolator(t));
    });

    svg
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', w)
      .attr('height', h)
      .attr('rx', 5)
      .attr('fill', 'url(#ci-heatmap-legend-grad)')
      .attr('stroke', '#CBD5E1')
      .attr('stroke-width', 0.8);
  }, [visible, colorInterpolator]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
      <div className="relative aspect-[4/3] flex items-center justify-center">
        {children}

        {visible && (
          <svg
            ref={svgRef}
            aria-label="D3 confidence interval and uncertainty heatmap overlay"
            onMouseLeave={() => setHoveredCell(null)}
            className="absolute inset-0 w-full h-full z-10"
          />
        )}
      </div>

      {visible && (
        <div className="bg-slate-900 text-slate-100 px-3.5 py-2.5 text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800">
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="text-slate-300 font-medium whitespace-nowrap">Low Uncertainty</span>
            <svg ref={legendSvgRef} className="shrink-0" aria-hidden="true" />
            <span className="text-rose-300 font-medium whitespace-nowrap">High Uncertainty</span>
          </div>

          <div className="font-mono tabular-nums text-slate-200 truncate">
            {hoveredCell ? (
              <span>
                Zone C{hoveredCell.col + 1}·R{hoveredCell.row + 1}:{' '}
                <span className="font-semibold text-teal-300">
                  {hoveredCell.localConfidence}% ±{hoveredCell.intervalHalfWidth}%
                </span>{' '}
                · {hoveredCell.driver}
              </span>
            ) : (
              <span>
                Overall CI:{' '}
                <span className="font-semibold text-teal-300">
                  {baseConfidence}% ±{baseMargin}%
                </span>{' '}
                · Hover zones to inspect uncertainty
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
