import crypto from "crypto";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

// Native multiline-aware .env file loader for local development testing (e.g. vercel dev)
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const regex = /^\s*([\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^#\n]*))/mg;
    let match;
    while ((match = regex.exec(envContent)) !== null) {
      const key = match[1];
      const value = match[2] || match[3] || match[4] || "";
      process.env[key] = value.trim();
    }
  }
} catch (e) {
  // Ignore in production
}

// Google Sheets locked parameters
const SPREADSHEET_ID = "1GTwzxMgViohbCimXqfiBZBJsKbCSr7hCgbcHF_En1VE";
const WORKSHEET_NAME = "LASER_Master_Tender_List";

// Vercel Serverless environment write-restriction compliant cache path
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const CACHE_DIR = isVercel 
  ? path.join("/tmp", "excel_cache") 
  : path.resolve(process.cwd(), "excel_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Downloads and parses an Excel costing sheet, extracting the Price Basis
 * and raw material rates. Uses a local filesystem cache (in /tmp for Vercel).
 */
async function getCostingDetails(attachmentUrl, docketNo) {
  if (!attachmentUrl) return null;
  
  const hash = crypto.createHash("md5").update(attachmentUrl).digest("hex");
  const localPath = path.join(CACHE_DIR, `${hash}.xlsx`);

  let fileExists = fs.existsSync(localPath);
  
  if (fileExists) {
    try {
      const stats = fs.statSync(localPath);
      const TTL_MS = 2 * 60 * 1000; // 2 minutes
      if (Date.now() - stats.mtimeMs > TTL_MS) {
        console.log(`[Cache] Cache expired for docket "${docketNo}" (older than 2 mins). Re-downloading...`);
        fileExists = false;
      }
    } catch (statErr) {
      console.warn(`[Cache] Error checking stats for cached file: ${statErr.message}`);
    }
  }
  
  if (!fileExists) {
    try {
      console.log(`[Cache] Downloading costing Excel for docket "${docketNo}"...`);
      const response = await fetch(attachmentUrl);
      if (!response.ok) {
        console.warn(`[Cache] Failed to download Excel for docket "${docketNo}": ${response.statusText}`);
        return null;
      }
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(localPath, Buffer.from(buffer));
      fileExists = true;
    } catch (err) {
      console.warn(`[Cache] Error downloading Excel for docket "${docketNo}": ${err.message}`);
      return null;
    }
  }

  if (fileExists) {
    try {
      const workbook = XLSX.readFile(localPath);
      const sheetName = "AUTO CALCULATION SHEET (2)";
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        console.warn(`[Cache] Sheet "${sheetName}" not found in Excel for docket "${docketNo}"`);
        return null;
      }

      // Extract Price Basis
      let priceBasis = "Firm";
      for (let c = 0; c < 5; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 7, c });
        const cell = sheet[cellRef];
        if (cell && cell.v) {
          const valStr = String(cell.v);
          if (valStr.toLowerCase().includes("variable")) {
            priceBasis = "Variable";
          }
        }
      }

      // Extract Material Prices
      const prices = {
        aluminium: null,
        aluminiumAlloy: null,
        copperTape: null,
        extrudedSemiconductive: null,
        htXlpe: null,
        pvcTypeSt2: null,
        galvanisedSteelFlatStrip: null,
        filler: null
      };

      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:ZZ100");

      // Material matching regex patterns
      const patterns = {
        aluminium: /^(aluminium|alumimium)$/i,
        aluminiumAlloy: /^(aluminium alloy|alumimium alloy)$/i,
        copperTape: /^(copper tape - 0\.060? mm|copper tape - 0\.06 mm|coper tape - 0\.1 mm|copper tape - 0\.03 mm|copper tape - 0\.035 mm|copper tape - 0\.04 mm|copper tape - 0\.045 mm|copper tape - 0\.050? mm|copper tape)$/i,
        extrudedSemiconductive: /^(extruded semiconductive|extruded semiconductive\(stripable\))$/i,
        htXlpe: /^(ht-xlpe|lt-xlpe|tr xlpe|xlpe)$/i,
        pvcTypeSt2: /^(pvc type st-2|fr pvc type st-2|frlsh pvc type st-2|pvc type st-2-pressure extruded)$/i,
        galvanisedSteelFlatStrip: /^(galvanised steel flat strip|galvanised steel flat strip \(double\)|galvanised steel flat strip-b|galvanised steel round wire|galvanised steel round wire \(double\))$/i,
        filler: /^filler$/i
      };

      // Find the header row dynamically by finding the row with the maximum matching material headers
      let bestRowIdx = -1;
      let maxMatchCount = 0;
      const maxSearchRow = Math.min(range.e.r, 40);

      for (let r = 0; r <= maxSearchRow; r++) {
        let matchCount = 0;
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = sheet[cellRef];
          if (cell && cell.v !== undefined) {
            const valStr = String(cell.v).trim().toLowerCase();
            const matchesAny = Object.values(patterns).some(regex => regex.test(valStr));
            if (matchesAny) {
              matchCount++;
            }
          }
        }
        if (matchCount > maxMatchCount) {
          maxMatchCount = matchCount;
          bestRowIdx = r;
        }
      }

      if (bestRowIdx !== -1 && maxMatchCount > 0) {
        const rowHeaderIdx = bestRowIdx;
        const rowRateIdx = bestRowIdx + 1;

        if (rowRateIdx <= range.e.r) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const cellHeaderRef = XLSX.utils.encode_cell({ r: rowHeaderIdx, c });
            const cellRateRef = XLSX.utils.encode_cell({ r: rowRateIdx, c });

            const headerCell = sheet[cellHeaderRef];
            const rateCell = sheet[cellRateRef];

            if (!headerCell) continue;

            const header = String(headerCell.v).trim().toLowerCase();
            const rateVal = rateCell && rateCell.v !== undefined && rateCell.v !== "" ? Number(rateCell.v) : null;

            if (rateVal === null || isNaN(rateVal)) continue;

            if (patterns.aluminium.test(header)) {
              if (prices.aluminium === null || prices.aluminium === 0) prices.aluminium = rateVal;
            } else if (patterns.aluminiumAlloy.test(header)) {
              if (prices.aluminiumAlloy === null || prices.aluminiumAlloy === 0) prices.aluminiumAlloy = rateVal;
            } else if (patterns.copperTape.test(header)) {
              if (prices.copperTape === null || prices.copperTape === 0) prices.copperTape = rateVal;
            } else if (patterns.extrudedSemiconductive.test(header)) {
              if (prices.extrudedSemiconductive === null || prices.extrudedSemiconductive === 0) prices.extrudedSemiconductive = rateVal;
            } else if (patterns.htXlpe.test(header)) {
              if (prices.htXlpe === null || prices.htXlpe === 0) prices.htXlpe = rateVal;
            } else if (patterns.pvcTypeSt2.test(header)) {
              if (prices.pvcTypeSt2 === null || prices.pvcTypeSt2 === 0) prices.pvcTypeSt2 = rateVal;
            } else if (patterns.galvanisedSteelFlatStrip.test(header)) {
              if (prices.galvanisedSteelFlatStrip === null || prices.galvanisedSteelFlatStrip === 0) prices.galvanisedSteelFlatStrip = rateVal;
            } else if (patterns.filler.test(header)) {
              if (prices.filler === null || prices.filler === 0) prices.filler = rateVal;
            }
          }
        }
      }

      return {
        priceBasis,
        prices
      };

    } catch (err) {
      console.warn(`[Cache] Error parsing Excel for docket "${docketNo}": ${err.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Serverless function route handler to fetch, validate, and parse Google Sheets tender data securely.
 */
export default async function handler(req, res) {
  // Enable CORS headers for safety and external access flexibility
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    console.error("❌ SERVERLESS ERROR: Service Account environment variables are missing.");
    return res.status(500).json({
      error: "Service Account credentials are not configured on Vercel. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY."
    });
  }

  try {
    // 1. Authenticate with Google
    let cleanKey = key.trim().replace(/^["']|["']$/g, "");
    cleanKey = cleanKey.replace(/\\n/g, "\n");
    let cleanEmail = email.trim().replace(/^["']|["']$/g, "");

    const accessToken = await getAccessToken(cleanEmail, cleanKey);
    
    // 2. Fetch data from Google Sheets API
    const range = `${WORKSHEET_NAME}!A1:ZZ`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Sheets API returned status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const rows = data.values || [];

    if (rows.length === 0) {
      return res.status(200).json([]);
    }

    // --- Fetch Costing Sheet Data ---
    let costingRows = [];
    try {
      const COSTING_SPREADSHEET_ID = "1m1ECaxiGYmQrvSPYOBov5YYFq8G-mVNMdPWvGcSfoHs";
      const COSTING_WORKSHEET_NAME = "TENDER COSTING ATTACHMENT";
      const costingRange = `${COSTING_WORKSHEET_NAME}!A1:ZZ`;
      const costingUrl = `https://sheets.googleapis.com/v4/spreadsheets/${COSTING_SPREADSHEET_ID}/values/${encodeURIComponent(costingRange)}`;

      const costingResponse = await fetch(costingUrl, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      if (costingResponse.ok) {
        const costingData = await costingResponse.json();
        costingRows = costingData.values || [];
      } else {
        const costingErrorText = await costingResponse.text();
        console.warn(`[WARNING] Failed to fetch costing sheet (status ${costingResponse.status}): ${costingErrorText}`);
      }
    } catch (costingErr) {
      console.warn(`[WARNING] Error fetching costing sheet: ${costingErr.message}`);
    }

    // 3. Validate Header Schema with Robust Normalization
    const normalizeHeader = (h) => {
      if (!h) return "";
      return h.toLowerCase()
        .trim()
        .replace(/\?/g, "")
        .replace(/\s+/g, " ")
        .replace(/decission/g, "decision")
        .replace(/submited/g, "submitted");
    };

    const headers = rows[0].map(h => h.trim());
    const normalizedActualMap = new Map();
    headers.forEach((header, idx) => {
      normalizedActualMap.set(normalizeHeader(header), idx);
    });

    const headerIndexMap = new Map();
    const requiredHeaders = [
      "SL No.", "Docket No", "Tender For", "Type of Tender", "Tender No / NIT No with Date",
      "Name of Work / Item Description", "Total Quantity in Meter", "Name of the Client",
      "Last Date of Submission", "Tender Opening Date", "Cost of Tender / Tender Fee (In Rs)",
      "EMD Amount (In Rs)", "Estimated Cost (In Rs)", "Bid Validity (in Days)",
      "Contract Period in Days", "Management Decision", "Participated", "Tender Prepare By",
      "Current Status", "Tender Submitted Date", "Reverse Auction Applicable", "Reverse Auction Date",
      "EMD Payment Through BG / NEFT", "BG No / UTR No", "EMD Validity", "LOI / PO No & Date",
      "Remarks", "Bid Validity Expired", "Diff % from L1", "Diff % from L2", "Reason", "Final Remarks"
    ];

    const missingHeaders = [];
    requiredHeaders.forEach(reqH => {
      const normalizedReq = normalizeHeader(reqH);
      if (normalizedActualMap.has(normalizedReq)) {
        headerIndexMap.set(reqH, normalizedActualMap.get(normalizedReq));
      } else {
        missingHeaders.push(reqH);
      }
    });

    if (missingHeaders.length > 0) {
      throw new Error(`Google Sheet schema mismatch. Missing columns: ${missingHeaders.join(", ")}`);
    }

    const docketIndex = headerIndexMap.get("Docket No");
    const records = [];

    // 4. Process and parse data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      // Ignore completely empty rows
      if (row.length === 0 || row.every(cell => cell === "")) {
        continue;
      }

      // Ignore rows without Docket No
      if (docketIndex >= row.length || !row[docketIndex] || row[docketIndex].trim() === "") {
        continue;
      }

      const parsedRecord = parseRow(row, headerIndexMap, i + 1);
      records.push(parsedRecord);
    }

    // --- Perform Left Join in Memory ---
    const cleanStr = (str) => {
      if (!str) return "";
      return str.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    const joinCostingData = (tenders, costing) => {
      if (!tenders || tenders.length === 0) return [];
      if (!costing || costing.length === 0) {
        return tenders.map(t => ({ ...t, attachmentUrl: null }));
      }

      const cHeaders = costing[0].map(h => h.trim());
      const cNormalizeHeader = (h) => h.trim().toLowerCase().replace(/\s+/g, "");

      const refNoIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "tenderrefno");
      const attachmentUrlIdx = cHeaders.findIndex(h => cNormalizeHeader(h) === "attachmenturl");

      if (refNoIdx === -1 || attachmentUrlIdx === -1) {
        console.warn(`[AttachmentJoin] Warning: Costing Sheet headers mismatch.`);
        return tenders.map(t => ({ ...t, attachmentUrl: null }));
      }

      // Build active list of costing records with cleaned references
      const costingList = [];
      for (let i = 1; i < costing.length; i++) {
        const cRow = costing[i];
        if (!cRow || cRow.length === 0) continue;

        const rawRefNo = refNoIdx < cRow.length ? cRow[refNoIdx] : "";
        const rawUrl = attachmentUrlIdx < cRow.length ? cRow[attachmentUrlIdx] : "";

        if (!rawRefNo || !rawUrl || rawUrl.trim() === "-" || rawUrl.trim() === "") continue;

        const url = rawUrl.trim();
        costingList.push({
          rawRefNo,
          cleanRef: cleanStr(rawRefNo),
          url
        });
      }

      let matchCount = 0;
      return tenders.map(tender => {
        const tenderNo = tender.tenderNoNitNo || "";
        const cleanTenderNo = cleanStr(tenderNo);
        let attachmentUrl = null;

        if (cleanTenderNo !== "") {
          // 1. Try exact match on clean alphanumeric strings
          let match = costingList.find(c => c.cleanRef === cleanTenderNo);
          
          // 2. If no exact match, try substring match (only if cleanTenderNo is at least 6 chars to prevent false positives)
          if (!match && cleanTenderNo.length >= 6) {
            match = costingList.find(c => c.cleanRef.includes(cleanTenderNo) || cleanTenderNo.includes(c.cleanRef));
          }

          if (match) {
            attachmentUrl = match.url;
            matchCount++;
          }
        }

        return {
          ...tender,
          attachmentUrl
        };
      });
    };

    const rawEnrichedRecords = joinCostingData(records, costingRows);

    // 5. Fetch and parse costing Excel details for matched records
    const enrichedRecords = await Promise.all(rawEnrichedRecords.map(async (tender) => {
      if (tender.attachmentUrl) {
        const details = await getCostingDetails(tender.attachmentUrl, tender.docketNo);
        if (details) {
          return {
            ...tender,
            priceBasis: details.priceBasis,
            aluminiumPrice: details.prices.aluminium,
            aluminiumAlloyPrice: details.prices.aluminiumAlloy,
            copperTapePrice: details.prices.copperTape,
            extrudedSemiconductivePrice: details.prices.extrudedSemiconductive,
            htXlpePrice: details.prices.htXlpe,
            pvcTypeSt2Price: details.prices.pvcTypeSt2,
            galvanisedSteelFlatStripPrice: details.prices.galvanisedSteelFlatStrip,
            fillerPrice: details.prices.filler
          };
        }
      }
      
      // Default / Fallback fields for skipped or missing costings (link is still provided if matched, but rates are null)
      return {
        ...tender,
        priceBasis: "Firm",
        aluminiumPrice: null,
        aluminiumAlloyPrice: null,
        copperTapePrice: null,
        extrudedSemiconductivePrice: null,
        htXlpePrice: null,
        pvcTypeSt2Price: null,
        galvanisedSteelFlatStripPrice: null,
        fillerPrice: null
      };
    }));

    return res.status(200).json(enrichedRecords);

  } catch (err) {
    console.error("❌ ERROR in serverless handler:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Signs a JWT and exchanges it for a Google OAuth2 Access Token.
 */
async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const base64UrlEncode = (obj) => {
    return Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaimSet = base64UrlEncode(claimSet);
  const stringToSign = `${encodedHeader}.${encodedClaimSet}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(stringToSign);
  const signature = sign.sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const assertion = `${stringToSign}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Parses a single raw row array into a structured JSON record.
 */
function parseRow(row, headerMap, rowNum) {
  const getValue = (columnName) => {
    const index = headerMap.get(columnName);
    if (index === undefined || index >= row.length) {
      return "";
    }
    return row[index].trim();
  };

  const parseNumber = (val) => {
    if (!val || val === "-") return null;
    const num = Number(val.replace(/[^\d.-]/g, ""));
    return isNaN(num) ? null : num;
  };

  const parsePercent = (val) => {
    if (!val || val === "-") return null;
    const hasPercent = val.includes("%");
    const num = Number(val.replace(/[^\d.-]/g, ""));
    if (isNaN(num)) return null;
    return hasPercent ? num / 100 : num;
  };

  const parseBool = (val) => {
    const lower = val.toLowerCase();
    return ["yes", "y", "true", "1", "applicable"].includes(lower);
  };

  const mapStatus = (status) => {
    if (!status) return "In Preparation";
    const normalized = status.trim().toLowerCase();
    if (
      normalized.includes("awarded") || 
      normalized.includes("won") || 
      normalized.includes("l1") || 
      normalized.includes("po received") || 
      normalized.includes("loi received")
    ) {
      return "Won";
    }
    if (
      normalized.includes("not in our favour") || 
      normalized.includes("lost") || 
      normalized.includes("l2") || 
      normalized.includes("l3") ||
      normalized.includes("rejected") ||
      normalized.includes("not participated")
    ) {
      return "Lost";
    }
    if (
      normalized.includes("technical bid opened") || 
      normalized.includes("financial evaluation") || 
      normalized.includes("under evaluation") || 
      normalized.includes("not evaluated") ||
      normalized.includes("evaluation") ||
      normalized.includes("date extended") ||
      normalized.includes("submitted") ||
      normalized.includes("tender opened")
    ) {
      return "Under Evaluation";
    }
    if (
      normalized.includes("ra pending") || 
      normalized.includes("reverse auction") ||
      normalized.includes("ra scheduled")
    ) {
      return "RA Pending";
    }
    if (normalized.includes("cancelled") || normalized.includes("canceled")) {
      return "Cancelled";
    }
    if (
      normalized.includes("preparation") || 
      normalized.includes("prep") || 
      normalized.includes("under preparation") ||
      normalized.includes("in preparation")
    ) {
      return "In Preparation";
    }
    return "Under Evaluation";
  };

  const parseDate = (val) => {
    if (!val || val === "-") return null;

    const standardDate = new Date(val);
    if (!isNaN(standardDate.getTime())) {
      return standardDate;
    }

    const regex = /^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/;
    const match = val.match(regex);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthStr = match[2].toLowerCase();
      const yearStr = match[3];

      const months = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
      };

      const month = months[monthStr];
      if (month !== undefined) {
        let year = parseInt(yearStr, 10);
        if (yearStr.length === 2) {
          year = year >= 70 ? 1900 + year : 2000 + year;
        }
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  };

  const slNoVal = parseNumber(getValue("SL No."));
  const slNo = slNoVal !== null ? slNoVal : rowNum;

  return {
    slNo,
    docketNo: getValue("Docket No"),
    tenderFor: getValue("Tender For"),
    typeOfTender: getValue("Type of Tender"),
    tenderNoNitNo: getValue("Tender No / NIT No with Date"),
    nameOfWorkDescription: getValue("Name of Work / Item Description"),
    totalQuantityMeter: parseNumber(getValue("Total Quantity in Meter")),
    nameOfTheClient: getValue("Name of the Client"),
    lastDateOfSubmission: parseDate(getValue("Last Date of Submission")),
    tenderOpeningDate: parseDate(getValue("Tender Opening Date")),
    costOfTenderFeeRs: parseNumber(getValue("Cost of Tender / Tender Fee (In Rs)")),
    emdAmountRs: parseNumber(getValue("EMD Amount (In Rs)")),
    estimatedCostRs: parseNumber(getValue("Estimated Cost (In Rs)")),
    bidValidityDays: parseNumber(getValue("Bid Validity (in Days)")),
    contractPeriodDays: parseNumber(getValue("Contract Period in Days")),
    managementDecision: getValue("Management Decision") || "Pending",
    participated: parseBool(getValue("Participated")),
    tenderPrepareBy: getValue("Tender Prepare By"),
    currentStatus: mapStatus(getValue("Current Status")),
    tenderSubmittedDate: parseDate(getValue("Tender Submitted Date")),
    reverseAuctionApplicable: parseBool(getValue("Reverse Auction Applicable")),
    reverseAuctionDate: parseDate(getValue("Reverse Auction Date")),
    emdPaymentMode: getValue("EMD Payment Through BG / NEFT") || "Not Applicable",
    bgNoUtrNo: getValue("BG No / UTR No") || null,
    emdValidity: parseDate(getValue("EMD Validity")),
    loiPoNoAndDate: getValue("LOI / PO No & Date") || null,
    remarks: getValue("Remarks") || null,
    bidValidityExpired: parseBool(getValue("Bid Validity Expired")),
    diffPercentFromL1: parsePercent(getValue("Diff % from L1")),
    diffPercentFromL2: parsePercent(getValue("Diff % from L2")),
    reason: getValue("Reason") || null,
    finalRemarks: getValue("Final Remarks") || null
  };
}
