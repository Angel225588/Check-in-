"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { GuestNote, NoteTone } from "@/lib/notes";
import { loadNotes, addNote, updateNote, deleteNote, togglePin } from "@/lib/notes-store";

export interface NotesApi {
  notes: GuestNote[];
  ready: boolean;
  /** Set when a write did not land. The UI must say so rather than pretend. */
  saveError: boolean;
  clearError: () => void;
  add: (input: { tone: NoteTone; title: string; body: string; pinned?: boolean }) => Promise<void>;
  edit: (id: string, patch: Partial<Pick<GuestNote, "tone" | "title" | "body" | "pinned">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  pin: (id: string) => Promise<void>;
}

/**
 * Notes are encrypted, so every read and write is async. The component tree
 * gets a plain array and four actions; the awaiting lives here.
 */
export function useGuestNotes(roomNumber: string, clientName: string, author: string): NotesApi {
  const [notes, setNotes] = useState<GuestNote[]>([]);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    setReady(false);
    loadNotes(roomNumber, clientName)
      .then((n) => { if (alive.current) { setNotes(n); setReady(true); } })
      .catch(() => { if (alive.current) { setNotes([]); setReady(true); } });
    return () => { alive.current = false; };
  }, [roomNumber, clientName]);

  const run = useCallback(async (op: () => Promise<GuestNote[]>) => {
    try {
      const next = await op();
      if (alive.current) { setNotes(next); setSaveError(false); }
    } catch {
      // Storage is full or unavailable. Surface it — a note that silently
      // failed to save is the same class of bug as a check-in that did.
      if (alive.current) setSaveError(true);
    }
  }, []);

  return {
    notes,
    ready,
    saveError,
    clearError: useCallback(() => setSaveError(false), []),
    add: useCallback((input) => run(() => addNote(roomNumber, clientName, { ...input, author })), [run, roomNumber, clientName, author]),
    edit: useCallback((id, patch) => run(() => updateNote(roomNumber, clientName, id, patch, author)), [run, roomNumber, clientName, author]),
    remove: useCallback((id) => run(() => deleteNote(roomNumber, clientName, id)), [run, roomNumber, clientName]),
    pin: useCallback((id) => run(() => togglePin(roomNumber, clientName, id, author)), [run, roomNumber, clientName, author]),
  };
}
