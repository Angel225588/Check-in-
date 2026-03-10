"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Client, VipEntry, SessionRecord } from "@/lib/types";
import { saveClients, getSessionHistory } from "@/lib/storage";
import { mergeVipIntoClients } from "@/lib/vip";
import { useApp } from "@/contexts/AppContext";
import PhotoCapture, { PhotoCaptureHandle } from "@/components/PhotoCapture";
import CsvImporter from "@/components/CsvImporter";
import DataTable from "@/components/DataTable";

function HistoryDrawer({
  sessions,
  isOpen,
  onClose,
  onViewSession,
}: {
  sessions: SessionRecord[];
  isOpen: boolean;
  onClose: () => void;
  onViewSession: (session: SessionRecord) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-sm bg-[#F2F2F7] dark:bg-[#0A0A0F] h-full shadow-xl flex flex-col animate-[slideIn_0.25s_ease-out]">
        <div className="shrink-0 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-dark">Past Sessions</h2>
          <button onClick={onClose} className="p-2 glass-liquid rounded-full active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {sessions.length === 0 && (
            <p className="text-muted text-center py-8">No past sessions</p>
          )}
          {sessions.map((s, i) => (
            <button
              key={i}
              onClick={() => onViewSession(s)}
              className="w-full text-left p-4 glass-liquid rounded-[14px] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{s.date}</span>
                <span className="text-xs text-muted">
                  {new Date(s.closedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex gap-4 text-sm text-muted">
                <span>{s.totalRooms} rooms</span>
                <span className="text-green-700">{s.totalEntered} in</span>
                <span className="text-error">{s.totalRemaining} rem</span>
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
}: {
  session: SessionRecord | null;
  onClose: () => void;
}) {
  if (!session) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto relative w-full max-w-lg bg-[#F2F2F7] dark:bg-[#0A0A0F] h-full shadow-xl flex flex-col animate-[slideIn_0.25s_ease-out]">
        <div className="shrink-0 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Session: {session.date}</h2>
            <p className="text-xs text-muted">
              Closed at{" "}
              {new Date(session.closedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 glass-liquid rounded-full active:scale-95 transition-transform">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="glass-liquid rounded-[14px] p-3">
              <div className="text-xs text-muted">Rooms</div>
              <div className="text-xl font-bold">{session.totalRooms}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3">
              <div className="text-xs text-green-700">Entered</div>
              <div className="text-xl font-bold text-green-700">{session.totalEntered}</div>
            </div>
            <div className="glass-liquid rounded-[14px] p-3">
              <div className="text-xs text-error">Remaining</div>
              <div className="text-xl font-bold text-error">{session.totalRemaining}</div>
            </div>
          </div>

          <div>
            <h3 className="font-bold mb-2">Client List ({session.clients.length})</h3>
            <div className="overflow-x-auto glass-liquid rounded-[14px]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="px-2 py-1.5 text-left text-muted font-medium">Room</th>
                    <th className="px-2 py-1.5 text-left text-muted font-medium">Name</th>
                    <th className="px-2 py-1.5 text-center text-muted font-medium">Adl</th>
                    <th className="px-2 py-1.5 text-center text-muted font-medium">Chl</th>
                    <th className="px-2 py-1.5 text-left text-muted font-medium">Pkg</th>
                  </tr>
                </thead>
                <tbody>
                  {session.clients.map((c, i) => (
                    <tr key={i} className={`border-t border-black/5 ${c.isVip ? "bg-brand-50/50" : ""}`}>
                      <td className="px-2 py-1.5 font-mono font-bold">
                        {c.roomNumber}
                        {c.isVip && (
                          <span className="ml-1 text-[9px] bg-brand-light text-dark px-1 rounded font-bold">
                            VIP
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{c.name}</td>
                      <td className="px-2 py-1.5 text-center">{c.adults}</td>
                      <td className="px-2 py-1.5 text-center">{c.children}</td>
                      <td className="px-2 py-1.5">{c.packageCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {session.rawUploadText && (
            <details>
              <summary className="text-sm text-muted cursor-pointer font-medium">
                Raw Uploaded Data
              </summary>
              <pre className="mt-2 text-[10px] glass-liquid p-3 rounded-[14px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                {session.rawUploadText}
              </pre>
            </details>
          )}

          {session.checkIns.length > 0 && (
            <div>
              <h3 className="font-bold mb-2">Check-in Log</h3>
              <div className="space-y-1">
                {session.checkIns.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs p-2 glass-liquid rounded-lg">
                    <span className="font-mono text-muted w-12">
                      {new Date(r.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="font-bold font-mono">{r.roomNumber}</span>
                    <span className="text-muted truncate flex-1">{r.clientName}</span>
                    <span className="bg-brand-50 text-brand px-1.5 py-0.5 rounded-full font-bold">
                      {r.peopleEntered}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const { t } = useApp();
  const clientCaptureRef = useRef<PhotoCaptureHandle>(null);
  const vipCaptureRef = useRef<PhotoCaptureHandle>(null);

  // Independent state for each upload — order doesn't matter
  const [baseClients, setBaseClients] = useState<Client[]>([]);
  const [vipRawClients, setVipRawClients] = useState<Client[]>([]);
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [showManual, setShowManual] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingSession, setViewingSession] = useState<SessionRecord | null>(null);

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
  }, []);

  const handleOCRProcessed = (clients: Client[], rawText: string) => {
    setOcrRawText(rawText);
    if (clients.length > 0) {
      setBaseClients(clients);
    }
  };

  const handleVipProcessed = (vipClients: Client[]) => {
    if (vipClients.length > 0) {
      setVipRawClients(vipClients);
    }
  };

  const handleManualParsed = (clients: Client[]) => {
    setBaseClients(clients);
    setShowManual(false);
  };

  const handleConfirm = () => {
    saveClients(parsedClients, ocrRawText);
    router.push("/search");
  };

  const handleClear = () => {
    setBaseClients([]);
    setVipRawClients([]);
    setOcrRawText("");
  };

  return (
    <div className="flex flex-col h-dvh w-full max-w-2xl mx-auto overflow-hidden bg-[#F2F2F7]">
      {/* Header */}
      <div className="shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand/8 to-brand-light/5 dark:from-brand/5 dark:to-brand-light/3" />
        <div className="relative px-4 pt-4 pb-3">
          {/* Top row: brand + actions */}
          <div className="flex items-center justify-between mb-4">
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
                onClick={() => setHistoryOpen(true)}
                className="p-2 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                onClick={() => router.push("/search")}
                className="px-3 py-1.5 glass-liquid rounded-full active:scale-95 transition-transform"
              >
                <span className="text-sm font-medium text-brand">{t("upload.checkin")}</span>
              </button>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[26px] font-black text-dark leading-tight">
            {t("upload.title")}
          </h1>
          <p className="text-sm text-muted mt-0.5">{t("upload.subtitle")}</p>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6 space-y-3">
        {/* Upload cards — tap to open native picker */}
        <div className="grid grid-cols-2 gap-3">
          {/* Client List card */}
          <button
            onClick={() => clientCaptureRef.current?.openPicker()}
            className="relative text-left p-4 rounded-[14px] active:scale-[0.97] transition-all glass-liquid"
          >
            <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-sm font-bold text-dark">{t("upload.clientList")}</div>
            <div className="text-[11px] text-muted mt-0.5">{t("upload.clientListDesc")}</div>
            {clientsUploaded && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>

          {/* VIP List card */}
          <button
            onClick={() => vipCaptureRef.current?.openPicker()}
            className="relative text-left p-4 rounded-[14px] active:scale-[0.97] transition-all glass-liquid"
          >
            <div className="w-10 h-10 rounded-full bg-brand-light/15 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-brand-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="text-sm font-bold text-dark">{t("upload.vipList")}</div>
            <div className="text-[11px] text-muted mt-0.5">{t("upload.vipListDesc")}</div>
            {vipCount > 0 && (
              <div className="absolute top-3 right-3 min-w-6 h-6 px-1.5 rounded-full bg-brand flex items-center justify-center">
                <span className="text-[11px] text-white font-bold">{vipCount}</span>
              </div>
            )}
          </button>
        </div>

        {/* Hidden PhotoCapture instances (just inputs + thumbnails) */}
        <PhotoCapture ref={clientCaptureRef} onProcessed={handleOCRProcessed} />
        <PhotoCapture ref={vipCaptureRef} onProcessed={handleVipProcessed} apiEndpoint="/api/ocr-vip" />

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

              {/* Verification stats */}
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

              {/* Warnings */}
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

        {/* Review table */}
        <DataTable
          clients={parsedClients}
          onConfirm={handleConfirm}
          onClear={handleClear}
        />

        {/* Dashboard — big button for managers */}
        <button
          onClick={() => router.push("/dashboard")}
          className="w-full rounded-[14px] p-4 active:scale-[0.97] transition-all bg-gradient-to-r from-blue-600/10 to-indigo-600/10 dark:from-blue-500/15 dark:to-indigo-500/15 border border-blue-500/20 dark:border-blue-400/20"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13h4v8H3V13zm7-8h4v16h-4V5zm7 4h4v12h-4V9z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-bold text-blue-700 dark:text-blue-300">{t("upload.dashboard")}</div>
              <div className="text-[11px] text-blue-600/70 dark:text-blue-400/70">{t("upload.dashboardDesc")}</div>
            </div>
            <svg className="w-5 h-5 text-blue-500/50 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Manual paste — collapsed as a button */}
        {!showManual ? (
          <button
            onClick={() => setShowManual(true)}
            className="w-full glass-liquid rounded-[14px] p-3 flex items-center gap-3 active:scale-[0.98] transition-all"
          >
            <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
              <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-dark">{t("upload.pasteManually")}</div>
              <div className="text-[11px] text-muted">{t("upload.pasteManuallyDesc")}</div>
            </div>
          </button>
        ) : (
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

      {/* Bottom confirm bar — fixed when data is ready */}
      {clientsUploaded && (
        <div className="shrink-0 px-4 pb-4 pt-2 bg-gradient-to-t from-[#F2F2F7] dark:from-[#0A0A0F] via-[#F2F2F7] dark:via-[#0A0A0F] to-transparent">
          <button
            onClick={handleConfirm}
            className="w-full bg-gradient-to-r from-brand to-brand-light text-white py-4 rounded-[52px] text-xl font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/25 dark:glow-brand"
          >
            {t("upload.startSession")} ({parsedClients.length} {t("upload.rooms")})
          </button>
        </div>
      )}

      {/* History Drawers */}
      <HistoryDrawer
        sessions={sessions}
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onViewSession={(s) => {
          setHistoryOpen(false);
          setViewingSession(s);
        }}
      />
      <SessionDetailDrawer
        session={viewingSession}
        onClose={() => setViewingSession(null)}
      />

      <style jsx>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
