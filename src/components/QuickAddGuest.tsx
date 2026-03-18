"use client";
import { useState, useMemo } from "react";
import { Client } from "@/lib/types";
import { getTodayData, addClient } from "@/lib/storage";
import { useApp } from "@/contexts/AppContext";

interface QuickAddGuestProps {
  roomNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onAdded: (client: Client) => void;
}

export default function QuickAddGuest({ roomNumber, isOpen, onClose, onAdded }: QuickAddGuestProps) {
  const { t } = useApp();
  const [name, setName] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);

  const allClients = useMemo(() => {
    if (!isOpen) return [];
    const data = getTodayData();
    return data?.clients ?? [];
  }, [isOpen]);

  const suggestions = useMemo(() => {
    if (!name.trim()) return [];
    const q = name.trim().toLowerCase();
    return allClients
      .filter((c) => c.name.toLowerCase().includes(q) || c.roomNumber.includes(q))
      .slice(0, 5);
  }, [name, allClients]);

  if (!isOpen) return null;

  const handleAdd = () => {
    if (!name.trim()) return;
    const client: Client = {
      roomNumber,
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: name.trim(),
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "",
      adults,
      children,
      rateCode: "",
      packageCode: "",
    };
    addClient(client);
    onAdded(client);
    setName("");
    setAdults(1);
    setChildren(0);
    onClose();
  };

  const handleSelectSuggestion = (c: Client) => {
    setName(c.name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 dark:bg-black/60" />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-[#1C1C1E] rounded-t-[20px] p-5 pb-8 animate-[slideUp_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-black/10 dark:bg-white/15 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-dark mb-1">{t("checkin.addClient")}</h3>
        <p className="text-sm text-muted mb-4">Room {roomNumber}</p>

        {/* Searchable name input */}
        <div className="mb-3 relative">
          <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.guestName")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 rounded-xl glass-liquid text-dark text-lg focus:outline-none focus:ring-2 focus:ring-brand/30"
            placeholder="Guest name"
            maxLength={100}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-[#2C2C2E] rounded-xl shadow-lg border border-black/5 dark:border-white/10 max-h-40 overflow-y-auto z-10">
              {suggestions.map((s, i) => (
                <button
                  key={`${s.roomNumber}-${i}`}
                  onClick={() => handleSelectSuggestion(s)}
                  className="w-full text-left px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <span className="font-mono text-sm text-brand mr-2">{s.roomNumber}</span>
                  <span className="text-sm text-dark">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Adults / Children counters */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.adults")}</label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setAdults(Math.max(0, adults - 1))}
                className="w-10 h-10 rounded-xl glass-liquid flex items-center justify-center text-lg font-bold text-dark active:scale-90 transition-all"
              >-</button>
              <span className="text-xl font-bold text-dark tabular-nums w-8 text-center">{adults}</span>
              <button
                onClick={() => setAdults(Math.min(20, adults + 1))}
                className="w-10 h-10 rounded-xl glass-liquid flex items-center justify-center text-lg font-bold text-dark active:scale-90 transition-all"
              >+</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted uppercase tracking-wide font-medium">{t("checkin.children")}</label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setChildren(Math.max(0, children - 1))}
                className="w-10 h-10 rounded-xl glass-liquid flex items-center justify-center text-lg font-bold text-dark active:scale-90 transition-all"
              >-</button>
              <span className="text-xl font-bold text-dark tabular-nums w-8 text-center">{children}</span>
              <button
                onClick={() => setChildren(Math.min(20, children + 1))}
                className="w-10 h-10 rounded-xl glass-liquid flex items-center justify-center text-lg font-bold text-dark active:scale-90 transition-all"
              >+</button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-[52px] glass-liquid text-muted font-semibold active:scale-[0.97] transition-all"
          >
            {t("checkin.cancel")}
          </button>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="flex-1 py-3 rounded-[52px] bg-gradient-to-r from-brand to-brand-light text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-brand/20 disabled:opacity-40"
          >
            {t("checkin.save")}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
