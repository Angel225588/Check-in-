"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  Cake,
  Heart,
  Sparkle,
  Crown,
  WarningCircle,
  Users,
  ChartBar,
  TrendUp,
  Calendar,
  ChatCircleText,
  Gift,
  Star,
} from "@phosphor-icons/react/dist/ssr";
import {
  getMorningBrief,
  saveMorningBrief,
  emptyBrief,
  mockMorningBrief,
  MorningBrief,
} from "@/lib/morning-brief";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function MorningBriefPage() {
  const router = useRouter();
  const [brief, setBrief] = useState<MorningBrief | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const existing = getMorningBrief(today);
    setBrief(existing ?? emptyBrief(today));
  }, []);

  const seedDemo = () => {
    const demo = mockMorningBrief();
    saveMorningBrief(demo);
    setBrief(demo);
  };

  const handleUpload = async (files: File[]) => {
    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      const res = await fetch("/api/ocr-morning-brief", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Échec de l'extraction.");
        return;
      }
      // Force today's date so the dashboard picks it up
      const today = new Date().toISOString().split("T")[0];
      const extracted: MorningBrief = { ...data.brief, date: today };
      saveMorningBrief(extracted);
      setBrief(extracted);
      const summary: string[] = [];
      if (extracted.forecast.length) summary.push(`${extracted.forecast.length} jours forecast`);
      if (extracted.specialEvents.length) summary.push(`${extracted.specialEvents.length} événements (anniv. / honeymoon)`);
      if (extracted.ambassadors.length) summary.push(`${extracted.ambassadors.length} ambassadeurs`);
      setUploadSuccess(summary.length ? `Extrait : ${summary.join(" · ")}` : "Aucune donnée détectée dans ce document.");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Échec du téléversement.");
    } finally {
      setUploading(false);
    }
  };

  const isEmpty =
    brief !== null &&
    brief.forecast.length === 0 &&
    brief.gss.length === 0 &&
    brief.comments.length === 0 &&
    brief.specialEvents.length === 0 &&
    brief.ambassadors.length === 0 &&
    brief.duty.length === 0;

  if (!brief) {
    return (
      <div className="flex items-center justify-center h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
        <div className="text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#FBF8F3] dark:bg-[#0A0A0F]">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 12mm; }
        }
      `}</style>

      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-[#FBF8F3]/90 dark:bg-[#0A0A0F]/90 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <Button
              variant="glass"
              size="sm"
              onClick={() => router.push("/")}
              className="no-print"
            >
              <CaretLeft weight="bold" className="size-4 text-brand" />
              <span className="text-brand">Accueil</span>
            </Button>
            <div className="flex flex-col items-end">
              <span
                className="text-sm font-bold tracking-[0.08em] text-brand leading-tight"
                style={{ fontFamily: "'Nunito', sans-serif" }}
              >
                COURTYARD
              </span>
              <span className="text-[10px] text-muted leading-tight">
                by{" "}
                <span className="font-bold tracking-[0.05em] text-slate">MARRIOTT</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-32 space-y-4 pt-2">
        {/* Title block — "Passionate · Forward · Inviting" */}
        <div className="text-center py-3">
          <p className="text-[10px] tracking-[0.4em] text-brand uppercase">
            Passionate · Forward · Inviting
          </p>
          <h1 className="text-xl font-black text-dark capitalize mt-1">
            Briefing du Matin
          </h1>
          <p className="text-xs text-muted mt-0.5">{brief.date}</p>
        </div>

        {/* Upload + demo seed card */}
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center gap-2">
              <Sparkle weight="duotone" className="size-5 text-brand" />
              <p className="text-sm text-dark font-bold">
                {isEmpty
                  ? "Aucun briefing pour aujourd'hui"
                  : "Mettre à jour le briefing"}
              </p>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Téléverse le PDF (ou les 2 photos recto/verso) du briefing Marriott
              Front Office — l&apos;IA extrait forecast, GSS, commentaires,
              ambassadeurs, événements et plus. Tout est sauvegardé localement.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <label className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-brand text-white text-sm font-bold cursor-pointer active:scale-[0.97] transition-all">
                {uploading ? "Extraction en cours…" : "Téléverser PDF / photo(s)"}
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const list = e.target.files;
                    if (list && list.length) handleUpload(Array.from(list));
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                onClick={seedDemo}
                variant="glass"
                size="sm"
                disabled={uploading}
                className="flex-1"
              >
                Charger exemple démo
              </Button>
            </div>
            {uploadError && (
              <p className="text-[11px] text-error font-medium bg-error/10 rounded-lg px-3 py-2">
                {uploadError}
              </p>
            )}
            {uploadSuccess && (
              <p className="text-[11px] text-green-700 dark:text-green-400 font-medium bg-green-500/10 rounded-lg px-3 py-2">
                ✓ {uploadSuccess}
              </p>
            )}
          </CardContent>
        </Card>

        {/* FORECAST 7 jours */}
        {brief.forecast.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <ChartBar weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Forecast 7 jours
                </h2>
              </div>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-[10px] tabular-nums">
                  <thead>
                    <tr className="text-muted text-[8px] uppercase">
                      <th className="px-2 py-1 text-left">Jour</th>
                      <th className="px-1 py-1 text-right">Limit</th>
                      <th className="px-1 py-1 text-right">Occ</th>
                      <th className="px-1 py-1 text-right">% Occ</th>
                      <th className="px-1 py-1 text-right">Arr</th>
                      <th className="px-1 py-1 text-right">Dép</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brief.forecast.map((d, i) => (
                      <tr
                        key={i}
                        className="border-t border-black/5 dark:border-white/8"
                      >
                        <td className="px-2 py-1.5 font-bold text-dark whitespace-nowrap">
                          {d.date}
                        </td>
                        <td className="px-1 py-1.5 text-right text-muted">{d.sellLimit}</td>
                        <td className="px-1 py-1.5 text-right text-dark font-bold">{d.occupied}</td>
                        <td className="px-1 py-1.5 text-right text-brand font-bold">
                          {d.occupancyPercent.toFixed(1)}%
                        </td>
                        <td className="px-1 py-1.5 text-right text-green-600 dark:text-green-400">
                          ↑{d.arrivals}
                        </td>
                        <td className="px-1 py-1.5 text-right text-amber-600 dark:text-amber-400">
                          ↓{d.departures}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* GSS — Guest Satisfaction Scores */}
        {brief.gss.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <TrendUp weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  GSS — Guest Satisfaction Score
                </h2>
              </div>
              <div className="space-y-1.5">
                {brief.gss.map((s, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-center text-[11px]"
                  >
                    <span className="text-dark">{s.metric}</span>
                    <Badge variant="muted" className="tabular-nums">
                      MTD {s.mtd?.toFixed(1) ?? "—"}
                    </Badge>
                    <Badge variant="muted" className="tabular-nums">
                      YTD {s.ytd?.toFixed(1) ?? "—"}
                    </Badge>
                    {s.goal !== undefined && (
                      <Badge
                        variant={
                          s.mtd && s.goal && s.mtd >= s.goal ? "success" : "warning"
                        }
                        className="tabular-nums"
                      >
                        Goal {s.goal.toFixed(1)}
                      </Badge>
                    )}
                    {s.rank !== undefined && (
                      <Badge variant="default" className="tabular-nums">
                        #{s.rank}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* SPECIAL EVENTS — Anniversaires + Honeymoon */}
        {brief.specialEvents.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Cake weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Événements spéciaux
                </h2>
              </div>
              <div className="space-y-2">
                {brief.specialEvents.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-3 py-2 rounded-[10px] bg-amber-500/[0.06]"
                  >
                    {e.type === "honeymoon" ? (
                      <Heart weight="duotone" className="size-5 text-pink-500 shrink-0" />
                    ) : (
                      <Cake weight="duotone" className="size-5 text-amber-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold font-mono text-dark">
                          {e.roomNumber}
                        </span>
                        <span className="text-xs font-bold text-dark">{e.guestName}</span>
                        <Badge
                          variant={e.status === "in_house" ? "success" : "info"}
                          className="text-[8px]"
                        >
                          {e.status === "in_house" ? "In House" : "Arriving"}
                        </Badge>
                      </div>
                      {e.reason && (
                        <p className="text-[10px] text-muted mt-0.5">
                          {e.reason}
                          {e.arrivalDate && <span className="ml-2">· {e.arrivalDate}</span>}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AMBASSADORS */}
        {brief.ambassadors.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Star weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Client Ambassadors
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {brief.ambassadors.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-brand/[0.05]"
                  >
                    <span className="text-xs font-bold font-mono text-dark">
                      {a.roomNumber}
                    </span>
                    <span className="text-xs text-dark flex-1 truncate">
                      {a.guestName}
                    </span>
                    <Badge
                      variant={a.status === "in_house" ? "success" : "info"}
                      className="text-[8px] shrink-0"
                    >
                      {a.status === "in_house" ? "In" : "Arr"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* TOP VIPs */}
        {brief.topVips.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <Crown weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Top VIPs
                </h2>
              </div>
              <div className="space-y-2">
                {brief.topVips.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-gradient-to-r from-brand/10 to-brand-light/10"
                  >
                    <span className="text-xs font-bold font-mono text-dark">
                      {v.roomNumber}
                    </span>
                    <span className="text-xs font-bold text-dark flex-1 truncate">
                      {v.guestName}
                    </span>
                    <Badge variant="vip" className="text-[8px]">
                      {v.vipLevel}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CLIENT COMMENTS */}
        {brief.comments.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <ChatCircleText weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Commentaires Clients
                </h2>
              </div>
              <div className="space-y-3">
                {brief.comments.map((c, i) => (
                  <div key={i} className="border-l-2 border-brand/40 pl-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-dark">{c.guestName}</span>
                      <Badge variant="muted" className="text-[8px]">
                        {c.source}
                      </Badge>
                      <span className="text-[9px] text-muted">{c.stayPeriod}</span>
                    </div>
                    <p className="text-[11px] text-dark/80 italic leading-relaxed">
                      «&nbsp;{c.text}&nbsp;»
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* COMPLAINTS */}
        {brief.complaints.length > 0 && (
          <Card className="border-error/30 bg-error/[0.03]">
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <WarningCircle weight="duotone" className="size-4 text-error" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-error">
                  Plaintes In House
                </h2>
              </div>
              <div className="space-y-2">
                {brief.complaints.map((c, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-[10px] bg-error/[0.05]"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      {c.roomNumber && (
                        <span className="text-xs font-bold font-mono text-dark">
                          {c.roomNumber}
                        </span>
                      )}
                      <span className="text-xs font-bold text-dark">{c.guestName}</span>
                    </div>
                    <p className="text-[11px] text-dark/80">{c.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* DUTY + GROUPS + FRONT OFFICE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brief.duty.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Users weight="duotone" className="size-4 text-brand" />
                  <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                    Duty
                  </h2>
                </div>
                <div className="space-y-1.5">
                  {brief.duty.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span className="text-muted">{d.dayLabel}</span>
                      <span className="text-dark font-bold">
                        {d.staffName}
                        {d.staffId && (
                          <span className="text-muted/70 font-normal ml-1 tabular-nums">
                            ({d.staffId})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {brief.groups.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar weight="duotone" className="size-4 text-brand" />
                  <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                    Groupes
                  </h2>
                </div>
                <div className="space-y-2">
                  {brief.groups.map((g, i) => (
                    <div key={i} className="text-[11px]">
                      <div className="font-bold text-dark font-mono">{g.code}</div>
                      <div className="text-muted">
                        {g.rooms} chambres
                        {g.contactName && <span className="ml-2">· {g.contactName}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* FRONT OFFICE STATS */}
        {brief.frontOffice && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-3">
                <TrendUp weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Front Office
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-lg font-black text-dark tabular-nums">
                    {brief.frontOffice.monthlyTargetCapture}
                  </div>
                  <div className="text-[8px] text-muted uppercase">Target capture</div>
                </div>
                <div>
                  <div
                    className={`text-lg font-black tabular-nums ${
                      brief.frontOffice.scoreActualMTD >=
                      brief.frontOffice.monthlyTargetCapture
                        ? "text-green-600 dark:text-green-400"
                        : "text-error"
                    }`}
                  >
                    {brief.frontOffice.scoreActualMTD}
                  </div>
                  <div className="text-[8px] text-muted uppercase">Score actual MTD</div>
                </div>
                <div>
                  <div className="text-lg font-black text-dark tabular-nums">
                    {brief.frontOffice.enrollmentsToday}/{brief.frontOffice.enrollmentsGoal}
                  </div>
                  <div className="text-[8px] text-muted uppercase">Enrollments J-1</div>
                </div>
                {brief.frontOffice.champion && (
                  <div>
                    <div className="text-sm font-black text-brand">
                      🏆 {brief.frontOffice.champion}
                    </div>
                    <div className="text-[8px] text-muted uppercase">Champion</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* THEME OF THE DAY */}
        {brief.themeOfDay && (
          <Card className="border-brand/30 bg-gradient-to-br from-brand/5 to-brand-light/5">
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Gift weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-brand">
                  Thème du jour
                </h2>
              </div>
              <p className="text-[12px] text-dark italic leading-relaxed">
                {brief.themeOfDay}
              </p>
            </CardContent>
          </Card>
        )}

        {/* MARRIOTT NEWS */}
        {brief.marriottNews && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Sparkle weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Marriott News
                </h2>
              </div>
              <p className="text-[11px] text-dark">{brief.marriottNews}</p>
            </CardContent>
          </Card>
        )}

        {/* INTERNAL ANNIVERSARIES */}
        {brief.internalAnniversary && brief.internalAnniversary.length > 0 && (
          <Card>
            <CardContent>
              <div className="flex items-center gap-2 mb-2">
                <Cake weight="duotone" className="size-4 text-brand" />
                <h2 className="text-[10px] uppercase tracking-wider font-bold text-muted">
                  Anniversaires Équipe
                </h2>
              </div>
              <div className="space-y-1">
                {brief.internalAnniversary.map((a, i) => (
                  <div key={i} className="text-[11px]">
                    <span className="font-bold text-dark">{a.name}</span>
                    <span className="text-muted ml-2">· {a.role}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
