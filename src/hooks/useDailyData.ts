"use client";
import { useState, useEffect, useCallback } from "react";
import { DailyData } from "@/lib/types";
import { getTodayData } from "@/lib/storage";

export function useDailyData() {
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    const d = getTodayData();
    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    data,
    clients: data?.clients ?? [],
    checkIns: data?.checkIns ?? [],
    loading,
    hasData: data !== null && data.clients.length > 0,
    refresh,
  };
}
