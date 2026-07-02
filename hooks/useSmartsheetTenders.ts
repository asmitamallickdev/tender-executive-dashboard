// hooks/useSmartsheetTenders.ts
// Mirrors the useTenderData hook pattern but fetches from /api/smartsheet-tenders.
import { useState, useEffect, useCallback } from "react";
import { SmartsheetTender } from "../types/smartsheetTender";

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
let cache: { records: SmartsheetTender[]; timestamp: number } | null = null;

interface UseSmartsheetTendersResult {
  data: SmartsheetTender[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export const useSmartsheetTenders = (): UseSmartsheetTendersResult => {
  const [data, setData] = useState<SmartsheetTender[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (!forceRefresh && cache && now - cache.timestamp < CACHE_DURATION_MS) {
      setData(cache.records);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/smartsheet-tenders");
      const json = await response.json();

      if (!response.ok || !json.success) {
        // Use the server's meaningful error message
        const msg = json.error || `Server error (${response.status})`;
        throw new Error(msg);
      }

      const records: SmartsheetTender[] = json.data || [];
      cache = { records, timestamp: now };
      setData(records);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unexpected error fetching Smartsheet data"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
};

export default useSmartsheetTenders;
