import { useState, useEffect, useCallback } from "react";
import { EpcTenderRecord } from "../types/tender";
import { GoogleSheetService } from "../services/googleSheetService";

interface CacheEntry {
  records: EpcTenderRecord[];
  timestamp: number;
}

// 5 minutes cache duration
const CACHE_DURATION_MS = 5 * 60 * 1000;

// Module-level in-memory cache to persist records across component mounts
let tenderDataCache: CacheEntry | null = null;

// =========================================================================
// INTEGRATION ARCHITECTURE MODE
// =========================================================================
// Set this to "proxy" to fetch securely via the Node.js server (Path A).
// Set this to "csv" to fetch the public CSV export directly in the browser (Path B).
const FETCH_MODE: "proxy" | "csv" = "proxy";

interface UseTenderDataResult {
  data: EpcTenderRecord[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Custom React hook for fetching, caching, and refreshing Google Sheets tender records.
 * Supports dual-mode architecture: Secure Server Proxy (Path A) and Public CSV Export (Path B).
 */
export const useTenderData = (): UseTenderDataResult => {
  const [data, setData] = useState<EpcTenderRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const cacheKey = `laser_master_tender_list_${FETCH_MODE}`;

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now();

      // 1. Check Cache Validity (Only if not forcing a refresh)
      if (!forceRefresh && tenderDataCache && (now - tenderDataCache.timestamp < CACHE_DURATION_MS)) {
        setData(tenderDataCache.records);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        let records: EpcTenderRecord[] = [];

        if (FETCH_MODE === "proxy") {
          // =========================================================================
          // PATH A: FETCH VIA SECURE NODE.JS SERVER PROXY
          // =========================================================================
          const response = await fetch("/api/tenders");
          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Backend proxy error: ${response.statusText}. Details: ${errText}`);
          }
          
          const rawJson = await response.json() as EpcTenderRecord[];
          
          // Re-serialize stringified JSON dates back into native Date objects
          records = rawJson.map(rec => ({
            ...rec,
            tenderSubmittedDate: rec.tenderSubmittedDate ? new Date(rec.tenderSubmittedDate) : null,
            lastDateOfSubmission: rec.lastDateOfSubmission ? new Date(rec.lastDateOfSubmission) : null,
            tenderOpeningDate: rec.tenderOpeningDate ? new Date(rec.tenderOpeningDate) : null,
            reverseAuctionDate: rec.reverseAuctionDate ? new Date(rec.reverseAuctionDate) : null,
            emdValidity: rec.emdValidity ? new Date(rec.emdValidity) : null
          }));

        } else {
          // =========================================================================
          // PATH B: FETCH VIA DIRECT PUBLIC CSV EXPORT (Zero Server Config)
          // =========================================================================
          const service = new GoogleSheetService();
          records = await service.fetchTenderRecordsViaCsv();
        }

        // 2. Write to cache
        tenderDataCache = {
          records,
          timestamp: now
        };

        setData(records);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("An unexpected error occurred while fetching the master tender list."));
      } finally {
        setLoading(false);
      }
    },
    [cacheKey]
  );

  // Fetch automatically on mount or when mode changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Public callback to trigger manual bypass reload
  const refresh = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  return { data, loading, error, refresh };
};
export default useTenderData;
