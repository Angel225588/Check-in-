"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Client, VipEntry, SessionRecord } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { saveClients, saveClientsMerged, getSessionHistory, getTodayData } from "@/lib/storage";
import type { MergeResult } from "@/lib/merge";
import { mergeVipIntoClients } from "@/lib/vip";
import { recordSessionGuests } from "@/lib/guests";
import { isComp } from "@/lib/utils";
import { useApp } from "@/contexts/AppContext";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import CsvImporter from "@/components/CsvImporter";
import DataTable from "@/components/DataTable";
import SettingsToggle from "@/components/SettingsToggle";

interface PdfUploadStatus {
  file: File;
  name: string;
  status: "uploading" | "processing" | "verifying" | "done" | "error";
  docType?: "clients" | "vip" | "unknown";
  clients: Client[];
  pages?: number;
  rawText?: string;
  error?: string;
  verification?: {
    verified: boolean;
    confidence: number;
    missing: number;
    extra: number;
    corrections: number;
    summary: string;
  };
}

function HistoryDrawer({
  sessions,
  isOpen,
  onClose,
  onViewSession,
  t,
}: {
  sessions: SessionRecord[];
  isOpen: boolean;
  onClose: () => void;
  onViewSession: (session: SessionRecord) => void;
  t: (key: TranslationKey) => string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-sm bg-[#FBF8F3] dark:bg-[#0A0A0F] h-full shadow-xl flex flex-col animate-[slideIn_0.25s_ease-out]">
        <div className="shrink-0 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark">{t("history.pastSessions")}</h2>
          <button onClick={onClose} className="p-2 glass-liquid rounded-full active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {sessions.length === 0 && (
            <p className="text-muted text-center py-8">{t("history.noSessions")}</p>
          )}
          {sessions.map((s, i) => (
            <button
              key={i}
              onClick={() => onViewSession(s)}
              className="w-full text-left p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-dark">{s.date}</span>
                <span className="text-xs text-muted">
                  {new Date(s.closedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex gap-4 text-sm text-muted">
                <span>{s.totalRooms} {t("upload.rooms")}</span>
                <span className="text-green-700 dark:text-green-400">{s.totalEntered} {t("metrics.entered").toLowerCase()}</span>
                <span className="text-error">{s.totalRemaining} {t("metrics.remaining").toLowerCase()}</span>
                {s.totalVip > 0 && (
                  <span className="text-brand">{s.totalVip} VIP</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionDetailDrawer({
  session,
  onClose,
  t,
}: {
  session: SessionRecord | null;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}) {
  const [sessionFilter, setSessionFilter] = useState<"all" | "entered" | "remaining" | "comp" | null>("all");
  const [sessionPage, setSessionPage] = useState(0);
  const SESSION_ROWS = 15;

  if (!session) return null;

  const compClients = session.clients.filter((c) => isComp(c));
  const enteredRooms = new Set(session.checkIns.map((ci) => ci.roomNumber));
  const enteredClients = session.clients.filter((c) => enteredRooms.has(c.roomNumber));
  const remainingClients = session.clients.filter((c) => !enteredRooms.has(c.roomNumber));

  const filtered = sessionFilter === "entered" ? enteredClients
    : sessionFilter === "remaining" ? remainingClients
    : sessionFilter === "comp" ? compClients
    : session.clients;

  const totalPages = Math.ceil(filtered.length / SESSION_ROWS);
  const pageClients = filtered.slice(sessionPage * SESSION_ROWS, (sessionPage + 1) * SESSION_ROWS);

  const handleFilterTap = (f: typeof sessionFilter) => {
    setSessionFilter(sessionFilter === f ? "all" : f);
    setSessionPage(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-lg bg-[#FBF8F3] dark:bg-[#0A0A0F] h-full shadow-xl flex flex-col animate-[slideIn_0.25s_ease-out]">
        {/* Header */}
        <div className="shrink-0 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-black text-dark">{session.date}</h2>
              <p className="text-xs text-muted">
                {t("history.closedAt")}{" "}
                {new Date(session.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
            <button onClick={onClose} className="p-2 glass-liquid rounded-full active:scale-95 transition-transform">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Metric filter cards */}
          <div className="grid grid-cols-4 gap-1.5">
            <button onClick={() => handleFilterTap("all")}
              className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${sessionFilter === "all" ? "glass-liquid-active ring-1 ring-brand/30" : "glass-liquid"}`}>
              <div className="text-[8px] text-muted uppercase">{t("report.totalRooms")}</div>
              <div className="text-xl font-black text-dark">{session.totalRooms}</div>
            </button>
            <button onClick={() => handleFilterTap("entered")}
              className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${sessionFilter === "entered" ? "glass-liquid-active ring-1 ring-green-500/30" : "glass-liquid"}`}>
              <div className="text-[8px] text-green-700 dark:text-green-400 uppercase">{t("metrics.entered")}</div>
              <div className="text-xl font-black text-green-700 dark:text-green-400">{session.totalEntered}</div>
            </button>
            <button onClick={() => handleFilterTap("remaining")}
              className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${sessionFilter === "remaining" ? "glass-liquid-active ring-1 ring-red-500/30" : "glass-liquid"}`}>
              <div className="text-[8px] text-error uppercase">{t("metrics.remaining")}</div>
              <div className="text-xl font-black text-error">{session.totalRemaining}</div>
            </button>
            <button onClick={() => handleFilterTap("comp")}
              className={`rounded-[12px] p-2 text-center transition-all active:scale-[0.96] ${sessionFilter === "comp" ? "glass-liquid-active ring-1 ring-green-500/30" : "glass-liquid"}`}>
              <div className="text-[8px] text-muted uppercase">COMP</div>
              <div className="text-xl font-black text-green-700 dark:text-green-400">{compClients.length}</div>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {/* Client table — same style as report */}
          <div className="glass-liquid rounded-[14px] overflow-hidden">
            <div className="grid grid-cols-[55px_1fr_45px_50px] px-3 py-2 border-b border-black/5 dark:border-white/8">
              <span className="text-[9px] text-muted uppercase font-semibold">{t("table.room")}</span>
              <span className="text-[9px] text-muted uppercase font-semibold">{t("table.name")}</span>
              <span className="text-[9px] text-muted uppercase font-semibold text-center">N</span>
              <span className="text-[9px] text-muted uppercase font-semibold text-right"></span>
            </div>
            {pageClients.map((c, i) => {
              const comp = isComp(c);
              const entered = enteredRooms.has(c.roomNumber);
              return (
                <div key={`${c.roomNumber}-${i}`}
                  className={`grid grid-cols-[55px_1fr_45px_50px] px-3 py-2 items-center border-b border-black/3 dark:border-white/5 last:border-0 ${
                    comp ? "bg-green-500/5 dark:bg-green-500/8" : c.isVip ? "bg-brand/5" : ""
                  }`}>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold font-mono text-dark">{c.roomNumber}</span>
                    {c.isVip && <span className="text-[7px] bg-gradient-to-r from-brand to-brand-light text-white px-1 py-0.5 rounded-full font-black leading-none">V</span>}
                  </div>
                  <div className="min-w-0">
                    <span className={`text-xs text-dark truncate block ${comp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""}`}>
                      {c.name}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-sm font-bold font-mono text-dark">{c.adults + c.children}</span>
                  </div>
                  <div className="text-right">
                    {comp ? (
                      <span className="text-[8px] bg-green-500/15 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">COMP</span>
                    ) : entered ? (
                      <span className="text-[8px] bg-green-500/15 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">IN</span>
                    ) : (
                      <span className="text-[8px] bg-black/5 dark:bg-white/8 text-muted px-1.5 py-0.5 rounded-full font-bold">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination arrows */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <button onClick={() => setSessionPage(Math.max(0, sessionPage - 1))} disabled={sessionPage === 0}
                className="px-4 py-1.5 rounded-full glass-liquid text-sm font-bold text-dark disabled:opacity-30 active:scale-95 transition-all">←</button>
              <span className="text-xs text-muted font-medium">{sessionPage + 1} / {totalPages}</span>
              <button onClick={() => setSessionPage(Math.min(totalPages - 1, sessionPage + 1))} disabled={sessionPage >= totalPages - 1}
                className="px-4 py-1.5 rounded-full glass-liquid text-sm font-bold text-dark disabled:opacity-30 active:scale-95 transition-all">→</button>
            </div>
          )}

          {/* Check-in timeline */}
          {session.checkIns.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t("history.checkinLog")}</h3>
              <div className="glass-liquid rounded-[14px] divide-y divide-black/5 dark:divide-white/8 overflow-hidden">
                {session.checkIns.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono text-muted text-xs w-12">
                      {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="font-bold font-mono text-sm text-dark w-12 shrink-0">{r.roomNumber}</span>
                    <span className="text-xs text-muted truncate flex-1">{r.clientName}</span>
                    <span className="glass-brand text-brand px-2 py-0.5 rounded-full text-xs font-bold">{r.peopleEntered}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw data */}
          {session.rawUploadText && (
            <details>
              <summary className="text-xs text-muted cursor-pointer font-medium uppercase tracking-wide">
                {t("history.rawData")}
              </summary>
              <pre className="mt-2 text-[10px] glass-liquid p-3 rounded-[14px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto text-dark">
                {session.rawUploadText}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function getGreeting(t: (key: TranslationKey) => string): string {
  const hour = new Date().getHours();
  if (hour < 12) return t("home.greeting.morning");
  if (hour < 18) return t("home.greeting.afternoon");
  return t("home.greeting.evening");
}

export default function UploadPage() {
  const router = useRouter();
  const { t } = useApp();
  const [isAddMode, setIsAddMode] = useState(false);
  const unifiedCaptureRef = useRef<PhotoCaptureHandle>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // View state: "home" | "processing" (scanning/uploading) | "pdf-processing" | "review" (after data captured)
  const [view, setView] = useState<"home" | "processing" | "pdf-processing" | "review">("home");
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"scanner" | "gallery" | null>(null);
  const [pdfUploads, setPdfUploads] = useState<PdfUploadStatus[]>([]);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newRoom, setNewRoom] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdults, setNewAdults] = useState("1");
  const [newChildren, setNewChildren] = useState("0");

  // Independent state for each upload
  const [baseClients, setBaseClients] = useState<Client[]>([]);
  const [vipRawClients, setVipRawClients] = useState<Client[]>([]);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [showManual, setShowManual] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<SessionRecord | null>(null);

  // Check for active session
  const [activeSession, setActiveSession] = useState<{ rooms: number } | null>(null);
  const [mergeBanner, setMergeBanner] = useState<MergeResult | null>(null);
  const [tablePage, setTablePage] = useState(0);
  const [openToggle, setOpenToggle] = useState<"clean" | "raw" | "pdf" | null>("clean");
  const [validating, setValidating] = useState(false);
  const [pdfElapsed, setPdfElapsed] = useState(0);
  const ROWS_PER_PAGE = 10;

  // Merge clients + VIP whenever either changes (race-proof)
  const parsedClients = useMemo(() => {
    if (baseClients.length === 0 && vipRawClients.length === 0) return [];
    if (vipRawClients.length === 0) return baseClients;

    const vipEntries: VipEntry[] = vipRawClients.map((v) => ({
      roomNumber: v.roomNumber,
      name: v.name,
      vipLevel: v.vipLevel || "",
      vipNotes: v.vipNotes || "",
      confirmationNumber: v.confirmationNumber,
      arrivalDate: v.arrivalDate,
      departureDate: v.departureDate,
      roomType: v.roomType,
      adults: v.adults,
      children: v.children,
      rateCode: v.rateCode,
    }));

    return mergeVipIntoClients(baseClients, vipEntries);
  }, [baseClients, vipRawClients]);

  const vipCount = parsedClients.filter((c) => c.isVip).length;
  const clientsUploaded = parsedClients.length > 0;

  useEffect(() => {
    setSessions(getSessionHistory());
    const todayData = getTodayData();
    if (todayData && todayData.clients.length > 0) {
      setActiveSession({ rooms: todayData.clients.length });
    }
    // Detect add mode and action from URL
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsAddMode(params.get("mode") === "add");
      const action = params.get("action");
      if (action === "pdf") {
        // Auto-trigger PDF file picker
        setTimeout(() => pdfInputRef.current?.click(), 300);
      } else if (action === "scanner") {
        setView("processing");
        setPendingAction("scanner");
      } else if (action === "gallery") {
        setView("processing");
        setPendingAction("gallery");
      }
    }
  }, []);

  // Elapsed seconds counter for PDF processing
  useEffect(() => {
    if (view !== "pdf-processing") { setPdfElapsed(0); return; }
    const allDone = pdfUploads.every((p) => p.status === "done" || p.status === "error");
    if (allDone) return;
    setPdfElapsed(0);
    const timer = setInterval(() => setPdfElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [view, pdfUploads.every((p) => p.status === "done" || p.status === "error")]);

  // Trigger scanner/gallery AFTER the processing view has mounted
  useEffect(() => {
    if (view === "processing" && pendingAction) {
      // Wait one frame for PhotoCapture to mount and ref to populate
      requestAnimationFrame(() => {
        if (pendingAction === "scanner") {
          unifiedCaptureRef.current?.openPicker();
        } else if (pendingAction === "gallery") {
          unifiedCaptureRef.current?.openFilePicker();
        }
        setPendingAction(null);
      });
    }
  }, [view, pendingAction]);

  // Unified handler: auto-routes clients vs VIP based on document type
  const handleUnifiedResult = (clientPages: Client[], vipPages: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clientPages.length > 0) setBaseClients(clientPages);
    if (vipPages.length > 0) setVipRawClients(vipPages);
    if (clientPages.length > 0 || vipPages.length > 0) setView("review");
  };

  // Fallback for non-typed processing (Tesseract fallback)
  const handleOCRProcessed = (clients: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clients.length > 0) {
      setBaseClients(clients);
      setView("review");
    }
  };

  // ─── PDF Upload & Processing ───
  const processPdf = async (file: File, index: number) => {
    // Update status to processing
    setPdfUploads((prev) => prev.map((p, i) => i === index ? { ...p, status: "processing" } : p));

    try {
      // Step 1: Extract
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ocr-pdf", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "PDF processing failed");
      }

      const data = await res.json();
      const clients = Array.isArray(data.clients) ? data.clients as Client[] : [];
      const docType = (data.type as "clients" | "vip" | "unknown") || "unknown";

      setPdfUploads((prev) => prev.map((p, i) =>
        i === index ? { ...p, status: "verifying", clients, docType, pages: data.pages, rawText: data.rawText } : p
      ));

      // Step 2: Verify (non-blocking — skip if slow or fails)
      // Mark as done immediately, run verification in background
      setPdfUploads((prev) => prev.map((p, i) =>
        i === index ? { ...p, status: "done" } : p
      ));

      // Fire-and-forget verification with 30s timeout
      try {
        const pdfBytes = await file.arrayBuffer();
        // Safe base64 encoding for large files
        const uint8 = new Uint8Array(pdfBytes);
        const chunks: string[] = [];
        const chunkSize = 8192;
        for (let offset = 0; offset < uint8.length; offset += chunkSize) {
          chunks.push(String.fromCharCode(...uint8.slice(offset, offset + chunkSize)));
        }
        const pdfBase64 = btoa(chunks.join(""));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

        const verifyRes = await fetch("/api/verify-extraction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pdfBase64, extractedClients: clients, docType }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          setPdfUploads((prev) => prev.map((p, i) =>
            i === index ? {
              ...p,
              verification: {
                verified: verifyData.verified,
                confidence: verifyData.confidence,
                missing: verifyData.missing?.length || 0,
                extra: verifyData.extra?.length || 0,
                corrections: verifyData.corrections?.length || 0,
                summary: verifyData.summary || "",
              },
            } : p
          ));
        }
      } catch {
        // Verification skipped/failed — extraction data is still valid
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Processing failed";
      setPdfUploads((prev) => prev.map((p, i) =>
        i === index ? { ...p, status: "error", error: errorMsg } : p
      ));
    }
  };

  // When all PDFs are done, merge results into client state
  useEffect(() => {
    if (pdfUploads.length === 0) return;
    const allDone = pdfUploads.every((p) => p.status === "done" || p.status === "error");
    if (!allDone) return;

    const donePdfs = pdfUploads.filter((p) => p.status === "done");
    if (donePdfs.length === 0) return;

    const clientPdfs = donePdfs.filter((p) => p.docType !== "vip").flatMap((p) => p.clients);
    const vipPdfs = donePdfs.filter((p) => p.docType === "vip").flatMap((p) => p.clients);
    const allRaw = donePdfs.map((p) => p.rawText).filter(Boolean).join("\n---\n");

    if (clientPdfs.length > 0) setBaseClients(clientPdfs);
    if (vipPdfs.length > 0) setVipRawClients(vipPdfs);
    if (allRaw) setOcrRawText(allRaw);
    setView("review");
  }, [pdfUploads]);

  const handlePdfInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    const startIndex = pdfUploads.length;
    const newUploads: PdfUploadStatus[] = files.map((file) => ({
      file,
      name: file.name,
      status: "uploading" as const,
      clients: [],
    }));

    setPdfUploads((prev) => [...prev, ...newUploads]);
    setView("pdf-processing");

    // Process sequentially (one at a time for rate limits)
    let chain = Promise.resolve();
    files.forEach((file, i) => {
      chain = chain.then(() => processPdf(file, startIndex + i));
    });

    e.target.value = "";
  };

  const handleManualParsed = (clients: Client[]) => {
    setBaseClients(clients);
    setShowManual(false);
    setView("review");
  };

  const handleAddManualClient = () => {
    if (!newRoom.trim() || !newName.trim()) return;
    const client: Client = {
      roomNumber: newRoom.trim(),
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: newName.trim(),
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "",
      adults: Math.max(0, parseInt(newAdults, 10) || 1),
      children: Math.max(0, parseInt(newChildren, 10) || 0),
      rateCode: "",
      packageCode: "",
    };
    setBaseClients((prev) => [...prev, client]);
    setAddClientOpen(false);
    setNewRoom("");
    setNewName("");
    setNewAdults("1");
    setNewChildren("0");
    setView("review");
  };

  const handleConfirm = () => {
    const result = saveClientsMerged(parsedClients, ocrRawText);
    // Record guest profiles for returning-guest tracking
    recordSessionGuests(parsedClients);
    if (result.duplicatesSkipped > 0 || result.existing > 0) {
      setMergeBanner(result);
      router.push(`/search?merged=${result.added}&skipped=${result.duplicatesSkipped}&total=${result.merged.length}`);
    } else {
      router.push("/search");
    }
  };

  const handleClear = () => {
    setBaseClients([]);
    setVipRawClients([]);
    setOcrRawText("");
  };

  // ─── Single unified PhotoCapture (always rendered) ───
  const captureElements = (
    <PhotoCapture
      ref={unifiedCaptureRef}
      onProcessed={handleOCRProcessed}
      onTypedResult={handleUnifiedResult}
      apiEndpoint="/api/ocr-unified"
    />
  );

  // ─── HOME VIEW ───
  if (view === "home") {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        {/* Background decorative gradient */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-brand/[0.04] blur-3xl" />
          <div className="absolute -bottom-40 -left-20 w-96 h-96 rounded-full bg-brand-light/[0.03] blur-3xl" />
        </div>

        <div className="relative flex-1 flex flex-col px-5 pt-6 pb-5">
          {/* Add-mode banner */}
          {isAddMode && (
            <div className="mb-3 flex items-center gap-2 bg-brand/10 dark:bg-brand/15 rounded-[14px] px-4 py-2.5">
              <svg className="w-5 h-5 text-brand shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm font-semibold text-brand">{t("upload.addingToSession")}</span>
              <button
                onClick={() => router.push("/search")}
                className="ml-auto text-xs text-brand/70 font-medium underline"
              >
                {t("upload.back")}
              </button>
            </div>
          )}
          {/* Header: brand + history + settings */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tracking-[0.08em] text-brand" style={{ fontFamily: "'Nunito', sans-serif" }}>
                COURTYARD
              </span>
              <span className="text-xs text-muted font-medium">by</span>
              <span className="text-xs font-bold tracking-[0.05em] text-slate">
                MARRIOTT
              </span>
            </div>
            <button
              onClick={() => setHistoryOpen(true)}
              className="p-2 glass-liquid rounded-full active:scale-95 transition-transform"
            >
              <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>

          {/* Greeting */}
          <div className="mt-6 mb-auto">
            <h1 className="text-[32px] font-black text-dark leading-tight tracking-tight">
              {getGreeting(t)}
            </h1>
            <p className="text-base text-muted mt-1">{t("upload.subtitle2")}</p>
          </div>

          {/* Main action buttons */}
          <div className="space-y-3">
            {/* HERO BUTTON — switches between Start Day / Active Session */}
            {activeSession ? (
              <button
                onClick={() => router.push("/search")}
                className="w-full group relative overflow-hidden rounded-[20px] active:scale-[0.97] transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-600 via-green-600 to-green-500 opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                <div className="relative flex items-center gap-4 p-5">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner">
                    <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-xl font-black text-white tracking-tight">{t("home.activeSession")}</div>
                    <div className="text-sm text-white/70 font-medium mt-0.5">{activeSession.rooms} {t("home.roomsLoaded")}</div>
                  </div>
                  <svg className="w-6 h-6 text-white/40 group-active:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.06] rounded-full -translate-y-1/2 translate-x-1/2" />
              </button>
            ) : (
              <button
                onClick={() => setActionSheetOpen(true)}
                className="w-full group relative overflow-hidden rounded-[20px] active:scale-[0.97] transition-all"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-brand via-brand to-brand-light opacity-90" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
                <div className="relative flex items-center gap-4 p-5">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <div className="text-left flex-1">
                    <div className="text-xl font-black text-white tracking-tight">{t("home.startDay")}</div>
                    <div className="text-sm text-white/70 font-medium mt-0.5">{t("home.startDayDesc")}</div>
                  </div>
                  <svg className="w-6 h-6 text-white/40 group-active:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.06] rounded-full -translate-y-1/2 translate-x-1/2" />
              </button>
            )}

            {/* Secondary nav — 3-button row */}
            <div className="grid grid-cols-3 gap-2">
              {/* Clients */}
              <button
                onClick={() => router.push("/clients")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.clients")}</span>
              </button>

              {/* Reports */}
              <button
                onClick={() => router.push("/report")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.reports")}</span>
              </button>

              {/* Dashboard */}
              <button
                onClick={() => router.push("/dashboard")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 13h4v8H3V13zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
                  </svg>
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.dashboard")}</span>
              </button>
            </div>

            {/* Docs button — only when no active session */}
            {!activeSession && (
              <button
                onClick={() => setActionSheetOpen(true)}
                className="w-full glass-liquid rounded-[16px] p-3.5 flex items-center gap-3 active:scale-[0.97] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <div className="text-sm font-bold text-dark">{t("upload.uploadDocs")}</div>
                  <div className="text-xs text-muted">{t("upload.uploadDocsDesc")}</div>
                </div>
                <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <SettingsToggle />

        {/* Hidden inputs */}
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handlePdfInput}
          className="hidden"
        />
        <div className="hidden">{captureElements}</div>

        {/* History Drawers */}
        <HistoryDrawer
          sessions={sessions}
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
          onViewSession={(s) => {
            setHistoryOpen(false);
            setViewingSession(s);
          }}
          t={t}
        />
        <SessionDetailDrawer
          session={viewingSession}
          onClose={() => setViewingSession(null)}
          t={t}
        />

        {/* Action Sheet — bottom sheet with 4 options */}
        {actionSheetOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 dark:bg-black/60" onClick={() => setActionSheetOpen(false)}>
            <div
              className="w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-dark mb-1">{t("home.startDay")}</h3>
              <p className="text-sm text-muted mb-5">{t("home.startDayDesc")}</p>

              <div className="space-y-2">
                {/* PDF Upload — Primary option */}
                <button
                  onClick={() => { setActionSheetOpen(false); pdfInputRef.current?.click(); }}
                  className="w-full flex items-center gap-4 p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5.5 h-5.5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-dark">{t("home.uploadPdf")}</div>
                    <div className="text-xs text-muted mt-0.5">{t("home.uploadPdfDesc")}</div>
                  </div>
                  <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Camera / Scanner */}
                <button
                  onClick={() => { setActionSheetOpen(false); setView("processing"); setPendingAction("scanner"); }}
                  className="w-full flex items-center gap-4 p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                    <svg className="w-5.5 h-5.5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <circle cx="12" cy="13" r="3" strokeWidth={2} />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-dark">{t("home.camera")}</div>
                    <div className="text-xs text-muted mt-0.5">{t("home.cameraDesc")}</div>
                  </div>
                  <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Gallery */}
                <button
                  onClick={() => { setActionSheetOpen(false); setView("processing"); setPendingAction("gallery"); }}
                  className="w-full flex items-center gap-4 p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5.5 h-5.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-dark">{t("home.gallery")}</div>
                    <div className="text-xs text-muted mt-0.5">{t("home.galleryDesc")}</div>
                  </div>
                  <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Paste CSV */}
                <button
                  onClick={() => { setActionSheetOpen(false); setShowManual(true); setView("review"); }}
                  className="w-full flex items-center gap-4 p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5.5 h-5.5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-dark">{t("home.pasteCsv")}</div>
                    <div className="text-xs text-muted mt-0.5">{t("home.pasteCsvDesc")}</div>
                  </div>
                  <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Add Client manually */}
                <button
                  onClick={() => { setActionSheetOpen(false); setAddClientOpen(true); }}
                  className="w-full flex items-center gap-4 p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all text-left"
                >
                  <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
                    <svg className="w-5.5 h-5.5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-bold text-dark">{t("home.addClient")}</div>
                    <div className="text-xs text-muted mt-0.5">{t("home.addClientDesc")}</div>
                  </div>
                  <svg className="w-5 h-5 text-muted/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Cancel */}
              <button
                onClick={() => setActionSheetOpen(false)}
                className="w-full mt-4 py-3.5 rounded-[52px] glass-liquid text-muted font-semibold text-[15px] active:scale-[0.97] transition-all"
              >
                {t("checkin.cancel")}
              </button>
            </div>
          </div>
        )}

        {/* Add Client bottom sheet */}
        {addClientOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 dark:bg-black/60" onClick={() => setAddClientOpen(false)}>
            <div
              className="w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-dark mb-4">{t("checkin.addClient")}</h3>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.roomNumber")}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                    placeholder="101"
                    maxLength={10}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.guestName")}</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                    placeholder="Dupont"
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.adultsCount")}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newAdults}
                    onChange={(e) => setNewAdults(e.target.value)}
                    min="0"
                    max="20"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.childrenCount")}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={newChildren}
                    onChange={(e) => setNewChildren(e.target.value)}
                    min="0"
                    max="20"
                    className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark font-mono text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setAddClientOpen(false)}
                  className="flex-1 py-3 rounded-[52px] glass-liquid text-muted font-semibold active:scale-[0.97] transition-all"
                >
                  {t("checkin.cancel")}
                </button>
                <button
                  onClick={handleAddManualClient}
                  disabled={!newRoom.trim() || !newName.trim()}
                  className="flex-1 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20 disabled:opacity-40 dark:glow-brand"
                >
                  {t("checkin.save")}
                </button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ─── PROCESSING VIEW: Scanning & processing pages ───
  if (view === "processing") {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setView("home")}
              className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
            >
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium text-brand">{t("upload.close")}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => unifiedCaptureRef.current?.openPicker()}
                className="px-3 py-1.5 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-muted">+ {t("home.camera")}</span>
              </button>
              <button
                onClick={() => unifiedCaptureRef.current?.openFilePicker()}
                className="px-3 py-1.5 glass-liquid-active rounded-full active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-brand">+ {t("home.gallery")}</span>
              </button>
            </div>
          </div>

          <h1 className="text-[26px] font-black text-dark leading-tight">
            {t("processing.title")}
          </h1>
          <p className="text-sm text-muted mt-0.5">{t("processing.desc")}</p>
        </div>

        {/* Processing content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* PhotoCapture — visible here to show thumbnails & progress */}
          <div className="w-full mb-6">
            {captureElements}
          </div>

          {/* Animated processing indicator */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-brand/15" />
              <div className="absolute inset-0 rounded-full border-4 border-brand border-t-transparent animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-8 h-8 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <p className="text-muted text-sm font-medium animate-pulse">{t("processing.desc")}</p>
          </div>
        </div>

        <SettingsToggle />

        <style jsx>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ─── PDF PROCESSING VIEW ───
  if (view === "pdf-processing") {
    const allDone = pdfUploads.every((p) => p.status === "done" || p.status === "error");
    const totalClients = pdfUploads.reduce((s, p) => s + p.clients.length, 0);

    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="shrink-0 px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => { setPdfUploads([]); setView("home"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
            >
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium text-brand">{t("upload.close")}</span>
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[26px] font-black text-dark leading-tight">
                {t("processing.title")}
              </h1>
              <p className="text-sm text-muted mt-0.5">
                {allDone ? `${totalClients} rooms extracted` : t("processing.pdfProcessing")}
              </p>
            </div>
            {/* Add more PDFs button */}
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="px-4 py-2 glass-liquid-active rounded-full active:scale-95 transition-transform"
            >
              <span className="text-sm font-bold text-brand">+ PDF</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-3">
          {pdfUploads.map((pdf, i) => (
            <div key={i} className="glass-liquid rounded-[14px] p-4">
              <div className="flex items-center gap-3">
                {/* Status icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  pdf.status === "done" ? "bg-green-500/10" :
                  pdf.status === "error" ? "bg-red-500/10" :
                  "bg-brand/10"
                }`}>
                  {pdf.status === "done" ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : pdf.status === "error" ? (
                    <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-dark truncate">{pdf.name}</div>
                  <div className="text-xs text-muted">
                    {pdf.status === "uploading" && "Uploading..."}
                    {pdf.status === "processing" && t("processing.pdfProcessing")}
                    {pdf.status === "verifying" && t("processing.verifying")}
                    {pdf.status === "done" && (
                      <>
                        {pdf.clients.length} rooms
                        {pdf.docType && ` · ${pdf.docType}`}
                        {pdf.pages && ` · ${pdf.pages} pages`}
                      </>
                    )}
                    {pdf.status === "error" && (
                      <div className="flex items-center gap-2">
                        <span className="text-red-500">{pdf.error}</span>
                        <button
                          onClick={() => processPdf(pdf.file, i)}
                          className="text-brand font-bold text-[11px] underline"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification badge */}
                {pdf.verification && (
                  <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                    pdf.verification.verified
                      ? "bg-green-500/10 text-green-700"
                      : "bg-yellow-500/10 text-yellow-700"
                  }`}>
                    {pdf.verification.verified ? `${pdf.verification.confidence}%` : `${pdf.verification.missing + pdf.verification.corrections} issues`}
                  </div>
                )}
              </div>

              {/* Verification details */}
              {pdf.verification && !pdf.verification.verified && (
                <div className="mt-2 text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-500/5 rounded-lg p-2">
                  {pdf.verification.summary}
                </div>
              )}
            </div>
          ))}

          {/* Overall processing indicator with elapsed counter */}
          {!allDone && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-brand/15" />
                <div className="absolute inset-0 rounded-full border-4 border-brand border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black font-mono text-brand">{pdfElapsed >= 60 ? `${Math.floor(pdfElapsed / 60)}m ${pdfElapsed % 60}s` : `${pdfElapsed}s`}</span>
                </div>
              </div>
              <p className="text-muted text-sm font-medium">
                {pdfUploads.some((p) => p.status === "verifying")
                  ? t("processing.verifying")
                  : t("processing.pdfProcessing")}
              </p>
            </div>
          )}
        </div>

        <SettingsToggle />
      </div>
    );
  }

  // ─── REVIEW VIEW: After data is captured ───
  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      {/* Header */}
      <div className="shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/8 to-brand-light/5 dark:from-brand/5 dark:to-brand-light/3" />
        <div className="relative px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setView("home")}
              className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
            >
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium text-brand">{t("upload.close")}</span>
            </button>
            <div className="flex items-center gap-2">
              {/* Add more photos via scanner */}
              <button
                onClick={() => unifiedCaptureRef.current?.openPicker()}
                className="px-3 py-1.5 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-muted">+ {t("home.camera")}</span>
              </button>
              {/* Add more photos via gallery */}
              <button
                onClick={() => unifiedCaptureRef.current?.openFilePicker()}
                className="px-3 py-1.5 glass-liquid-active rounded-full active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-brand">+ {t("home.gallery")}</span>
              </button>
            </div>
          </div>

          <h1 className="text-[26px] font-black text-dark leading-tight">
            {t("upload.title")}
          </h1>
          <p className="text-sm text-muted mt-0.5">{t("upload.subtitle")}</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-3">
        {/* PhotoCapture elements */}
        {captureElements}

        {/* OCR error fallback */}
        {ocrRawText && parsedClients.length === 0 && (
          <div className="bg-brand-50 border border-brand-light/30 rounded-[14px] p-3">
            <p className="text-brand text-sm font-medium mb-2">
              {t("upload.noDetect")}
            </p>
            <details>
              <summary className="text-xs text-brand cursor-pointer">{t("upload.showRawOcr")}</summary>
              <pre className="mt-2 text-xs bg-white/60 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {ocrRawText}
              </pre>
            </details>
          </div>
        )}

        {/* VIP status */}
        {vipRawClients.length > 0 && (
          <div className="bg-brand-50 border border-brand-light/30 rounded-[14px] p-3 text-brand text-sm font-medium">
            {vipCount} VIP(s) tagged
            {parsedClients.length > baseClients.length
              ? `, ${parsedClients.length - baseClients.length} new room(s) added`
              : ""}
          </div>
        )}

        {/* Verification summary */}
        {clientsUploaded && (() => {
          const totalGuests = parsedClients.reduce((s, c) => s + c.adults + c.children, 0);
          const uniqueRooms = new Set(parsedClients.map(c => c.roomNumber));
          const sharedRooms = parsedClients.length - uniqueRooms.size;
          const noName = parsedClients.filter(c => !c.name || c.name === "Unknown").length;
          const noPackage = parsedClients.filter(c => !c.packageCode).length;
          const zeroGuests = parsedClients.filter(c => c.adults + c.children === 0).length;
          const hasIssues = noName > 0 || zeroGuests > 0;

          return (
            <div className="glass-liquid rounded-[14px] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${hasIssues ? "bg-yellow-500/10" : "bg-green-500/10"}`}>
                    {hasIssues ? (
                      <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-dark">{parsedClients.length} {t("upload.rooms")}</span>
                    {vipCount > 0 && (
                      <span className="text-xs text-brand ml-2 font-medium">{vipCount} VIP</span>
                    )}
                  </div>
                </div>
                <button onClick={handleClear} className="text-xs text-error font-medium active:opacity-70">
                  {t("upload.clear")}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="bg-white/30 dark:bg-white/5 rounded-lg py-1.5 px-1">
                  <div className="text-lg font-bold text-dark">{uniqueRooms.size}</div>
                  <div className="text-[9px] text-muted uppercase">{t("upload.rooms")}</div>
                </div>
                <div className="bg-white/30 dark:bg-white/5 rounded-lg py-1.5 px-1">
                  <div className="text-lg font-bold text-dark">{totalGuests}</div>
                  <div className="text-[9px] text-muted uppercase">{t("verify.totalGuests")}</div>
                </div>
                <div className="bg-white/30 dark:bg-white/5 rounded-lg py-1.5 px-1">
                  <div className="text-lg font-bold text-dark">{sharedRooms}</div>
                  <div className="text-[9px] text-muted uppercase">{t("verify.sharedRooms")}</div>
                </div>
              </div>

              {(noName > 0 || zeroGuests > 0 || noPackage > 0) && (
                <div className="space-y-1 text-xs">
                  {noName > 0 && (
                    <div className="flex items-center gap-1.5 text-yellow-700 dark:text-yellow-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                      {noName} {t("verify.noName")}
                    </div>
                  )}
                  {zeroGuests > 0 && (
                    <div className="flex items-center gap-1.5 text-error">
                      <span className="w-1.5 h-1.5 rounded-full bg-error" />
                      {zeroGuests} {t("verify.zeroGuests")}
                    </div>
                  )}
                  {noPackage > 0 && (
                    <div className="flex items-center gap-1.5 text-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted" />
                      {noPackage} {t("verify.noPackage")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Optional validate button */}
        {clientsUploaded && pdfUploads.length > 0 && (
          <button
            onClick={async () => {
              setValidating(true);
              // Trigger verification for all done PDFs that haven't been verified
              for (const pdf of pdfUploads) {
                if (pdf.status === "done" && !pdf.verification) {
                  try {
                    const bytes = await pdf.file.arrayBuffer();
                    const uint8 = new Uint8Array(bytes);
                    const chunks: string[] = [];
                    for (let o = 0; o < uint8.length; o += 8192) {
                      chunks.push(String.fromCharCode(...uint8.slice(o, o + 8192)));
                    }
                    const b64 = btoa(chunks.join(""));
                    const ctrl = new AbortController();
                    const tm = setTimeout(() => ctrl.abort(), 30000);
                    const res = await fetch("/api/verify-extraction", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ pdfBase64: b64, extractedClients: pdf.clients, docType: pdf.docType || "clients" }),
                      signal: ctrl.signal,
                    });
                    clearTimeout(tm);
                    if (res.ok) {
                      const d = await res.json();
                      const idx = pdfUploads.indexOf(pdf);
                      setPdfUploads((prev) => prev.map((p, i) => i === idx ? { ...p, verification: { verified: d.verified, confidence: d.confidence, missing: d.missing?.length || 0, extra: d.extra?.length || 0, corrections: d.corrections?.length || 0, summary: d.summary || "" } } : p));
                    }
                  } catch { /* skip */ }
                }
              }
              setValidating(false);
            }}
            disabled={validating}
            className="glass-liquid rounded-[14px] p-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all w-full"
          >
            {validating ? (
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-bold text-brand">
              {validating ? t("processing.verifying") : t("upload.validate")}
            </span>
            {pdfUploads.some((p) => p.verification) && (
              <span className="text-xs text-green-600 font-medium ml-1">
                {pdfUploads.filter((p) => p.verification?.verified).length}/{pdfUploads.length}
              </span>
            )}
          </button>
        )}

        {/* ── Toggle: Clean Data (default open, paginated) ── */}
        <div className="glass-liquid rounded-[14px] overflow-hidden">
          <button
            onClick={() => setOpenToggle(openToggle === "clean" ? null : "clean")}
            className="w-full flex items-center justify-between p-3 active:bg-white/50 transition-colors"
          >
            <span className="text-sm font-bold text-dark">{t("upload.cleanData")} ({parsedClients.length})</span>
            <svg className={`w-4 h-4 text-muted transition-transform ${openToggle === "clean" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openToggle === "clean" && (() => {
            const totalPages = Math.ceil(parsedClients.length / ROWS_PER_PAGE);
            const pageClients = parsedClients.slice(tablePage * ROWS_PER_PAGE, (tablePage + 1) * ROWS_PER_PAGE);
            return (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-t border-b border-black/5 dark:border-white/5">
                        <th className="px-2 py-1.5 text-left text-muted font-medium">{t("table.room")}</th>
                        <th className="px-2 py-1.5 text-left text-muted font-medium">{t("table.name")}</th>
                        <th className="px-2 py-1.5 text-center text-muted font-medium">N</th>
                        <th className="px-2 py-1.5 text-center text-muted font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageClients.map((c, i) => {
                        const comp = isComp(c);
                        return (
                          <tr key={i} className={`border-t border-black/5 dark:border-white/5 ${comp ? "bg-green-500/5 dark:bg-green-500/8" : c.isVip ? "bg-brand-50/50" : ""}`}>
                            <td className="px-2 py-1.5 font-mono font-bold text-dark">
                              {c.roomNumber}
                              {c.isVip && <span className="ml-1 text-[9px] bg-gradient-to-r from-brand to-brand-light text-white px-1.5 rounded-full font-bold">VIP</span>}
                            </td>
                            <td className={`px-2 py-1.5 truncate max-w-[140px] text-dark ${comp ? "underline decoration-green-500 decoration-2 underline-offset-2" : ""}`}>
                              {c.name}
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono font-bold text-dark">{c.adults + c.children}</td>
                            <td className="px-2 py-1.5 text-center">
                              {comp && (
                                <span className="text-[9px] font-bold bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full">COMP</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-3 py-2 border-t border-black/5">
                    <button
                      onClick={() => setTablePage(Math.max(0, tablePage - 1))}
                      disabled={tablePage === 0}
                      className="px-3 py-1 rounded-full glass-liquid text-sm font-medium disabled:opacity-30 active:scale-95"
                    >
                      ←
                    </button>
                    <span className="text-xs text-muted font-medium">{tablePage + 1} / {totalPages}</span>
                    <button
                      onClick={() => setTablePage(Math.min(totalPages - 1, tablePage + 1))}
                      disabled={tablePage >= totalPages - 1}
                      className="px-3 py-1 rounded-full glass-liquid text-sm font-medium disabled:opacity-30 active:scale-95"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Toggle: Raw Data ── */}
        {ocrRawText && (
          <div className="glass-liquid rounded-[14px] overflow-hidden">
            <button
              onClick={() => setOpenToggle(openToggle === "raw" ? null : "raw")}
              className="w-full flex items-center justify-between p-3 active:bg-white/50 transition-colors"
            >
              <span className="text-sm font-bold text-dark">{t("upload.rawData")}</span>
              <svg className={`w-4 h-4 text-muted transition-transform ${openToggle === "raw" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openToggle === "raw" && (
              <pre className="px-3 pb-3 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto text-muted">
                {ocrRawText}
              </pre>
            )}
          </div>
        )}

        {/* ── Toggle: PDF Files ── */}
        {pdfUploads.length > 0 && (
          <div className="glass-liquid rounded-[14px] overflow-hidden">
            <button
              onClick={() => setOpenToggle(openToggle === "pdf" ? null : "pdf")}
              className="w-full flex items-center justify-between p-3 active:bg-white/50 transition-colors"
            >
              <span className="text-sm font-bold text-dark">{t("upload.pdfFiles")} ({pdfUploads.length})</span>
              <svg className={`w-4 h-4 text-muted transition-transform ${openToggle === "pdf" ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openToggle === "pdf" && (
              <div className="px-3 pb-3 space-y-2">
                {pdfUploads.map((pdf, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs bg-white/30 dark:bg-white/5 rounded-lg p-2">
                    <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="font-medium text-dark truncate flex-1">{pdf.name}</span>
                    <span className="text-muted">{pdf.clients.length} rooms</span>
                    {pdf.verification?.verified && (
                      <span className="text-green-600 font-bold">{pdf.verification.confidence}%</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual paste */}
        {showManual && (
          <div className="glass-liquid rounded-[14px] p-4 animate-[fadeSlideUp_0.2s_ease-out]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-dark">{t("upload.pasteReportData")}</span>
              <button
                onClick={() => setShowManual(false)}
                className="text-xs text-muted font-medium active:opacity-70"
              >
                {t("upload.close")}
              </button>
            </div>
            <CsvImporter onParsed={handleManualParsed} />
          </div>
        )}
      </div>

      {/* Merge result banner */}
      {mergeBanner && (
        <div className="shrink-0 px-4 pt-2">
          <div className="glass-liquid rounded-[14px] p-3 text-sm animate-[fadeSlideUp_0.3s_ease-out]">
            <div className="flex items-center gap-2 font-bold text-dark mb-1">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {t("upload.mergeComplete")}
            </div>
            <div className="text-xs text-muted space-y-0.5">
              <div>+{mergeBanner.added} {t("upload.newRoomsAdded")}</div>
              {mergeBanner.duplicatesSkipped > 0 && (
                <div>{mergeBanner.duplicatesSkipped} {t("upload.duplicatesSkipped")}</div>
              )}
              <div className="font-medium text-dark">{mergeBanner.merged.length} {t("upload.totalRoomsNow")}</div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom confirm bar */}
      {clientsUploaded && !mergeBanner && (
        <div className="shrink-0 px-4 pb-4 pt-2 bg-gradient-to-t from-[#FBF8F3] dark:from-[#0A0A0F] via-[#FBF8F3] dark:via-[#0A0A0F] to-transparent">
          <button
            onClick={handleConfirm}
            className="w-full bg-gradient-to-r from-brand to-brand-light text-white py-4 rounded-[52px] text-xl font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/25 dark:glow-brand"
          >
            {t("upload.startSession")} ({parsedClients.length} {t("upload.rooms")})
          </button>
        </div>
      )}

      <SettingsToggle />

      <style jsx>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
