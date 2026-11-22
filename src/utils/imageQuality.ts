import type { ImageQualityMetrics, QualityStatus } from '../types';

export interface PreprocessOptions {
  autoNormalize: boolean;
  glareMitigation: boolean;
  sharpenEdges: boolean;
  cropZoom: number; // 1.0 to 1.8
  brightnessOffset: number; // -40 to 40
  contrastOffset: number; // -50 to 50 (%)
}

export const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  autoNormalize: true,
  glareMitigation: false,
  sharpenEdges: true,
  cropZoom: 1.0,
  brightnessOffset: 0,
  contrastOffset: 0,
};

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image for quality inspection.'));
    img.src = src;
  });
}

function computeQualityFromImageData(
  imageData: ImageData,
  origWidth: number,
  origHeight: number,
  appliedOps: string[]
): ImageQualityMetrics {
  const { data, width, height } = imageData;
  const count = width * height;
  const gray = new Float32Array(count);

  let sumLum = 0;
  let clippedBright = 0;
  let clippedDark = 0;

  for (let i = 0; i < count; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = lum;
    sumLum += lum;
    if (lum > 246) clippedBright++;
    if (lum < 14) clippedDark++;
  }

  const meanLum = sumLum / count;

  // RMS Contrast
  let varLum = 0;
  for (let i = 0; i < count; i++) {
    const diff = gray[i] - meanLum;
    varLum += diff * diff;
  }
  const stdLum = Math.sqrt(varLum / count);

  // Laplacian variance for focus/sharpness (sampled inside border)
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const lap =
        gray[idx - width] +
        gray[idx + width] +
        gray[idx - 1] +
        gray[idx + 1] -
        4 * gray[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
    }
  }
  const lapMean = lapSum / Math.max(1, lapCount);
  const lapVariance = lapSqSum / Math.max(1, lapCount) - lapMean * lapMean;

  // Calibrated 0-100 scores
  const sharpnessScore = Math.max(10, Math.min(99, Math.round((Math.sqrt(Math.max(0, lapVariance)) / 24) * 100)));

  // Ideal brightness ~110-185 out of 255
  const distFromIdeal = Math.abs(meanLum - 148);
  const glarePenalty = (clippedBright / count) * 180;
  const darkPenalty = (clippedDark / count) * 180;
  const brightnessScore = Math.max(
    12,
    Math.min(98, Math.round(100 - distFromIdeal * 0.65 - glarePenalty - darkPenalty))
  );

  // Ideal RMS contrast ~28-68
  const contrastScore = Math.max(15, Math.min(98, Math.round(Math.min(1, stdLum / 48) * 95)));

  const minDimension = Math.min(origWidth, origHeight);
  const resolutionScore = minDimension >= 600 ? 96 : minDimension >= 360 ? 75 : 42;

  const overallScore = Math.round(
    sharpnessScore * 0.38 + brightnessScore * 0.27 + contrastScore * 0.22 + resolutionScore * 0.13
  );

  const issues: string[] = [];
  if (minDimension < 360) issues.push('low spatial resolution (<360px)');
  if (sharpnessScore < 42) issues.push('focus blur or camera motion detected');
  if (meanLum < 68) issues.push('insufficient ambient lighting (underexposed)');
  if (meanLum > 220 || clippedBright / count > 0.18) issues.push('harsh surface glare or overexposure');
  if (contrastScore < 35) issues.push('low lesion-to-skin contrast');

  let status: QualityStatus = 'pass';
  let problemCheckingMessage =
    'Quality verified: Focus sharpness, balanced illumination, and perilesional contrast meet clinical screening standards.';

  if (overallScore < 48 || minDimension < 240) {
    status = 'fail';
    problemCheckingMessage = `Quality problem detected (${issues.join('; ')}). Please retake in bright, even indirect daylight from 10–15 cm away with steady focus.`;
  } else if (issues.length > 0 || overallScore < 70) {
    status = 'warning';
    problemCheckingMessage = `Moderate quality warning (${issues.join('; ') || 'suboptimal framing'}). Preprocessing filters applied; consider retaking if borders look soft.`;
  }

  return {
    width: origWidth,
    height: origHeight,
    sharpnessScore,
    brightnessScore,
    contrastScore,
    overallScore,
    status,
    problemCheckingMessage,
    preprocessingApplied: appliedOps,
  };
}

