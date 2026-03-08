"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { useApp } from "@/contexts/AppContext";

interface DocumentScannerProps {
  isOpen: boolean;
  onCapture: (file: File) => void;
  onPickFiles: () => void;
  onClose: () => void;
}

type ScanState = "scanning" | "stabilizing" | "captured";

export default function DocumentScanner({
  isOpen,
  onCapture,
  onPickFiles,
  onClose,
}: DocumentScannerProps) {
  const { t } = useApp();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const stableStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [stabilityPercent, setStabilityPercent] = useState(0);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const STABILITY_THRESHOLD = 12; // pixel diff threshold
  const STABILITY_DURATION = 1200; // ms to hold stable before capture
  const SHARPNESS_MIN = 15; // minimum Laplacian variance for "in focus"
  const SAMPLE_SIZE = 120; // downscaled analysis resolution

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    prevFrameRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setScanState("scanning");
    setCapturedPreview(null);
    setCapturedBlob(null);
    setCameraError(null);
    setStabilityPercent(0);
    prevFrameRef.current = null;
    stableStartRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      // Camera not available (HTTP or denied) — go straight to file picker
      onPickFiles();
      onClose();
    }
  }, [onPickFiles, onClose]);

  useEffect(() => {
    if (isOpen) {
      // Check if getUserMedia is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices?.getUserMedia) {
        onPickFiles();
        onClose();
        return;
      }
      startCamera();
    } else {
      stopCamera();
    }
    return stopCamera;
  }, [isOpen, startCamera, stopCamera]);

  // Compute Laplacian variance (sharpness measure)
  const computeSharpness = (gray: Uint8ClampedArray, w: number, h: number): number => {
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const lap =
          gray[idx - w] + gray[idx + w] + gray[idx - 1] + gray[idx + 1] - 4 * gray[idx];
        sum += lap;
        sumSq += lap * lap;
        count++;
      }
    }
    if (count === 0) return 0;
    const mean = sum / count;
    return sumSq / count - mean * mean;
  };

  // Compare current frame with previous
  const computeFrameDiff = (
    current: ImageData,
    previous: ImageData
  ): number => {
    const len = current.data.length;
    let totalDiff = 0;
    const pixels = len / 4;
    for (let i = 0; i < len; i += 4) {
      totalDiff +=
        Math.abs(current.data[i] - previous.data[i]) +
        Math.abs(current.data[i + 1] - previous.data[i + 1]) +
        Math.abs(current.data[i + 2] - previous.data[i + 2]);
    }
    return totalDiff / (pixels * 3);
  };

  const analyzeFrame = useCallback(() => {
    if (scanState !== "scanning" && scanState !== "stabilizing") return;
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(analyzeFrame);
      return;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = SAMPLE_SIZE;
    canvas.height = Math.round((video.videoHeight / video.videoWidth) * SAMPLE_SIZE);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Grayscale for sharpness
    const gray = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = Math.round(
        frame.data[i * 4] * 0.299 +
        frame.data[i * 4 + 1] * 0.587 +
        frame.data[i * 4 + 2] * 0.114
      );
    }
    const sharpness = computeSharpness(gray, canvas.width, canvas.height);
    const isSharp = sharpness > SHARPNESS_MIN;

    let isStable = false;
    if (prevFrameRef.current) {
      const diff = computeFrameDiff(frame, prevFrameRef.current);
      isStable = diff < STABILITY_THRESHOLD;
    }
    prevFrameRef.current = frame;

    const now = Date.now();
    if (isStable && isSharp) {
      if (stableStartRef.current === 0) stableStartRef.current = now;
      const elapsed = now - stableStartRef.current;
      const pct = Math.min(100, (elapsed / STABILITY_DURATION) * 100);
      setStabilityPercent(pct);

      if (elapsed < STABILITY_DURATION) {
        setScanState("stabilizing");
      } else {
        // Auto-capture
        captureFrame();
        return;
      }
    } else {
      stableStartRef.current = 0;
      setStabilityPercent(0);
      setScanState("scanning");
    }

    rafRef.current = requestAnimationFrame(analyzeFrame);
  }, [scanState]);

  useEffect(() => {
    if (isOpen && (scanState === "scanning" || scanState === "stabilizing") && !cameraError) {
      rafRef.current = requestAnimationFrame(analyzeFrame);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen, scanState, analyzeFrame, cameraError]);

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Apply slight contrast enhancement
    const imageData = ctx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
    const data = imageData.data;
    const contrast = 1.15;
    const offset = 128 * (1 - contrast);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, data[i] * contrast + offset));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] * contrast + offset));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] * contrast + offset));
    }
    ctx.putImageData(imageData, 0, 0);

    captureCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
        setScanState("captured");
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      },
      "image/jpeg",
      0.92
    );
  };

  const handleManualCapture = () => {
    if (scanState === "captured") return;
    captureFrame();
  };

  const handleRetake = () => {
    if (capturedPreview) URL.revokeObjectURL(capturedPreview);
    setCapturedPreview(null);
    setCapturedBlob(null);
    setScanState("scanning");
    prevFrameRef.current = null;
    stableStartRef.current = 0;
    setStabilityPercent(0);
  };

  const handleUse = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `scan-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    onCapture(file);
    handleRetake();
  };

  const handleGallery = () => {
    onPickFiles();
  };

  if (!isOpen) return null;

  const borderColor =
    scanState === "captured"
      ? "border-green-500"
      : scanState === "stabilizing"
      ? "border-yellow-400"
      : "border-white/40";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2 z-10">
        <button
          onClick={onClose}
          className="text-white/80 text-sm font-medium px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm active:bg-white/20 transition-colors"
        >
          {t("upload.close")}
        </button>
        <div className="flex items-center gap-2">
          {scanState === "stabilizing" && (
            <span className="text-yellow-400 text-xs font-medium animate-pulse">
              {t("scanner.holdStill")}
            </span>
          )}
          {scanState === "scanning" && !cameraError && (
            <span className="text-white/50 text-xs">
              {t("scanner.pointAt")}
            </span>
          )}
        </div>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="text-center px-8">
            <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-white/70 text-sm mb-4">{cameraError}</p>
            <button
              onClick={handleGallery}
              className="bg-white/15 text-white px-6 py-3 rounded-full font-medium active:bg-white/25 transition-colors"
            >
              {t("scanner.openGallery")}
            </button>
          </div>
        ) : scanState === "captured" && capturedPreview ? (
          <img
            src={capturedPreview}
            alt="Captured"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Dark edges */}
              <div className="absolute inset-0 bg-black/30" />
              {/* Clear center */}
              <div className="absolute inset-6 md:inset-12">
                <div className={`w-full h-full border-2 rounded-2xl ${borderColor} transition-colors duration-300`}>
                  {/* Corner accents */}
                  <div className="absolute -top-px -left-px w-8 h-8 border-t-[3px] border-l-[3px] rounded-tl-2xl border-inherit" />
                  <div className="absolute -top-px -right-px w-8 h-8 border-t-[3px] border-r-[3px] rounded-tr-2xl border-inherit" />
                  <div className="absolute -bottom-px -left-px w-8 h-8 border-b-[3px] border-l-[3px] rounded-bl-2xl border-inherit" />
                  <div className="absolute -bottom-px -right-px w-8 h-8 border-b-[3px] border-r-[3px] rounded-br-2xl border-inherit" />
                </div>

                {/* Stability progress bar */}
                {scanState === "stabilizing" && (
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="w-full h-1 rounded-full bg-white/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-yellow-400 transition-all duration-100"
                        style={{ width: `${stabilityPercent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 pb-8 pt-4 px-6">
        {scanState === "captured" ? (
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={handleRetake}
              className="flex-1 py-3.5 rounded-full bg-white/10 text-white font-semibold text-base active:bg-white/20 transition-colors"
            >
              {t("scanner.retake")}
            </button>
            <button
              onClick={handleUse}
              className="flex-1 py-3.5 rounded-full bg-green-500 text-white font-bold text-base active:bg-green-600 transition-colors shadow-lg shadow-green-500/30"
            >
              {t("scanner.use")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            {/* Gallery button */}
            <button
              onClick={handleGallery}
              className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center active:bg-white/20 transition-colors"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {/* Capture button */}
            <button
              onClick={handleManualCapture}
              disabled={!!cameraError}
              className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center active:scale-[0.92] transition-transform disabled:opacity-30"
            >
              <div className={`w-[58px] h-[58px] rounded-full transition-colors ${
                scanState === "stabilizing" ? "bg-yellow-400" : "bg-white"
              }`} />
            </button>

            {/* Placeholder for symmetry */}
            <div className="w-12 h-12" />
          </div>
        )}
      </div>

      {/* Hidden canvas for analysis */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
