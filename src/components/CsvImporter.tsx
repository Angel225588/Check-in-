"use client";
import { useState } from "react";
import { Client } from "@/lib/types";
import { parseCSV } from "@/lib/parser";
import { useApp } from "@/contexts/AppContext";

interface CsvImporterProps {
  onParsed: (clients: Client[]) => void;
}

export default function CsvImporter({ onParsed }: CsvImporterProps) {
  const { t } = useApp();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const handleParse = () => {
    setError("");
    const clients = parseCSV(text);
    if (clients.length === 0) {
      setError(t("csv.noRows"));
      return;
    }
    onParsed(clients);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-dark">{t("csv.title")}</h3>
      <p className="text-sm text-muted">{t("csv.desc")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="567&#9;PRMK&#9;DLXK&#9;178598332&#9;DIGLE, FABRICE MICHEL&#9;20/02/26&#9;01/03/26&#9;DUOT&#9;1&#9;0&#9;CMXC&#9;BKF GRP"
        className="w-full h-40 border border-border dark:border-white/10 rounded-[14px] p-3 text-sm font-mono resize-none focus:outline-none focus:border-brand bg-white/60 dark:bg-white/5 text-dark"
      />
      {error && <p className="text-error text-sm">{error}</p>}
      <button
        onClick={handleParse}
        disabled={!text.trim()}
        className="w-full bg-brand text-white py-3 rounded-[52px] text-lg font-medium disabled:opacity-50 dark:glow-brand"
      >
        {t("csv.parse")}
      </button>
    </div>
  );
}
