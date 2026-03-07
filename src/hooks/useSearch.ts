"use client";
import { useState, useMemo } from "react";
import { Client } from "@/lib/types";
import { searchClients } from "@/lib/utils";

export function useSearch(clients: Client[]) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"numeric" | "alpha">("numeric");

  const results = useMemo(
    () => searchClients(clients, query, mode),
    [clients, query, mode]
  );

  const appendKey = (key: string) => {
    setQuery((prev) => prev + key);
  };

  const backspace = () => {
    setQuery((prev) => prev.slice(0, -1));
  };

  const clear = () => {
    setQuery("");
  };

  const toggleMode = () => {
    setQuery("");
    setMode((prev) => (prev === "numeric" ? "alpha" : "numeric"));
  };

  return {
    query,
    setQuery,
    mode,
    results,
    appendKey,
    backspace,
    clear,
    toggleMode,
  };
}
