"use client";
import { useRef } from "react";

interface PhotoCaptureProps {
  onImageCaptured: (file: File) => void;
}

export default function PhotoCapture({ onImageCaptured }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageCaptured(file);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Upload Report Photo</h3>
      <p className="text-sm text-gray-500">
        Take a photo of the daily report or upload from gallery. OCR coming soon
        — use CSV paste below for now.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg text-lg font-medium"
        >
          Take Photo
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 bg-gray-200 text-gray-800 py-3 px-4 rounded-lg text-lg font-medium"
        >
          Upload File
        </button>
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.csv,.txt"
        onChange={handleFile}
        className="hidden"
      />
    </div>
  );
}
