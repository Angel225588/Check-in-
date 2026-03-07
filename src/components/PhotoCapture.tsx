"use client";
import { useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { Client } from "@/lib/types";
import { parseOCRText } from "@/lib/parser";

interface PhotoCaptureProps {
  onProcessed: (clients: Client[], rawText: string) => void;
}

export default function PhotoCapture({ onProcessed }: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  const processImage = async (file: File) => {
    setError("");
    setProcessing(true);
    setProgress(0);

    // Show preview
    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      const worker = await createWorker("eng", undefined, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const { data } = await worker.recognize(file);
      await worker.terminate();

      const rawText = data.text;
      const clients = parseOCRText(rawText);

      if (clients.length === 0) {
        setError(
          "Could not detect any rooms from the image. You can try again with a clearer photo, or paste the data manually below."
        );
      }

      onProcessed(clients, rawText);
    } catch (err) {
      setError(
        `OCR failed: ${err instanceof Error ? err.message : "Unknown error"}. Try a clearer photo or paste data manually.`
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Upload Report Photo</h3>
      <p className="text-sm text-gray-500">
        Take a photo of the daily report or upload from gallery. The system will
        automatically read the data from the image.
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={processing}
          className="flex-1 bg-blue-600 text-white py-4 px-4 rounded-lg text-lg font-bold disabled:opacity-50"
        >
          Take Photo
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="flex-1 bg-gray-200 text-gray-800 py-4 px-4 rounded-lg text-lg font-bold disabled:opacity-50"
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

      {/* Preview */}
      {preview && (
        <div className="border rounded-lg overflow-hidden">
          <img src={preview} alt="Report preview" className="w-full" />
        </div>
      )}

      {/* Processing indicator */}
      {processing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-blue-800 font-medium">
              Reading image... {progress}%
            </span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
