"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkle as PhSparkle,
  UsersThree as PhUsersThree,
  FileText as PhFileText,
  ChartBar as PhChartBar,
} from "@phosphor-icons/react/dist/ssr";
import { Client, VipEntry, SessionRecord } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { saveClients, saveClientsMerged, getSessionHistory, getTodayData, dropTodayRawText } from "@/lib/storage";
import { exchangeCode, cachedLocation, type LocationSession } from "@/lib/sync/session";
import { syncDayToSupabase, pullDayFromSupabase, storeSyncCode, autoSyncIfConnected } from "@/lib/sync/push-day";
import { syncCheckinsToSupabase, pullCheckinsFromSupabase } from "@/lib/sync/push-checkins";
import { reopenDayIfClosed } from "@/lib/sync/day-close";
import { clearReportRequest } from "@/lib/sync/report-request";
import { SUPABASE_URL, DEFAULT_SYNC_CODE } from "@/lib/sync/config";
import type { MergeResult } from "@/lib/merge";
import { mergeVipIntoClients } from "@/lib/vip";
import { recordSessionGuests } from "@/lib/guests";
import { isComp } from "@/lib/utils";
import { computeImpact } from "@/lib/impact";
import { useApp } from "@/contexts/AppContext";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import SettingsToggle from "@/components/SettingsToggle";
import AnalyseProgress from "@/components/AnalyseProgress";
import ImpactScreen from "@/components/ImpactScreen";

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

