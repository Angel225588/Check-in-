"use client";
import { useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { Client } from "@/lib/types";
import { parseOCRText } from "@/lib/parser";
import { deduplicateClients } from "@/lib/vip";
import DocumentScanner from "./DocumentScanner";

export interface PhotoCaptureHandle {
  openPicker: () => void;
}

interface PageStatus {
  file: File;
  preview: string;
  status: "processing" | "done" | "error";
  clients: Client[];
  rawText?: string;
  error?: string;
}

interface PhotoCaptureProps {
  onProcessed: (clients: Client[], rawText: string) => void;
  apiEndpoint?: string;
  maxFiles?: number;
}

const MAX_FILES_DEFAULT = 7;

const PhotoCapture = forwardRef<PhotoCaptureHandle, PhotoCaptureProps>(
  function PhotoCapture({ onProcessed, apiEndpoint = "/api/ocr", maxFiles = MAX_FILES_DEFAULT }, ref) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pages, setPages] = useState<PageStatus[]>([]);
    const [error, setError] = useState("");
    const [scannerOpen, setScannerOpen] = useState(false);
    const pagesRef = useRef<PageStatus[]>([]);

    const openPicker = useCallback(() => {
      if (pagesRef.current.length >= maxFiles) {
        setError(`Maximum ${maxFiles} pages reached.`);
        return;
      }
      setScannerOpen(true);
    }, [maxFiles]);

    useImperativeHandle(ref, () => ({ openPicker }), [openPicker]);

    const processWithGemini = async (file: File, retries = 2): Promise<Client[] | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const formData = new FormData();
          formData.append("image", file);
          const res = await fetch(apiEndpoint, { method: "POST", body: formData });

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            if (res.status === 500 && data?.error?.includes("not configured")) return null;
            if (res.status === 429 && attempt < retries) {
              await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
              continue;
            }
            throw new Error(data?.error || "AI processing failed");
          }

          const data = await res.json();
          const clients = (data.clients || data.vipEntries) as Client[];
          return Array.isArray(clients) ? clients : [];
        } catch (err) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
      return [];
    };

    const processWithTesseract = async (file: File): Promise<{ clients: Client[]; rawText: string }> => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();
      return { clients: parseOCRText(data.text), rawText: data.text };
    };

    const emitResults = (allPages: PageStatus[]) => {
      const donePages = allPages.filter((p) => p.status === "done");
      if (donePages.length > 0) {
        let allClients = deduplicateClients(donePages.flatMap((p) => p.clients));
        const hasRawText = donePages.some((p) => p.rawText && !p.rawText.startsWith("[Extracted"));
        const allRaw = hasRawText
          ? donePages.map((p) => p.rawText).filter(Boolean).join("\n---\n")
          : `[Extracted by AI - ${allClients.length} rooms from ${donePages.length} page(s)]`;
        onProcessed(allClients, allRaw);
      }
    };

    const processFile = async (file: File, index: number) => {
      try {
        const geminiResult = await processWithGemini(file);
        let clients: Client[];
        let rawText: string | undefined;

        if (geminiResult !== null) {
          clients = geminiResult;
          rawText = `[Extracted by AI - ${clients.length} rooms]`;
        } else {
          const result = await processWithTesseract(file);
          clients = result.clients;
          rawText = result.rawText;
        }

        setPages((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], status: "done", clients, rawText };
          }
          return updated;
        });
        pagesRef.current = pagesRef.current.map((p, i) =>
          i === index ? { ...p, status: "done" as const, clients, rawText } : p
        );

        emitResults(pagesRef.current);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Processing failed";
        setPages((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = { ...updated[index], status: "error", error: errorMsg };
          }
          return updated;
        });
        pagesRef.current = pagesRef.current.map((p, i) =>
          i === index ? { ...p, status: "error" as const, error: errorMsg } : p
        );
      }
    };

    const addFilesAndProcess = (files: File[]) => {
      let newFiles = files;
      const currentCount = pagesRef.current.length;

      if (currentCount + newFiles.length > maxFiles) {
        const allowed = newFiles.slice(0, maxFiles - currentCount);
        setError(`Maximum ${maxFiles} pages. ${newFiles.length - allowed.length} file(s) skipped.`);
        newFiles = allowed;
      } else {
        setError("");
      }

      if (newFiles.length === 0) return;

      const newPages: PageStatus[] = newFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        status: "processing" as const,
        clients: [],
      }));

      const startIndex = currentCount;
      pagesRef.current = [...pagesRef.current, ...newPages];
      setPages((prev) => [...prev, ...newPages]);

      newFiles.forEach((file, i) => {
        processFile(file, startIndex + i);
      });
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      addFilesAndProcess(Array.from(fileList));
      e.target.value = "";
    };

    const handleScanCapture = (file: File) => {
      addFilesAndProcess([file]);
      // Keep scanner open for multi-page scanning
    };

    const handleScanPickFiles = () => {
      setScannerOpen(false);
      fileInputRef.current?.click();
    };

    const removePage = (index: number) => {
      URL.revokeObjectURL(pagesRef.current[index]?.preview);
      pagesRef.current = pagesRef.current.filter((_, i) => i !== index);
      setPages((prev) => prev.filter((_, i) => i !== index));

      const donePages = pagesRef.current.filter((p) => p.status === "done");
      if (donePages.length > 0) {
        let allClients = deduplicateClients(donePages.flatMap((p) => p.clients));
        const allRaw = donePages.map((p) => p.rawText).filter(Boolean).join("\n---\n");
        onProcessed(allClients, allRaw || `[Extracted by AI - ${allClients.length} rooms]`);
      }
    };

    const isProcessing = pages.some((p) => p.status === "processing");

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        <DocumentScanner
          isOpen={scannerOpen}
          onCapture={handleScanCapture}
          onPickFiles={handleScanPickFiles}
          onClose={() => setScannerOpen(false)}
        />

        {pages.length > 0 && (
          <div className="space-y-2">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pages.map((page, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <div className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-colors ${
                    page.status === "processing"
                      ? "border-brand/50"
                      : page.status === "done"
                      ? "border-green-500/50"
                      : "border-error/50"
                  }`}>
                    <img src={page.preview} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                    {page.status === "processing" && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center rounded-xl">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {page.status === "done" && (
                      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {page.status === "error" && (
                      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-error rounded-full flex items-center justify-center">
                        <span className="text-white text-[9px] font-bold">!</span>
                      </div>
                    )}
                  </div>
                  {!isProcessing && (
                    <button
                      onClick={() => removePage(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white rounded-full text-[9px] flex items-center justify-center"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}

              {pages.length < maxFiles && (
                <button
                  onClick={openPicker}
                  className="flex-shrink-0 w-16 h-16 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted active:border-brand active:text-brand transition-colors"
                >
                  <span className="text-xl leading-none">+</span>
                  <span className="text-[9px]">Add</span>
                </button>
              )}
            </div>

            {isProcessing && (
              <div className="flex items-center gap-2 text-xs text-brand font-medium">
                <div className="w-3 h-3 border-[1.5px] border-brand border-t-transparent rounded-full animate-spin" />
                Processing {pages.filter((p) => p.status === "processing").length} page(s)...
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-error/30 rounded-xl p-2 text-error text-xs">
            {error}
          </div>
        )}
      </>
    );
  }
);

export default PhotoCapture;
