"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Client } from "@/lib/types";
import { saveClients } from "@/lib/storage";
import PhotoCapture from "@/components/PhotoCapture";
import CsvImporter from "@/components/CsvImporter";
import DataTable from "@/components/DataTable";

export default function UploadPage() {
  const router = useRouter();
  const [parsedClients, setParsedClients] = useState<Client[]>([]);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [showManual, setShowManual] = useState(false);

  const handleOCRProcessed = (clients: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clients.length > 0) {
      setParsedClients(clients);
    }
  };

  const handleManualParsed = (clients: Client[]) => {
    setParsedClients(clients);
  };

  const handleConfirm = () => {
    saveClients(parsedClients);
    router.push("/search");
  };

  const handleClear = () => {
    setParsedClients([]);
    setOcrRawText("");
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Daily Report</h1>
        <button
          onClick={() => router.push("/search")}
          className="text-blue-600 underline"
        >
          Go to Check-in
        </button>
      </div>

      {/* Photo / Camera upload with OCR */}
      <PhotoCapture onProcessed={handleOCRProcessed} />

      {/* Show OCR raw text for debugging if needed */}
      {ocrRawText && parsedClients.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-amber-800 text-sm font-medium mb-2">
            Could not automatically detect rooms. The raw text extracted is shown
            below. You can try a clearer photo or paste the data manually.
          </p>
          <details>
            <summary className="text-xs text-amber-600 cursor-pointer">
              Show raw OCR text
            </summary>
            <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-x-auto whitespace-pre-wrap">
              {ocrRawText}
            </pre>
          </details>
        </div>
      )}

      {/* Review Table */}
      <DataTable
        clients={parsedClients}
        onConfirm={handleConfirm}
        onClear={handleClear}
      />

      {/* Manual fallback - collapsed by default when OCR works */}
      <div className="border-t pt-4">
        {parsedClients.length > 0 && !showManual ? (
          <button
            onClick={() => setShowManual(true)}
            className="text-sm text-gray-500 underline"
          >
            Need to paste data manually instead?
          </button>
        ) : (
          <CsvImporter onParsed={handleManualParsed} />
        )}
      </div>
    </div>
  );
}
