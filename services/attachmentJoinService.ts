import { EpcTenderRecord } from "../types/tender";

/**
 * Service responsible for performing a left join between the primary EPC Tender records
 * and the secondary Costing Attachment spreadsheet.
 */
export class AttachmentJoinService {
  /**
   * Normalizes a join key (tender/NIT reference number):
   * - Trims leading/trailing whitespace
   * - Collapses multiple spaces into a single space
   * - Converts to uppercase
   */
  public static normalizeKey(key: string | null | undefined): string {
    if (!key) return "";
    return key
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  /**
   * Performs an in-memory left join between tender records and raw costing sheet rows.
   * Enriches matching records with `attachmentUrl`.
   * 
   * @param tenders List of parsed EpcTenderRecords from Sheet 1
   * @param costingRows Raw matrix of values from Sheet 2 (first row must be headers)
   */
  public static join(tenders: EpcTenderRecord[], costingRows: string[][]): EpcTenderRecord[] {
    if (!tenders || tenders.length === 0) {
      return [];
    }

    if (!costingRows || costingRows.length === 0) {
      // If costing rows are missing, return tenders as-is (left join with nulls)
      return tenders.map(t => ({ ...t, attachmentUrl: null }));
    }

    // 1. Map columns using robust header matching
    const headers = costingRows[0].map(h => h.trim());
    
    const normalizeHeader = (h: string): string => {
      return h.trim().toLowerCase().replace(/\s+/g, "");
    };

    // We look for "tenderrefno" and "attachmenturl"
    const refNoIdx = headers.findIndex(h => normalizeHeader(h) === "tenderrefno");
    const attachmentUrlIdx = headers.findIndex(h => normalizeHeader(h) === "attachmenturl");

    if (refNoIdx === -1 || attachmentUrlIdx === -1) {
      console.warn(`[AttachmentJoinService] Warning: Costing Sheet headers mismatch. Found: ${JSON.stringify(headers)}. Left-joining with null attachments.`);
      return tenders.map(t => ({ ...t, attachmentUrl: null }));
    }

    // 2. Build the Lookup Map (normalizedRefNo -> attachmentUrl)
    const lookupMap = new Map<string, string>();

    for (let i = 1; i < costingRows.length; i++) {
      const row = costingRows[i];
      if (!row || row.length === 0) continue;

      const rawRefNo = refNoIdx < row.length ? row[refNoIdx] : "";
      const rawUrl = attachmentUrlIdx < row.length ? row[attachmentUrlIdx] : "";

      if (!rawRefNo || !rawUrl) continue;

      const normalizedRefNo = this.normalizeKey(rawRefNo);
      const url = rawUrl.trim();

      if (normalizedRefNo && url && url !== "-") {
        lookupMap.set(normalizedRefNo, url);
      }
    }

    console.log(`[AttachmentJoinService] Built lookup map with ${lookupMap.size} unique costing attachments.`);

    // 3. Perform the Left Join
    let matchCount = 0;
    const enrichedTenders = tenders.map(tender => {
      // Match on Tender No / NIT No
      const normalizedTenderNo = this.normalizeKey(tender.tenderNoNitNo);
      
      let attachmentUrl: string | null = null;

      if (normalizedTenderNo && lookupMap.has(normalizedTenderNo)) {
        attachmentUrl = lookupMap.get(normalizedTenderNo)!;
        matchCount++;
      }

      return {
        ...tender,
        attachmentUrl
      };
    });

    console.log(`[AttachmentJoinService] Successfully left-joined: enriched ${matchCount} of ${tenders.length} tender records.`);
    return enrichedTenders;
  }
}