export async function analyzeAndPreprocessImage(
  sourceDataUrl: string,
  options: PreprocessOptions
): Promise<{
  preprocessedDataUrl: string;
  rawMetrics: ImageQualityMetrics;
  processedMetrics: ImageQualityMetrics;
}> {
  const img = await loadImageElement(sourceDataUrl);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // Downscale cleanly to max 1024px edge for fast canvas ops & efficient API payload
  const maxDim = 1024;
  const scale = Math.min(1, maxDim / Math.max(origW, origH));
  const targetW = Math.max(64, Math.round(origW * scale));
  const targetH = Math.max(64, Math.round(origH * scale));

  // 1. Measure raw image quality
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = 256;
  rawCanvas.height = 256;
  const rawCtx = rawCanvas.getContext('2d');
  if (!rawCtx) throw new Error('Canvas 2D context unavailable.');
  rawCtx.drawImage(img, 0, 0, 256, 256);
  const rawImageData = rawCtx.getImageData(0, 0, 256, 256);
  const rawMetrics = computeQualityFromImageData(rawImageData, origW, origH, ['Raw Unprocessed Input']);

  // 2. Render preprocessed output
  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) throw new Error('Canvas 2D context unavailable.');

  const zoom = Math.max(1, Math.min(2.0, options.cropZoom));
  const srcCropW = origW / zoom;
  const srcCropH = origH / zoom;
  const srcX = (origW - srcCropW) / 2;
  const srcY = (origH - srcCropH) / 2;

  outCtx.drawImage(img, srcX, srcY, srcCropW, srcCropH, 0, 0, targetW, targetH);

  const appliedOps: string[] = [];
  if (zoom > 1.02) {
    appliedOps.push(`Center ROI Crop (${zoom.toFixed(1)}x)`);
  }

  const outData = outCtx.getImageData(0, 0, targetW, targetH);
  const px = outData.data;

  // Compute channel min/max (2nd/98th percentile approx) if autoNormalize
  let minR = 0, maxR = 255, minG = 0, maxG = 255, minB = 0, maxB = 255;
  if (options.autoNormalize) {
    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const totalPixels = targetW * targetH;
    for (let i = 0; i < totalPixels; i++) {
      histR[px[i * 4]]++;
      histG[px[i * 4 + 1]]++;
      histB[px[i * 4 + 2]]++;
    }
    const lowCut = totalPixels * 0.015;
    const highCut = totalPixels * 0.985;
    const findBounds = (hist: Uint32Array): [number, number] => {
      let acc = 0;
      let lo = 0;
      let hi = 255;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= lowCut) {
          lo = v;
          break;
        }
      }
      acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= highCut) {
          hi = v;
          break;
        }
      }
      return [lo, Math.max(lo + 20, hi)];
    };
    [minR, maxR] = findBounds(histR);
    [minG, maxG] = findBounds(histG);
    [minB, maxB] = findBounds(histB);
    appliedOps.push('White-Balance & Dynamic Range Normalization');
  }

  if (options.glareMitigation) {
    appliedOps.push('Specular Glare Compression');
  }
  if (options.brightnessOffset !== 0) {
    appliedOps.push(`Brightness Adjustment (${options.brightnessOffset > 0 ? '+' : ''}${options.brightnessOffset})`);
  }
  if (options.contrastOffset !== 0) {
    appliedOps.push(`Contrast Adjustment (${options.contrastOffset > 0 ? '+' : ''}${options.contrastOffset}%)`);
  }

  const contrastScale = 1 + options.contrastOffset / 100;

  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];

    if (options.autoNormalize) {
      r = ((r - minR) * 255) / (maxR - minR);
      g = ((g - minG) * 255) / (maxG - minG);
      b = ((b - minB) * 255) / (maxB - minB);
    }

    if (options.glareMitigation) {
      // Soft shoulder compression on high luminance channels
      if (r > 210) r = 210 + (r - 210) * 0.45;
      if (g > 210) g = 210 + (g - 210) * 0.45;
      if (b > 210) b = 210 + (b - 210) * 0.45;
    }

    if (options.contrastOffset !== 0) {
      r = (r - 128) * contrastScale + 128;
      g = (g - 128) * contrastScale + 128;
      b = (b - 128) * contrastScale + 128;
    }

    if (options.brightnessOffset !== 0) {
      r += options.brightnessOffset;
      g += options.brightnessOffset;
      b += options.brightnessOffset;
    }

    px[i] = Math.max(0, Math.min(255, r));
    px[i + 1] = Math.max(0, Math.min(255, g));
    px[i + 2] = Math.max(0, Math.min(255, b));
  }

  // Optional 3x3 mild unsharp mask for lesion border clarity
  if (options.sharpenEdges) {
    appliedOps.push('Lesion Border Micro-Sharpening');
    const copy = new Uint8ClampedArray(px);
    const amount = 0.28;
    for (let y = 1; y < targetH - 1; y++) {
      for (let x = 1; x < targetW - 1; x++) {
        const idx = (y * targetW + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const avg =
            (copy[idx - 4 + c] +
              copy[idx + 4 + c] +
              copy[idx - targetW * 4 + c] +
              copy[idx + targetW * 4 + c]) *
            0.25;
          px[idx + c] = Math.max(0, Math.min(255, center + (center - avg) * amount));
        }
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  const preprocessedDataUrl = outCanvas.toDataURL('image/jpeg', 0.92);

  // Measure post-processed quality
  const evalCanvas = document.createElement('canvas');
  evalCanvas.width = 256;
  evalCanvas.height = 256;
  const evalCtx = evalCanvas.getContext('2d');
  if (!evalCtx) throw new Error('Canvas 2D context unavailable.');
  evalCtx.drawImage(outCanvas, 0, 0, 256, 256);
  const evalData = evalCtx.getImageData(0, 0, 256, 256);
  const processedMetrics = computeQualityFromImageData(
    evalData,
    targetW,
    targetH,
    appliedOps.length > 0 ? appliedOps : ['Standardized JPEG Conversion']
  );

  return {
    preprocessedDataUrl,
    rawMetrics,
    processedMetrics,
  };
}
