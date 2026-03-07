"use client";
import { useState } from "react";
import { Client } from "@/lib/types";
import { parseCSV } from "@/lib/parser";

interface CsvImporterProps {
  onParsed: (clients: Client[]) => void;
}

export default function CsvImporter({ onParsed }: CsvImporterProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const handleParse = () => {
    setError("");
    const clients = parseCSV(text);
    if (clients.length === 0) {
      setError(
        "No valid rows found. Make sure each row has at least 8 columns separated by commas, tabs, or semicolons."
      );
      return;
    }
    onParsed(clients);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Paste Report Data</h3>
      <p className="text-sm text-gray-500">
        Paste the report data below. Columns: Room No, Room Type, RTC, Conf No,
        Name, Arrival, Departure, Status, Adults, Children, Rate Code, Package
        Code
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="567&#9;PRMK&#9;DLXK&#9;178598332&#9;DIGLE, FABRICE MICHEL&#9;20/02/26&#9;01/03/26&#9;DUOT&#9;1&#9;0&#9;CMXC&#9;BKF GRP"
        className="w-full h-40 border rounded-lg p-3 text-sm font-mono resize-none"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        onClick={handleParse}
        disabled={!text.trim()}
        className="w-full bg-blue-600 text-white py-3 rounded-lg text-lg font-medium disabled:opacity-50"
      >
        Parse Data
      </button>
    </div>
  );
}
