import { jsPDF } from 'jspdf';
import type {
  ImageQualityMetrics,
  LesionCase,
  LongitudinalComparison,
  SkinScanRecord,
} from '../types';
import { formatDurationLabel } from './duration';
import { loadImageElement } from './imageQuality';

async function imageSrcToJpegDataUrl(src: string): Promise<string | null> {
  try {
    const img = await loadImageElement(src);
    const canvas = document.createElement('canvas');
    const maxW = 640;
    const scale = Math.min(1, maxW / (img.naturalWidth || 640));
    canvas.width = Math.round((img.naturalWidth || 640) * scale);
    canvas.height = Math.round((img.naturalHeight || 480) * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

export async function generateScanPdfReport(
  scan: SkinScanRecord,
  longitudinalUrl?: string,
  patientName?: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 276) {
      doc.addPage();
      y = 18;
    }
  };

  // Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SkinSense Clinical Screening Report', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(`Report ID: ${scan.id}  |  Generated: ${new Date().toLocaleString()}`, margin, 21);

  y = 36;
  doc.setTextColor(15, 23, 42);

  // Patient & Case Metadata Row
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Case / Region:', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${scan.caseTitle} (${scan.bodyLocation})`, margin + 32, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('Captured:', margin + 4, y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(scan.createdAt).toLocaleString(), margin + 32, y + 13.5);

  if (patientName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Account:', margin + 102, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(patientName, margin + 122, y + 7);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Severity:', margin + 102, y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(scan.analysis.severityLevel.toUpperCase(), margin + 122, y + 13.5);

  if (longitudinalUrl) {
    doc.setFont('helvetica', 'bold');
    doc.text('Longitudinal URL:', margin + 4, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(13, 148, 136);
    doc.text(longitudinalUrl.slice(0, 78), margin + 36, y + 20);
    doc.setTextColor(15, 23, 42);
  }

  y += 31;

  // Image + Primary Assessment Split
  const jpegData = await imageSrcToJpegDataUrl(scan.imageDataUrl);
  const imgSize = 54;
  if (jpegData) {
    doc.addImage(jpegData, 'JPEG', margin, y, imgSize, imgSize);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, imgSize, imgSize);
  }

  const rightX = margin + imgSize + 8;
  const rightW = contentWidth - imgSize - 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('PRIMARY SCREENING ASSESSMENT', rightX, y + 5);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  const condLines = doc.splitTextToSize(scan.analysis.primaryCondition, rightW);
  doc.text(condLines, rightX, y + 12);

  const condHeight = condLines.length * 6;
  const confY = y + 14 + condHeight;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `AI Confidence Score: ${scan.analysis.confidenceScore}% (±${scan.analysis.uncertaintyMargin}%)`,
    rightX,
    confY
  );

  // Confidence bar
  doc.setFillColor(226, 232, 240);
  doc.rect(rightX, confY + 2.5, rightW, 3.5, 'F');
  doc.setFillColor(13, 148, 136);
  doc.rect(rightX, confY + 2.5, (rightW * scan.analysis.confidenceScore) / 100, 3.5, 'F');

  // Quality Score line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  const sessionText = scan.metadata?.sessionDurationSeconds
    ? ` · Session ${formatDurationLabel(scan.metadata.sessionDurationSeconds)}`
    : '';
  doc.text(
    `Image Quality: ${scan.qualityMetrics.overallScore}/100 (${scan.qualityMetrics.status.toUpperCase()}) · Sharpness ${scan.qualityMetrics.sharpnessScore} · Light ${scan.qualityMetrics.brightnessScore}${sessionText}`,
    rightX,
    confY + 12
  );

  y += Math.max(imgSize, confY + 18 - y) + 8;

  // Problem Checking Message Box
  ensureSpace(32);
  const severityColors: Record<string, [number, number, number]> = {
    routine: [22, 163, 74],
    monitor: [217, 119, 6],
    urgent: [220, 38, 38],
  };
  const [sr, sg, sb] = severityColors[scan.analysis.severityLevel] || [13, 148, 136];
  doc.setDrawColor(sr, sg, sb);
  doc.setFillColor(248, 250, 252);
  const problemLines = doc.splitTextToSize(scan.analysis.problemCheckingMessage, contentWidth - 8);
  const boxH = 12 + problemLines.length * 4.8;
  doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(sr, sg, sb);
  doc.text(`PROBLEM CHECKING MESSAGE (${scan.analysis.severityLevel.toUpperCase()})`, margin + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(problemLines, margin + 4, y + 12);
  y += boxH + 7;

  // Clinical Summary
  ensureSpace(26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Clinical Summary & Morphology', margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const summaryLines = doc.splitTextToSize(scan.analysis.clinicalSummary, contentWidth);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 4.8 + 5;

  const morphRows = [
    ['Asymmetry', scan.analysis.morphology.asymmetry],
    ['Border Regularity', scan.analysis.morphology.borderRegularity],
    ['Color Variation', scan.analysis.morphology.colorVariation],
    ['Erythema Level', scan.analysis.morphology.erythemaLevel],
    ['Surface Texture', scan.analysis.morphology.surfaceTexture],
  ];
  for (const [label, val] of morphRows) {
    ensureSpace(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const vLines = doc.splitTextToSize(val, contentWidth - 40);
    doc.text(vLines, margin + 38, y);
    y += Math.max(5.5, vLines.length * 4.8);
  }
  y += 4;

  // Patient Symptoms, Custom Notes & Tags
  if (scan.symptoms || scan.customNotes || (scan.tags && scan.tags.length > 0)) {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Patient Notes, Symptoms & Tags', margin, y);
    y += 5.5;
    doc.setFontSize(9);

    if (scan.tags && scan.tags.length > 0) {
      ensureSpace(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Tags:', margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(13, 148, 136);
      const tagLines = doc.splitTextToSize(scan.tags.join(' · '), contentWidth - 20);
      doc.text(tagLines, margin + 18, y);
      doc.setTextColor(15, 23, 42);
      y += tagLines.length * 4.5 + 1.5;
    }

    if (scan.symptoms) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Symptoms:', margin, y);
      doc.setFont('helvetica', 'normal');
      const symLines = doc.splitTextToSize(scan.symptoms, contentWidth - 26);
      doc.text(symLines, margin + 24, y);
      y += symLines.length * 4.5 + 1.5;
    }

    if (scan.customNotes) {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Custom Notes:', margin, y);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(scan.customNotes, contentWidth - 28);
      doc.text(noteLines, margin + 27, y);
      y += noteLines.length * 4.5 + 2;
    }
    y += 3;
  }

  // Differential Considerations
  ensureSpace(26);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Differential Possibilities', margin, y);
  y += 6;
  doc.setFontSize(9);
  for (const diff of scan.analysis.differentials) {
    ensureSpace(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`• ${diff.name} (${diff.probability}%)`, margin + 2, y);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(diff.notes, contentWidth - 10);
    doc.text(noteLines, margin + 6, y + 4.5);
    y += 5 + noteLines.length * 4.5;
  }
  y += 3;

  // Recommendations & Red Flag Checklist
  ensureSpace(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Recommended Next Steps', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const rec of scan.analysis.recommendations) {
    ensureSpace(10);
    const lines = doc.splitTextToSize(`- ${rec}`, contentWidth - 4);
    doc.text(lines, margin + 2, y);
    y += lines.length * 4.6 + 1.5;
  }

  // Disclaimer Footer
  ensureSpace(20);
  y += 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'Medical Disclaimer: SkinSense provides AI-assisted visual skin screening and longitudinal documentation. It is not a medical diagnosis and does not replace evaluation by a licensed dermatologist or healthcare professional.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth), margin, y);

  doc.save(`SkinSense-Report-${scan.id}.pdf`);
}

export async function generateComparisonPdfReport(
  comparison: LongitudinalComparison,
  prevScan: SkinScanRecord,
  currScan: SkinScanRecord,
  longitudinalUrl?: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SkinSense Longitudinal Comparison Report', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Case: ${comparison.caseTitle}  |  Status: ${comparison.progressionStatus.toUpperCase()}  |  Confidence: ${comparison.confidenceScore}%`,
    margin,
    21
  );

  y = 36;
  doc.setTextColor(15, 23, 42);

  if (longitudinalUrl) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Longitudinal Case URL:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(13, 148, 136);
    doc.text(longitudinalUrl.slice(0, 82), margin + 40, y);
    doc.setTextColor(15, 23, 42);
    y += 8;
  }

  // Side-by-side images
  const prevJpeg = await imageSrcToJpegDataUrl(prevScan.imageDataUrl);
  const currJpeg = await imageSrcToJpegDataUrl(currScan.imageDataUrl);
  const boxW = (contentWidth - 8) / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Previous Baseline (${new Date(prevScan.createdAt).toLocaleDateString()})`, margin, y);
  doc.text(`Current Follow-Up (${new Date(currScan.createdAt).toLocaleDateString()})`, margin + boxW + 8, y);
  y += 3;

  if (prevJpeg) {
    doc.addImage(prevJpeg, 'JPEG', margin, y, boxW, 60);
    doc.rect(margin, y, boxW, 60);
  }
  if (currJpeg) {
    doc.addImage(currJpeg, 'JPEG', margin + boxW + 8, y, boxW, 60);
    doc.rect(margin + boxW + 8, y, boxW, 60);
  }
  y += 67;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Baseline: ${prevScan.analysis.primaryCondition} (${prevScan.analysis.confidenceScore}%)`, margin, y);
  doc.text(`Current: ${currScan.analysis.primaryCondition} (${currScan.analysis.confidenceScore}%)`, margin + boxW + 8, y);
  y += 10;

  // Problem Checking Message
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(13, 148, 136);
  const probLines = doc.splitTextToSize(comparison.problemCheckingMessage, contentWidth - 8);
  const boxH = 12 + probLines.length * 4.8;
  doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(13, 148, 136);
  doc.text(`PROGRESSION PROBLEM CHECKING MESSAGE (${comparison.progressionStatus.toUpperCase()})`, margin + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(probLines, margin + 4, y + 12);
  y += boxH + 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Interval Change Analysis', margin, y);
  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const sumLines = doc.splitTextToSize(comparison.changeSummary, contentWidth);
  doc.text(sumLines, margin, y);
  y += sumLines.length * 4.8 + 6;

  const deltaEntries = [
    ['Size & Area', comparison.visualDeltas.sizeAndArea],
    ['Border Evolution', comparison.visualDeltas.borderEvolution],
    ['Pigmentation Shift', comparison.visualDeltas.pigmentationShift],
    ['Inflammation Change', comparison.visualDeltas.inflammationChange],
  ];
  for (const [k, v] of deltaEntries) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${k}:`, margin, y);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(v, contentWidth - 42);
    doc.text(lines, margin + 40, y);
    y += Math.max(6, lines.length * 4.8);
  }
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Recommended Clinical Next Steps', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const step of comparison.clinicalNextSteps) {
    const lines = doc.splitTextToSize(`- ${step}`, contentWidth - 4);
    doc.text(lines, margin + 2, y);
    y += lines.length * 4.6 + 1.5;
  }

  doc.save(`SkinSense-Comparison-${comparison.id}.pdf`);
}

export async function generateCasePdfReport(
  lesionCase: LesionCase,
  caseScans: SkinScanRecord[],
  caseComparisons: LongitudinalComparison[],
  longitudinalUrl?: string,
  patientName?: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 274) {
      doc.addPage();
      y = 18;
    }
  };

  const sortedScans = [...caseScans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const sortedComparisons = [...caseComparisons].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SkinSense Lesion Case Clinical Report', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Case ID: ${lesionCase.id}  |  Generated: ${new Date().toLocaleString()}`,
    margin,
    21
  );

  y = 36;
  doc.setTextColor(15, 23, 42);

  // Case Overview Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  const metaHeight = longitudinalUrl ? 30 : 24;
  doc.roundedRect(margin, y, contentWidth, metaHeight, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Lesion Case:', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(`${lesionCase.title} (${lesionCase.bodyLocation})`, margin + 30, y + 7);

  if (patientName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Account:', margin + 108, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(patientName.slice(0, 32), margin + 125, y + 7);
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Records:', margin + 4, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${sortedScans.length} Chronological Scan${sortedScans.length === 1 ? '' : 's'} · ${sortedComparisons.length} Comparison${sortedComparisons.length === 1 ? '' : 's'}`,
    margin + 30,
    y + 14
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Last Updated:', margin + 108, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(lesionCase.updatedAt).toLocaleDateString(), margin + 132, y + 14);

  if (longitudinalUrl) {
    doc.setFont('helvetica', 'bold');
    doc.text('Longitudinal URL:', margin + 4, y + 21.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(13, 148, 136);
    doc.text(longitudinalUrl.slice(0, 76), margin + 36, y + 21.5);
    doc.setTextColor(15, 23, 42);
  }

  y += metaHeight + 8;

  // Section 1: Scan Details & Clinical Notes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Chronological Scan Details & Clinical Notes', margin, y);
  y += 6;

  if (sortedScans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No scans recorded under this lesion case yet.', margin, y);
    y += 8;
  } else {
    for (let i = 0; i < sortedScans.length; i++) {
      const scan = sortedScans[i];
      ensureSpace(64);

      doc.setDrawColor(203, 213, 225);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136);
      doc.text(
        `Visit #${i + 1} · ${new Date(scan.createdAt).toLocaleString()} (Scan ID: ${scan.id})`,
        margin,
        y
      );
      y += 5;

      const jpeg = await imageSrcToJpegDataUrl(scan.imageDataUrl);
      const thumbSize = 36;
      if (jpeg) {
        doc.addImage(jpeg, 'JPEG', margin, y, thumbSize, thumbSize);
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, y, thumbSize, thumbSize);
      }

      const infoX = margin + thumbSize + 6;
      const infoW = contentWidth - thumbSize - 6;

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const condLines = doc.splitTextToSize(scan.analysis.primaryCondition, infoW);
      doc.text(condLines, infoX, y + 4.5);

      let infoY = y + 5 + condLines.length * 4.8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Confidence: ${scan.analysis.confidenceScore}% (±${scan.analysis.uncertaintyMargin}%)  |  Severity: ${scan.analysis.severityLevel.toUpperCase()}`,
        infoX,
        infoY
      );
      infoY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const visitSession = scan.metadata?.sessionDurationSeconds
        ? ` · Session ${formatDurationLabel(scan.metadata.sessionDurationSeconds)}`
        : '';
      doc.text(
        `Image Quality: ${scan.qualityMetrics.overallScore}/100 (${scan.qualityMetrics.status.toUpperCase()}) · Sharpness ${scan.qualityMetrics.sharpnessScore} · Light ${scan.qualityMetrics.brightnessScore} · Contrast ${scan.qualityMetrics.contrastScore}${visitSession}`,
        infoX,
        infoY
      );
      infoY += 5.5;

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('Symptoms & Custom Notes:', infoX, infoY);
      infoY += 4.5;
      doc.setFont('helvetica', 'normal');
      const combinedNotes = [
        scan.symptoms?.trim(),
        scan.customNotes?.trim() ? `Note: ${scan.customNotes.trim()}` : '',
        scan.tags && scan.tags.length > 0 ? `Tags: ${scan.tags.join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const symptomText = combinedNotes || 'No patient symptoms or custom notes recorded.';
      const symptomLines = doc.splitTextToSize(symptomText, infoW);
      doc.text(symptomLines, infoX, infoY);

      y = Math.max(y + thumbSize, infoY + symptomLines.length * 4.4) + 5;

      // Clinical Summary & Problem Checking Message
      ensureSpace(26);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Problem Checking Message:', margin, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      const probLines = doc.splitTextToSize(scan.analysis.problemCheckingMessage, contentWidth);
      doc.text(probLines, margin, y);
      y += probLines.length * 4.4 + 3;

      ensureSpace(20);
      doc.setFont('helvetica', 'bold');
      doc.text('Clinical Summary:', margin, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      const sumLines = doc.splitTextToSize(scan.analysis.clinicalSummary, contentWidth);
      doc.text(sumLines, margin, y);
      y += sumLines.length * 4.4 + 3;

      if (scan.analysis.recommendations.length > 0) {
        ensureSpace(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Care Recommendations:', margin, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        for (const rec of scan.analysis.recommendations) {
          ensureSpace(8);
          const rLines = doc.splitTextToSize(`- ${rec}`, contentWidth - 4);
          doc.text(rLines, margin + 2, y);
          y += rLines.length * 4.3 + 1;
        }
      }
      y += 5;
    }
  }

  // Section 2: Comparison Insights
  ensureSpace(28);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Longitudinal Comparison Insights', margin, y);
  y += 6;

  if (sortedComparisons.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'No longitudinal comparisons have been run for this lesion case yet. Use the Compare tab to analyze interval changes between scans.',
      margin,
      y,
      { maxWidth: contentWidth }
    );
    y += 12;
  } else {
    for (let idx = 0; idx < sortedComparisons.length; idx++) {
      const cmp = sortedComparisons[idx];
      ensureSpace(48);

      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      const summaryLines = doc.splitTextToSize(cmp.changeSummary, contentWidth - 8);
      const probLines = doc.splitTextToSize(cmp.problemCheckingMessage, contentWidth - 8);
      const cardHeaderH = 18 + summaryLines.length * 4.4 + probLines.length * 4.4;
      doc.roundedRect(margin, y, contentWidth, cardHeaderH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136);
      doc.text(
        `Comparison #${idx + 1} · Status: ${cmp.progressionStatus.toUpperCase()} · Confidence ${cmp.confidenceScore}%`,
        margin + 4,
        y + 6.5
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Compared on ${new Date(cmp.createdAt).toLocaleString()} (Baseline ${cmp.previousScanId} -> Current ${cmp.currentScanId})`,
        margin + 4,
        y + 11.5
      );

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(summaryLines, margin + 4, y + 17);
      const probY = y + 17 + summaryLines.length * 4.4 + 2;
      doc.setFont('helvetica', 'bold');
      doc.text(probLines, margin + 4, probY);

      y += cardHeaderH + 5;

      const deltaItems = [
        ['Size & Area', cmp.visualDeltas.sizeAndArea],
        ['Border Evolution', cmp.visualDeltas.borderEvolution],
        ['Pigmentation Shift', cmp.visualDeltas.pigmentationShift],
        ['Inflammation Change', cmp.visualDeltas.inflammationChange],
      ];
      for (const [label, val] of deltaItems) {
        ensureSpace(9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${label}:`, margin + 2, y);
        doc.setFont('helvetica', 'normal');
        const vLines = doc.splitTextToSize(val, contentWidth - 44);
        doc.text(vLines, margin + 42, y);
        y += Math.max(5.2, vLines.length * 4.4);
      }

      if (cmp.clinicalNextSteps.length > 0) {
        ensureSpace(14);
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Clinical Next Steps:', margin + 2, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        for (const step of cmp.clinicalNextSteps) {
          ensureSpace(8);
          const sLines = doc.splitTextToSize(`- ${step}`, contentWidth - 8);
          doc.text(sLines, margin + 4, y);
          y += sLines.length * 4.3 + 1;
        }
      }
      y += 6;
    }
  }

  // Disclaimer Footer
  ensureSpace(18);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'Medical Disclaimer: SkinSense provides AI-assisted visual skin screening and longitudinal documentation. It is not a medical diagnosis and does not replace evaluation by a licensed dermatologist or healthcare professional.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth), margin, y);

  doc.save(`SkinSense-Case-${lesionCase.id}.pdf`);
}

export async function generateMonthlySummaryPdfReport(params: {
  monthKey: string;
  monthLabel: string;
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  cases: LesionCase[];
  patientName?: string;
  patientEmail?: string;
}): Promise<void> {
  const { monthKey, monthLabel, scans, comparisons, cases, patientName, patientEmail } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 274) {
      doc.addPage();
      y = 18;
    }
  };

  const sortedScans = [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const sortedComparisons = [...comparisons].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SkinSense Monthly Clinical Summary Report', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Period: ${monthLabel} (${monthKey})  |  Generated: ${new Date().toLocaleString()}`,
    margin,
    21
  );

  y = 36;
  doc.setTextColor(15, 23, 42);

  // Aggregate Monthly Metrics
  const uniqueCaseIds = new Set<string>([
    ...sortedScans.map((s) => s.caseId),
    ...sortedComparisons.map((c) => c.caseId),
  ]);
  const caseMap = new Map(cases.map((c) => [c.id, c]));

  const routineCount = sortedScans.filter((s) => s.analysis.severityLevel === 'routine').length;
  const monitorCount = sortedScans.filter((s) => s.analysis.severityLevel === 'monitor').length;
  const urgentCount = sortedScans.filter((s) => s.analysis.severityLevel === 'urgent').length;

  const avgConfidence =
    sortedScans.length > 0
      ? Math.round(
          sortedScans.reduce((acc, s) => acc + s.analysis.confidenceScore, 0) / sortedScans.length
        )
      : 0;
  const avgQuality =
    sortedScans.length > 0
      ? Math.round(
          sortedScans.reduce((acc, s) => acc + s.qualityMetrics.overallScore, 0) / sortedScans.length
        )
      : 0;

  const trendCounts = {
    improving: sortedComparisons.filter((c) => c.progressionStatus === 'improving').length,
    stable: sortedComparisons.filter((c) => c.progressionStatus === 'stable').length,
    evolving: sortedComparisons.filter((c) => c.progressionStatus === 'evolving').length,
    worsening: sortedComparisons.filter((c) => c.progressionStatus === 'worsening').length,
  };

  // Executive Monthly Summary Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 34, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Patient / Account:', margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  const accountLabel = [patientName, patientEmail].filter(Boolean).join(' · ') || 'SkinSense User';
  doc.text(accountLabel.slice(0, 68), margin + 36, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.text('Monthly Volume:', margin + 4, y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${sortedScans.length} Scan${sortedScans.length === 1 ? '' : 's'} · ${uniqueCaseIds.size} Lesion Case${uniqueCaseIds.size === 1 ? '' : 's'} · ${sortedComparisons.length} Longitudinal Comparison${sortedComparisons.length === 1 ? '' : 's'}`,
    margin + 36,
    y + 13.5
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Severity Mix:', margin + 4, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Routine: ${routineCount}  |  Monitor: ${monitorCount}  |  Urgent: ${urgentCount}  |  Avg Confidence: ${avgConfidence}%  |  Avg Quality: ${avgQuality}/100`,
    margin + 36,
    y + 20
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Comparison Trends:', margin + 4, y + 26.5);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Improving: ${trendCounts.improving}  |  Stable: ${trendCounts.stable}  |  Evolving: ${trendCounts.evolving}  |  Worsening: ${trendCounts.worsening}`,
    margin + 36,
    y + 26.5
  );

  y += 42;

  // Section 1: Consolidated Scan Findings & Notes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`1. Scan Findings & Clinical Notes (${monthLabel})`, margin, y);
  y += 6;

  if (sortedScans.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`No dermatological scans were recorded in ${monthLabel}.`, margin, y);
    y += 10;
  } else {
    for (let i = 0; i < sortedScans.length; i++) {
      const scan = sortedScans[i];
      ensureSpace(64);

      doc.setDrawColor(203, 213, 225);
      doc.line(margin, y, pageWidth - margin, y);
      y += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136);
      doc.text(
        `Scan #${i + 1} · ${new Date(scan.createdAt).toLocaleString()} · ${scan.caseTitle} (${scan.bodyLocation})`,
        margin,
        y
      );
      y += 5;

      const jpeg = await imageSrcToJpegDataUrl(scan.imageDataUrl);
      const thumbSize = 34;
      if (jpeg) {
        doc.addImage(jpeg, 'JPEG', margin, y, thumbSize, thumbSize);
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, y, thumbSize, thumbSize);
      }

      const infoX = margin + thumbSize + 6;
      const infoW = contentWidth - thumbSize - 6;

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const condLines = doc.splitTextToSize(scan.analysis.primaryCondition, infoW);
      doc.text(condLines, infoX, y + 4.5);

      let infoY = y + 5 + condLines.length * 4.8;
      doc.setFontSize(9);
      const monthlyVisitSession = scan.metadata?.sessionDurationSeconds
        ? `  |  Session: ${formatDurationLabel(scan.metadata.sessionDurationSeconds)}`
        : '';
      doc.text(
        `Confidence: ${scan.analysis.confidenceScore}% (±${scan.analysis.uncertaintyMargin}%)  |  Severity: ${scan.analysis.severityLevel.toUpperCase()}  |  Quality: ${scan.qualityMetrics.overallScore}/100${monthlyVisitSession}`,
        infoX,
        infoY
      );
      infoY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const notesLine = [
        scan.symptoms?.trim() ? `Symptoms: ${scan.symptoms.trim()}` : '',
        scan.customNotes?.trim() ? `Clinical Note: ${scan.customNotes.trim()}` : '',
        scan.tags && scan.tags.length > 0 ? `Tags: ${scan.tags.join(' · ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      const noteText = notesLine || 'No patient symptoms or custom clinical notes recorded.';
      const noteLines = doc.splitTextToSize(noteText, infoW);
      doc.text(noteLines, infoX, infoY);

      y = Math.max(y + thumbSize, infoY + noteLines.length * 4.4) + 4.5;

      ensureSpace(22);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Problem Checking Message:', margin, y);
      y += 4.3;
      doc.setFont('helvetica', 'normal');
      const probLines = doc.splitTextToSize(scan.analysis.problemCheckingMessage, contentWidth);
      doc.text(probLines, margin, y);
      y += probLines.length * 4.3 + 2.5;

      ensureSpace(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Clinical Summary:', margin, y);
      y += 4.3;
      doc.setFont('helvetica', 'normal');
      const sumLines = doc.splitTextToSize(scan.analysis.clinicalSummary, contentWidth);
      doc.text(sumLines, margin, y);
      y += sumLines.length * 4.3 + 5;
    }
  }

  // Section 2: Monthly Comparison Trends & Insights
  ensureSpace(28);
  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`2. Longitudinal Comparison Trends (${monthLabel})`, margin, y);
  y += 6;

  if (sortedComparisons.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `No longitudinal image comparisons were recorded in ${monthLabel}.`,
      margin,
      y
    );
    y += 10;
  } else {
    for (let idx = 0; idx < sortedComparisons.length; idx++) {
      const cmp = sortedComparisons[idx];
      const parentCase = caseMap.get(cmp.caseId);
      ensureSpace(46);

      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(248, 250, 252);
      const summaryLines = doc.splitTextToSize(cmp.changeSummary, contentWidth - 8);
      const probLines = doc.splitTextToSize(cmp.problemCheckingMessage, contentWidth - 8);
      const boxH = 18 + summaryLines.length * 4.4 + probLines.length * 4.4;
      doc.roundedRect(margin, y, contentWidth, boxH, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(13, 148, 136);
      doc.text(
        `Comparison #${idx + 1} · ${cmp.caseTitle}${parentCase ? ` (${parentCase.bodyLocation})` : ''} · ${cmp.progressionStatus.toUpperCase()} (${cmp.confidenceScore}%)`,
        margin + 4,
        y + 6.5
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Recorded ${new Date(cmp.createdAt).toLocaleString()} (Baseline ${cmp.previousScanId} -> Current ${cmp.currentScanId})`,
        margin + 4,
        y + 11.5
      );

      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(summaryLines, margin + 4, y + 17);
      const probY = y + 17 + summaryLines.length * 4.4 + 2;
      doc.setFont('helvetica', 'bold');
      doc.text(probLines, margin + 4, probY);

      y += boxH + 4.5;

      const deltaItems = [
        ['Size & Area', cmp.visualDeltas.sizeAndArea],
        ['Border Evolution', cmp.visualDeltas.borderEvolution],
        ['Pigmentation Shift', cmp.visualDeltas.pigmentationShift],
        ['Inflammation Change', cmp.visualDeltas.inflammationChange],
      ];
      for (const [label, val] of deltaItems) {
        ensureSpace(9);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${label}:`, margin + 2, y);
        doc.setFont('helvetica', 'normal');
        const vLines = doc.splitTextToSize(val, contentWidth - 44);
        doc.text(vLines, margin + 42, y);
        y += Math.max(5.2, vLines.length * 4.4);
      }

      if (cmp.clinicalNextSteps.length > 0) {
        ensureSpace(14);
        y += 2;
        doc.setFont('helvetica', 'bold');
        doc.text('Clinical Next Steps:', margin + 2, y);
        y += 4.5;
        doc.setFont('helvetica', 'normal');
        for (const step of cmp.clinicalNextSteps) {
          ensureSpace(8);
          const sLines = doc.splitTextToSize(`- ${step}`, contentWidth - 8);
          doc.text(sLines, margin + 4, y);
          y += sLines.length * 4.3 + 1;
        }
      }
      y += 5;
    }
  }

  // Disclaimer Footer
  ensureSpace(18);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'Medical Disclaimer: SkinSense provides AI-assisted visual skin screening and longitudinal documentation. It is not a medical diagnosis and does not replace evaluation by a licensed dermatologist or healthcare professional.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth), margin, y);

  doc.save(`SkinSense-Monthly-Summary-${monthKey}.pdf`);
}

