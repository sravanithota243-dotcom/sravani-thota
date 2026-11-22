import { Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}

export function CameraCaptureModal({ isOpen, onClose, onCapture }: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setCameraError(null);
    setIsReady(false);

    async function startCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Camera access is not supported in this browser context.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (err) {
        setCameraError(
          err instanceof Error
            ? `Camera permission or hardware error: ${err.message}`
            : 'Unable to access camera. Please allow camera permissions or upload an image file.'
        );
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !isReady) return;
    const width = video.videoWidth || 1024;
    const height = video.videoHeight || 768;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    onCapture(dataUrl);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Camera Lesion Capture"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">Live Dermatological Camera Capture</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Center the skin region inside the reticle at 10–15 cm under bright indirect lighting
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative bg-slate-950 aspect-[4/3] flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center max-w-md">
              <p className="text-sm text-rose-300 font-medium">{cameraError}</p>
              <p className="text-xs text-slate-400 mt-2">
                You can close this modal and upload an existing photograph from your device instead.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Precision Alignment Reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-52 h-52 rounded-full border-2 border-teal-400/80 border-dashed flex items-center justify-center">
                  <div className="w-4 h-4 border border-teal-300/80 rounded-full" />
                </div>
              </div>
              <div className="pointer-events-none absolute bottom-3 left-3 bg-slate-950/70 text-slate-100 text-xs px-3 py-1.5 rounded-md font-mono">
                Focus Target · Even Lighting · Avoid Flash Glare
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
            className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Switch Camera</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCaptureFrame}
              disabled={!isReady || Boolean(cameraError)}
              className="px-5 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>Capture Frame</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
