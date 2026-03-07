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
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handleImageCaptured = (file: File) => {
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleParsed = (clients: Client[]) => {
    setParsedClients(clients);
  };

  const handleConfirm = () => {
    saveClients(parsedClients);
    router.push("/search");
  };

  const handleClear = () => {
    setParsedClients([]);
    setPhotoPreview(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upload Daily Report</h1>
        <button
          onClick={() => router.push("/search")}
          className="text-blue-600 underline"
        >
          Go to Check-in
        </button>
      </div>

      <PhotoCapture onImageCaptured={handleImageCaptured} />

      {photoPreview && (
        <div className="border rounded-lg overflow-hidden">
          <img
            src={photoPreview}
            alt="Report preview"
            className="w-full"
          />
          <p className="p-3 text-sm text-amber-700 bg-amber-50">
            OCR processing coming soon. Please paste the data manually below.
          </p>
        </div>
      )}

      <div className="border-t pt-4">
        <CsvImporter onParsed={handleParsed} />
      </div>

      <DataTable
        clients={parsedClients}
        onConfirm={handleConfirm}
        onClear={handleClear}
      />
    </div>
  );
}