function renderConfidenceChartDataUrl(scans: SkinScanRecord[]): string | null {
  if (scans.length === 0) return null;
  const width = 560;
  const height = 250;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 34, right: 20, bottom: 38, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Title
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
  ctx.fillText('Confidence & Uncertainty Progression (%)', margin.left, 20);

  // Horizontal grid lines
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  ctx.font = '10px Courier, monospace';
  ctx.fillStyle = '#64748B';
  for (const tick of [0, 25, 50, 75, 100]) {
    const y = margin.top + innerH - (tick / 100) * innerH;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(margin.left, y);
    ctx.lineTo(margin.left + innerW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'right';
    ctx.fillText(`${tick}%`, margin.left - 6, y + 3);
  }

  const pts = scans.map((s, idx) => {
    const x =
      scans.length === 1
        ? margin.left + innerW / 2
        : margin.left + (idx / (scans.length - 1)) * innerW;
    const c = s.analysis.confidenceScore;
    const m = s.analysis.uncertaintyMargin;
    const y = margin.top + innerH - (c / 100) * innerH;
    const yTop = margin.top + innerH - (Math.min(100, c + m) / 100) * innerH;
    const yBot = margin.top + innerH - (Math.max(0, c - m) / 100) * innerH;
    return { x, y, yTop, yBot, scan: s };
  });

  // Uncertainty band
  if (pts.length >= 2) {
    ctx.fillStyle = 'rgba(15, 118, 110, 0.14)';
    ctx.beginPath();
    pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.yTop) : ctx.lineTo(p.x, p.yTop)));
    for (let i = pts.length - 1; i >= 0; i--) {
      ctx.lineTo(pts[i].x, pts[i].yBot);
    }
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = '#0F766E';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }

  // Nodes + labels
  for (const p of pts) {
    const sev = p.scan.analysis.severityLevel;
    ctx.fillStyle = sev === 'urgent' ? '#DC2626' : sev === 'monitor' ? '#D97706' : '#0F766E';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 10px Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${p.scan.analysis.confidenceScore}%`, p.x, p.y - 10);

    ctx.fillStyle = '#64748B';
    ctx.font = '10px Courier, monospace';
    const dStr = new Date(p.scan.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    ctx.fillText(dStr, p.x, height - 14);
  }

  return canvas.toDataURL('image/png');
}

function renderComparisonOrQualityChartDataUrl(
  comparisons: LongitudinalComparison[],
  latestQuality?: ImageQualityMetrics | null
): string | null {
  const width = 560;
  const height = 250;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 34, right: 20, bottom: 38, left: 48 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  if (comparisons.length > 0) {
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
    ctx.fillText('Longitudinal Comparison Trajectory & Confidence', margin.left, 20);

    const statusColor: Record<string, string> = {
      improving: '#16A34A',
      stable: '#0F766E',
      evolving: '#D97706',
      worsening: '#DC2626',
    };

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.font = '10px Courier, monospace';
    ctx.fillStyle = '#64748B';
    for (const tick of [0, 50, 100]) {
      const y = margin.top + innerH - (tick / 100) * innerH;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + innerW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(`${tick}%`, margin.left - 6, y + 3);
    }

    const slotW = innerW / comparisons.length;
    const barW = Math.min(54, slotW * 0.55);

    comparisons.forEach((cmp, idx) => {
      const cx = margin.left + slotW * idx + slotW / 2;
      const barH = Math.max(8, (cmp.confidenceScore / 100) * innerH);
      const y = margin.top + innerH - barH;
      ctx.fillStyle = statusColor[cmp.progressionStatus] || '#0F766E';
      ctx.fillRect(cx - barW / 2, y, barW, barH);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 10px Courier, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${cmp.confidenceScore}% (${cmp.progressionStatus.toUpperCase()})`, cx, y - 6);

      ctx.fillStyle = '#64748B';
      ctx.font = '10px Courier, monospace';
      const dStr = new Date(cmp.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      ctx.fillText(dStr, cx, height - 14);
    });
  } else if (latestQuality) {
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 13px Helvetica, Arial, sans-serif';
    ctx.fillText('Pre-Scan & Latest Image Quality Telemetry', margin.left, 20);

    const bars = [
      { label: 'Overall', val: latestQuality.overallScore, color: '#0F766E' },
      { label: 'Sharpness', val: latestQuality.sharpnessScore, color: '#0D9488' },
      { label: 'Light', val: latestQuality.brightnessScore, color: '#4338CA' },
      { label: 'Contrast', val: latestQuality.contrastScore, color: '#0369A1' },
    ];

    ctx.strokeStyle = '#E2E8F0';
    ctx.font = '10px Courier, monospace';
    ctx.fillStyle = '#64748B';
    for (const tick of [0, 50, 100]) {
      const y = margin.top + innerH - (tick / 100) * innerH;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + innerW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(`${tick}`, margin.left - 6, y + 3);
    }

    const slotW = innerW / bars.length;
    const barW = Math.min(54, slotW * 0.55);
    bars.forEach((b, idx) => {
      const cx = margin.left + slotW * idx + slotW / 2;
      const barH = Math.max(8, (b.val / 100) * innerH);
      const y = margin.top + innerH - barH;
      ctx.fillStyle = b.color;
      ctx.fillRect(cx - barW / 2, y, barW, barH);

      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 10px Courier, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${b.val}/100`, cx, y - 6);

      ctx.fillStyle = '#475569';
      ctx.fillText(b.label, cx, height - 14);
    });
  } else {
    return null;
  }

  return canvas.toDataURL('image/png');
}

export async function generateAnalyzeClinicalSummaryPdf(params: {
  lesionCase: LesionCase | null;
  caseTitle: string;
  bodyLocation: string;
  patientName?: string;
  patientEmail?: string;
  longitudinalUrl?: string;
  latestScan: SkinScanRecord | null;
  caseScans: SkinScanRecord[];
  caseComparisons: LongitudinalComparison[];
  previewImageUrl?: string | null;
  previewMetrics?: ImageQualityMetrics | null;
  symptoms?: string;
  customNotes?: string;
  tags?: string[];
  sessionDurationSeconds?: number;
  geminiSummaryParagraph: string;
}): Promise<void> {
  const {
    lesionCase,
    caseTitle,
    bodyLocation,
    patientName,
    patientEmail,
    longitudinalUrl,
    latestScan,
    caseScans,
    caseComparisons,
    previewImageUrl,
    previewMetrics,
    symptoms,
    customNotes,
    tags,
    sessionDurationSeconds,
    geminiSummaryParagraph,
  } = params;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > 274) {
      doc.addPage();
      y = 18;
    }
  };

  const sortedScans = [...caseScans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const sortedComparisons = [...caseComparisons].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  // Header Band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.text('SkinSense Lesion Clinical Summary', margin, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Case: ${lesionCase?.id || 'Unassigned Draft'}  |  Generated: ${new Date().toLocaleString()}`,
    margin,
    21
  );

  y = 35;
  doc.setTextColor(15, 23, 42);

  // Lesion Metadata Box
  const activeTags = tags && tags.length > 0 ? tags : latestScan?.tags || [];
  const activeSymptoms = (symptoms || latestScan?.symptoms || '').trim();
  const activeNotes = (customNotes || latestScan?.customNotes || '').trim();
  const displayDuration = sessionDurationSeconds ?? latestScan?.metadata?.sessionDurationSeconds;

  const metaLines: string[] = [];
  if (activeTags.length > 0) metaLines.push(`Tags: ${activeTags.join(' · ')}`);
  if (activeSymptoms) metaLines.push(`Symptoms: ${activeSymptoms}`);
  if (activeNotes) metaLines.push(`Clinical Notes: ${activeNotes}`);
  const wrappedMetaExtra =
    metaLines.length > 0 ? doc.splitTextToSize(metaLines.join('  |  '), contentWidth - 8) : [];

  const metaBoxH = 26 + (longitudinalUrl ? 6 : 0) + wrappedMetaExtra.length * 4.4;
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, metaBoxH, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Lesion Case:', margin + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${caseTitle} (${bodyLocation})`, margin + 30, y + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.text('Patient:', margin + 108, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(([patientName, patientEmail].filter(Boolean).join(' · ') || 'SkinSense User').slice(0, 34), margin + 124, y + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.text('History Volume:', margin + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${sortedScans.length} Scan${sortedScans.length === 1 ? '' : 's'} · ${sortedComparisons.length} Comparison${sortedComparisons.length === 1 ? '' : 's'}`,
    margin + 32,
    y + 13
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Session Time:', margin + 108, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDurationLabel(displayDuration), margin + 133, y + 13);

  let nextMetaY = y + 19.5;
  if (longitudinalUrl) {
    doc.setFont('helvetica', 'bold');
    doc.text('Longitudinal URL:', margin + 4, nextMetaY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(13, 148, 136);
    doc.text(longitudinalUrl.slice(0, 76), margin + 36, nextMetaY);
    doc.setTextColor(15, 23, 42);
    nextMetaY += 6;
  }

  if (wrappedMetaExtra.length > 0) {
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(wrappedMetaExtra, margin + 4, nextMetaY);
    doc.setTextColor(15, 23, 42);
  }

  y += metaBoxH + 7;

  // Gemini AI Executive Clinical Summary Box
  doc.setFontSize(9.5);
  const summaryLines = doc.splitTextToSize(geminiSummaryParagraph, contentWidth - 10);
  const geminiBoxH = 14 + summaryLines.length * 4.7;
  ensureSpace(geminiBoxH + 8);
  doc.setDrawColor(15, 118, 110);
  doc.setFillColor(240, 253, 250);
  doc.roundedRect(margin, y, contentWidth, geminiBoxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110);
  doc.text('AI CLINICAL SYNTHESIS (GENERATED BY GEMINI)', margin + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(summaryLines, margin + 5, y + 13);

  y += geminiBoxH + 8;

  // Latest Scan Metrics Section
  ensureSpace(58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Latest Scan Metrics & Visual Capture', margin, y);
  y += 5;

  const thumbUrl = latestScan?.imageDataUrl || previewImageUrl || null;
  const jpegData = thumbUrl ? await imageSrcToJpegDataUrl(thumbUrl) : null;
  const imgSize = 44;
  if (jpegData) {
    doc.addImage(jpegData, 'JPEG', margin, y, imgSize, imgSize);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, imgSize, imgSize);
  }

  const metricX = jpegData ? margin + imgSize + 6 : margin;
  const metricW = jpegData ? contentWidth - imgSize - 6 : contentWidth;

  if (latestScan) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const titleLines = doc.splitTextToSize(latestScan.analysis.primaryCondition, metricW);
    doc.text(titleLines, metricX, y + 5);

    let my = y + 6 + titleLines.length * 5;
    doc.setFontSize(9.5);
    doc.text(
      `Confidence: ${latestScan.analysis.confidenceScore}% (±${latestScan.analysis.uncertaintyMargin}%)  |  Severity: ${latestScan.analysis.severityLevel.toUpperCase()}`,
      metricX,
      my
    );
    my += 5.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Image Quality: ${latestScan.qualityMetrics.overallScore}/100 (${latestScan.qualityMetrics.status.toUpperCase()}) · Sharpness ${latestScan.qualityMetrics.sharpnessScore} · Light ${latestScan.qualityMetrics.brightnessScore} · Contrast ${latestScan.qualityMetrics.contrastScore}`,
      metricX,
      my
    );
    my += 5.5;

    doc.setTextColor(15, 23, 42);
    const pcLines = doc.splitTextToSize(
      `Triage Note: ${latestScan.analysis.problemCheckingMessage}`,
      metricW
    );
    doc.text(pcLines, metricX, my);
    y = Math.max(y + imgSize, my + pcLines.length * 4.4) + 6;

    // Compact Morphology Grid
    ensureSpace(24);
    const morphSummary = [
      `Asymmetry: ${latestScan.analysis.morphology.asymmetry}`,
      `Border: ${latestScan.analysis.morphology.borderRegularity}`,
      `Color: ${latestScan.analysis.morphology.colorVariation}`,
      `Erythema: ${latestScan.analysis.morphology.erythemaLevel}`,
      `Texture: ${latestScan.analysis.morphology.surfaceTexture}`,
    ].join('  |  ');
    const morphLines = doc.splitTextToSize(morphSummary, contentWidth - 8);
    const morphBoxH = 8 + morphLines.length * 4.3;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, morphBoxH, 2, 2, 'FD');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(morphLines, margin + 4, y + 6);
    y += morphBoxH + 7;
  } else if (previewMetrics) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Pre-Analysis Image Quality Check (Screening Pending)', metricX, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Quality: ${previewMetrics.overallScore}/100 (${previewMetrics.status.toUpperCase()}) · Sharpness ${previewMetrics.sharpnessScore} · Light ${previewMetrics.brightnessScore} · Contrast ${previewMetrics.contrastScore}`,
      metricX,
      y + 12
    );
    const msgLines = doc.splitTextToSize(previewMetrics.problemCheckingMessage, metricW);
    doc.text(msgLines, metricX, y + 18);
    y = Math.max(y + imgSize, y + 18 + msgLines.length * 4.4) + 7;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text('No completed screening scan metrics recorded for this lesion yet.', metricX, y + 6);
    y += 16;
  }

  // Longitudinal Progression Charts Section
  const chart1Url = renderConfidenceChartDataUrl(sortedScans);
  const chart2Url = renderComparisonOrQualityChartDataUrl(
    sortedComparisons,
    latestScan?.qualityMetrics || previewMetrics || null
  );

  if (chart1Url || chart2Url) {
    ensureSpace(64);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Historical Progression & Telemetry Charts', margin, y);
    y += 5;

    const chartGap = 6;
    const chartW = chart1Url && chart2Url ? (contentWidth - chartGap) / 2 : contentWidth;
    const chartH = chart1Url && chart2Url ? 39 : 52;

    if (chart1Url) {
      doc.addImage(chart1Url, 'PNG', margin, y, chartW, chartH);
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, chartW, chartH);
    }
    if (chart2Url) {
      const x2 = chart1Url ? margin + chartW + chartGap : margin;
      doc.addImage(chart2Url, 'PNG', x2, y, chartW, chartH);
      doc.setDrawColor(226, 232, 240);
      doc.rect(x2, y, chartW, chartH);
    }
    y += chartH + 8;
  }

  // Disclaimer Footer
  ensureSpace(18);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'Medical Disclaimer: SkinSense provides AI-assisted visual skin screening and longitudinal documentation. It is not a medical diagnosis and does not replace evaluation by a licensed dermatologist or healthcare professional.';
  doc.text(doc.splitTextToSize(disclaimer, contentWidth), margin, y);

  const safeSlug = caseTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`SkinSense-Clinical-Summary-${safeSlug || 'lesion'}-${dateStamp}.pdf`);
}