// Sync settings — connect this device to the secure cloud (EU, encrypted) with a location code.
function SyncDrawer({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState(DEFAULT_SYNC_CODE);
  const [loc, setLoc] = useState<LocationSession | null>(() => cachedLocation());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  async function connect() {
    const c = code.trim();
    if (!c) return;
    if (!SUPABASE_URL) { setErr("Synchronisation non configurée sur ce serveur."); return; }
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const s = await exchangeCode(c);
      setLoc(s);
      storeSyncCode(c); // keep the code so uploads auto-sync without re-asking
      // Pull the session already in the cloud (decrypted on-device) so you see it here.
      try {
        const { pulled } = await pullDayFromSupabase(c);
        // Reconcile check-ins in the background — must NEVER gate the roster→redirect.
        void pullCheckinsFromSupabase(c).catch(() => {});
        if (pulled > 0) {
          setNote(`Session récupérée · ${pulled} client(s) — ouverture…`);
          setTimeout(() => window.location.assign("/search"), 800);
        } else {
          setNote("Connecté. Aucune session dans le cloud — téléverse puis « Synchroniser maintenant ».");
        }
      } catch (e) {
        setNote("Connecté, mais récupération échouée : " + (e as Error).message);
      }
    } catch (e) {
      const m = (e as Error).message;
      setErr(
        m === "invalid_code" ? "Code invalide."
        : m === "rate_limited" ? "Trop d'essais — réessaie dans quelques minutes."
        : m.startsWith("auth_failed") ? `Le serveur a refusé la connexion (${m.replace("auth_failed_", "HTTP ")}).`
        : "Serveur injoignable — vérifie la connexion internet."
      );
    } finally {
      setBusy(false);
    }
  }

  async function pushNow() {
    const c = code.trim();
    if (!c) { setErr("Entre le code pour synchroniser."); return; }
    setBusy(true); setErr(""); setNote("");
    try {
      const { pushed } = await syncDayToSupabase(c);
      await syncCheckinsToSupabase(c); // Sync v2: push check-in state too
      setNote(pushed > 0 ? `${pushed} client(s) synchronisé(s) ✓` : "Aucun client chargé à synchroniser.");
    } catch (e) {
      setNote("Envoi échoué : " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md glass-liquid rounded-t-[28px] sm:rounded-[28px] p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-dark">Synchronisation</h2>
          <button onClick={onClose} aria-label="Fermer" className="p-2 glass-liquid rounded-full active:scale-95 transition-transform text-muted">✕</button>
        </div>
        {loc ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <div>
                <div className="font-bold text-dark">Connecté</div>
                <div className="text-sm text-muted">{loc.locationName} · {loc.role}</div>
              </div>
            </div>
            {note && <p className="text-sm text-brand font-semibold">{note}</p>}
            <button
              onClick={pushNow}
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
            <p className="text-xs text-muted leading-relaxed">
              Données chiffrées de bout en bout (UE). Dans Supabase, les noms et chambres sont illisibles (chiffrés) ; seul cet appareil les déchiffre.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">Entre le code de synchronisation de l&apos;établissement pour relier cet appareil au cloud sécurisé.</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") connect(); }}
              placeholder="CODE-XXXX-XXXX"
              autoCapitalize="characters"
              className="w-full px-4 py-3 rounded-2xl glass-liquid text-dark text-center tracking-[0.2em] font-bold uppercase"
            />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              onClick={connect}
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? "Connexion…" : "Connecter"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const { t } = useApp();
  const [isAddMode, setIsAddMode] = useState(false);
  const unifiedCaptureRef = useRef<PhotoCaptureHandle>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // View state: home → processing/pdf-processing (narration) → impact (preview) → /search,
  // or in reception "pick" mode → impact (preview) → sent (transmis) → /reception.
  const [view, setView] = useState<"home" | "processing" | "pdf-processing" | "impact" | "sent">("home");
  const [analyseElapsed, setAnalyseElapsed] = useState(0);
  const [procElapsed, setProcElapsed] = useState(0); // live seconds while analysing
  const analyseStartRef = useRef<number | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  // Reception "Téléverser" → ?pick=1: skip the general home, go straight to choosing a doc.
  const [pickMode, setPickMode] = useState(false);
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
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<SessionRecord | null>(null);

  // Check for active session
  const [activeSession, setActiveSession] = useState<{ rooms: number } | null>(null);
  const [mergeBanner, setMergeBanner] = useState<MergeResult | null>(null);
  const [tablePage, setTablePage] = useState(0);
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
      if (params.get("pick") === "1") {
        // Reception upload: clean screen + open the chooser immediately (no Bonsoir home).
        setPickMode(true);
        setActionSheetOpen(true);
      }
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

  // Live elapsed seconds while analysing (photo + PDF) — feeds the compact narration.
  useEffect(() => {
    const analysing = view === "processing" || view === "pdf-processing";
    if (!analysing) { setProcElapsed(0); return; }
    const allDone = pdfUploads.length > 0 && pdfUploads.every((p) => p.status === "done" || p.status === "error");
    if (allDone) return;
    const start = analyseStartRef.current ?? Date.now();
    const timer = setInterval(() => setProcElapsed((Date.now() - start) / 1000), 250);
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

  // Stamp when analysis begins so the impact screen can show real "analysé en X s".
  useEffect(() => {
    if (view === "processing" || view === "pdf-processing") {
      if (analyseStartRef.current === null) analyseStartRef.current = Date.now();
    } else if (view === "home") {
      analyseStartRef.current = null;
    }
  }, [view]);

  // Transition straight to the impact resume screen, capturing the real analysis time.
  const enterImpact = () => {
    if (analyseStartRef.current) {
      setAnalyseElapsed((Date.now() - analyseStartRef.current) / 1000);
    }
    setView("impact");
  };

  // Unified handler: auto-routes clients vs VIP based on document type
  const handleUnifiedResult = (clientPages: Client[], vipPages: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clientPages.length > 0) setBaseClients(clientPages);
    if (vipPages.length > 0) setVipRawClients(vipPages);
    if (clientPages.length > 0 || vipPages.length > 0) enterImpact();
  };

  // Fallback for non-typed processing (Tesseract fallback)
  const handleOCRProcessed = (clients: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clients.length > 0) {
      setBaseClients(clients);
      enterImpact();
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
    enterImpact();
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
    enterImpact();
  };

  // CTA on the impact resume screen: persist the clean roster, sync, and start service.
  const confirmAndStart = () => {
    // Tag any client without an explicit vipSource as 'breakfast_list'.
    // VIP-list-only clients are already tagged inside mergeVipIntoClients.
    const tagged = parsedClients.map((c) =>
      c.vipSource ? c : { ...c, vipSource: "breakfast_list" as const }
    );
    const result = saveClientsMerged(tagged);
    // Data minimization: the clean roster is now saved — drop the raw OCR dump.
    // (Photos are never persisted; this is the only raw PII blob.)
    dropTodayRawText();
    // Record guest profiles for returning-guest tracking
    recordSessionGuests(tagged);
    // Auto-sync to the cloud if this device is connected (encrypted, fire-and-forget)
    void autoSyncIfConnected();
    // A fresh upload re-opens the day across devices (clears any prior "closed" flag)
    // and dismisses the restaurant's "waiting for report" request.
    void reopenDayIfClosed();
    void clearReportRequest();

    const q =
      result.duplicatesSkipped > 0 || result.existing > 0
        ? `?merged=${result.added}&skipped=${result.duplicatesSkipped}&total=${result.merged.length}`
        : "";
    router.push(`/search${q}`);
  };

  // Reception "pick" mode: transmit the doc to the restaurant, show the done screen,
  // then return to the 3-tile reception home. Same merge — so uploading again later
  // (VIPs, an updated list) completes the active session instead of replacing it.
  const transmit = () => {
    const tagged = parsedClients.map((c) =>
      c.vipSource ? c : { ...c, vipSource: "breakfast_list" as const }
    );
    saveClientsMerged(tagged);
    dropTodayRawText();
    recordSessionGuests(tagged);
    void autoSyncIfConnected();
    void reopenDayIfClosed();
    void clearReportRequest();
    setView("sent");
    setTimeout(() => router.push("/reception"), 1800);
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSyncOpen(true)}
                aria-label="Synchronisation"
                className="p-2 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={() => setHistoryOpen(true)}
                aria-label="Historique"
                className="p-2 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Greeting (replaced by a clean upload prompt in reception "pick" mode) */}
          {pickMode ? (
            <div className="mt-4 mb-6">
              <h1 className="text-[28px] text-dark leading-tight" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
                Documents du jour
              </h1>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                Déposez le rapport du matin — il sera analysé puis transmis au restaurant.
              </p>
            </div>
          ) : (
            <div className="mt-6 mb-auto">
              <h1 className="text-[32px] font-black text-dark leading-tight tracking-tight">
                {getGreeting(t)}
              </h1>
              <p className="text-base text-muted mt-1">{t("upload.subtitle2")}</p>
            </div>
          )}

          {/* Main action buttons */}
          {pickMode ? (
            <button
              onClick={() => setActionSheetOpen(true)}
              className="mt-2 w-full rounded-[20px] border-2 border-dashed border-brand/30 bg-brand/[0.04] px-5 py-12 flex flex-col items-center gap-3 text-center active:scale-[0.98] transition-transform"
            >
              <span className="w-14 h-14 rounded-2xl bg-brand/12 grid place-items-center text-brand">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12" />
                </svg>
              </span>
              <span className="text-[17px] font-bold text-dark">Déposer ou téléverser</span>
              <span className="text-[12.5px] text-muted">PDF ou photos · jusqu&apos;à 20 pages</span>
            </button>
          ) : (
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

            {/* Secondary nav — Phosphor duotone, 4 entries */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Briefing Matin */}
              <button
                onClick={() => router.push("/morning-brief")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <PhSparkle weight="duotone" className="w-5 h-5 text-brand" />
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.morningBrief")}</span>
              </button>

              {/* Clients */}
              <button
                onClick={() => router.push("/clients")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <PhUsersThree weight="duotone" className="w-5 h-5 text-brand" />
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.clients")}</span>
              </button>

              {/* Reports */}
              <button
                onClick={() => router.push("/report")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <PhFileText weight="duotone" className="w-5 h-5 text-brand" />
                </div>
                <span className="text-xs font-bold text-dark">{t("upload.reports")}</span>
              </button>

              {/* Dashboard */}
              <button
                onClick={() => router.push("/dashboard")}
                className="glass-liquid rounded-[16px] p-4 flex flex-col items-center gap-2 active:scale-[0.96] transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-brand/8 dark:bg-brand/15 flex items-center justify-center">
                  <PhChartBar weight="duotone" className="w-5 h-5 text-brand" />
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
          )}
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

        {/* Sync settings */}
        {syncOpen && <SyncDrawer onClose={() => setSyncOpen(false)} />}

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

  // ─── IMPACT VIEW: resume + review + confirm (replaces the old review screen) ───
  if (view === "impact") {
    const impactSummary = computeImpact(parsedClients);
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="shrink-0 px-4 pt-3">
          <button
            onClick={() => setView("home")}
            className="flex items-center gap-1.5 px-3 py-1.5 glass-liquid rounded-full active:scale-[0.96] transition-all"
          >
            <svg className="w-4 h-4 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium text-brand">{t("upload.close")}</span>
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ImpactScreen
            impact={impactSummary}
            elapsedSec={analyseElapsed}
            clients={parsedClients}
            onStart={pickMode ? transmit : confirmAndStart}
            ctaLabel={pickMode ? "Transmettre au restaurant" : undefined}
          />
        </div>
      </div>
    );
  }

  // ─── SENT VIEW: reception transmitted the doc → back to the 3-tile home ───
  if (view === "sent") {
    return (
      <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto items-center justify-center px-8 text-center bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="w-20 h-20 rounded-full bg-green-500 grid place-items-center shadow-2xl shadow-green-500/30 animate-[popIn_0.3s_cubic-bezier(0.175,0.885,0.32,1.4)]">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-[28px] text-dark mt-6" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
          Transmis au restaurant
        </h1>
        <p className="text-muted text-sm mt-2">La journée est en cours d&apos;analyse. Le restaurant la voit déjà.</p>
        <style jsx>{`
          @keyframes popIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
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
        </div>

        {/* Processing content — compact narration while OCR runs */}
        <div className="flex-1 flex flex-col px-4 overflow-y-auto">
          {/* PhotoCapture stays mounted (drives the OCR + shows thumbnails) */}
          <div className="w-full">
            {captureElements}
          </div>
          <div className="mt-4">
            <AnalyseProgress stage={1} elapsed={procElapsed} />
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
    // Map the real per-file status onto the narration stage (no fake timer).
    const anyUploading = pdfUploads.some((p) => p.status === "uploading");
    const anyReading = pdfUploads.some((p) => p.status === "processing" || p.status === "verifying");
    const pdfStage = anyUploading ? 0 : anyReading ? 1 : allDone ? 4 : 2;
    const currentPdfName = (pdfUploads.find((p) => p.status === "processing" || p.status === "uploading") || pdfUploads[0])?.name;
    const erroredPdfs = pdfUploads.filter((p) => p.status === "error");

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
          {!allDone && (
            <AnalyseProgress stage={pdfStage} elapsed={procElapsed} fileName={currentPdfName} />
          )}
          {/* Surface only failed files (with retry) — keeps the view compact */}
          {erroredPdfs.map((pdf) => (
            <div key={pdf.name} className="glass-liquid rounded-[14px] p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 grid place-items-center shrink-0">
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-dark truncate">{pdf.name}</div>
                <div className="text-xs text-red-500 flex items-center gap-2">
                  <span className="truncate">{pdf.error}</span>
                  <button
                    onClick={() => processPdf(pdf.file, pdfUploads.indexOf(pdf))}
                    className="text-brand font-bold underline shrink-0"
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <SettingsToggle />
      </div>
    );
  }

  // After analysis the flow goes straight to the impact resume screen — no separate review view.
  return null;
}
