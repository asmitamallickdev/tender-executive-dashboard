import React, { useState, useMemo, useEffect, useRef } from "react";
import { useSmartsheetTenders } from "../hooks/useSmartsheetTenders";
import { SmartsheetTender } from "../types/smartsheetTender";
import "./TenderDashboard.css";

type SortField = keyof SmartsheetTender;
type SortDir = "asc" | "desc";

interface ColDef {
  key: SortField;
  label: string;
  width: number;
}

const COLUMNS: ColDef[] = [
  { key: "enquiryDate",     label: "Enquiry Date",      width: 180 },
  { key: "partyName",       label: "Party Name",         width: 220 },
  { key: "docketNumber",    label: "Docket Number",      width: 160 },
  { key: "utility",         label: "Utility",            width: 200 },
  { key: "quotationNumber", label: "Quotation Number",   width: 170 },
  { key: "tenderPurchase",  label: "Tender / Purchase",  width: 150 },
  { key: "proposedQty",     label: "Tender Qty",         width: 140 },
  { key: "attachmentUrl",   label: "Attachment",         width: 130 },
  { key: "priceBasis",      label: "Price Basis",        width: 130 },
  { key: "rawMaterials",    label: "Raw Materials",      width: 260 },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

function cmp(a: string | null, b: string | null, dir: SortDir): number {
  const va = (a ?? "").toLowerCase();
  const vb = (b ?? "").toLowerCase();
  if (va < vb) return dir === "asc" ? -1 : 1;
  if (va > vb) return dir === "asc" ? 1 : -1;
  return 0;
}

/** Format raw date string "YYYY-MM-DD" → "DD-MMM-YY" for display */
function formatDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

/** Derive badge class from tender/purchase type value */
function purchaseBadgeClass(val: string): string {
  const v = val.toLowerCase();
  if (v.includes("tender")) return "tender";
  if (v.includes("purchase")) return "purchase";
  if (v.includes("budgetary") || v.includes("bugetary")) return "budgetary";
  if (v.includes("laser")) return "laser";
  return "purchase";
}

export const TenderDashboardPage: React.FC = () => {
  const { data, loading, error, refresh } = useSmartsheetTenders();

  const [search, setSearch]       = useState("");
  const [sortField, setSortField] = useState<SortField>("enquiryDate");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(50);

  // Column search states (maps each column key to its search term, excluding attachmentUrl)
  const [colSearches, setColSearches] = useState<Record<string, string>>({
    enquiryDate: "",
    partyName: "",
    docketNumber: "",
    utility: "",
    quotationNumber: "",
    tenderPurchase: "",
    proposedQty: "",
    priceBasis: "",
    rawMaterials: "",
  });

  // Specialized filters states
  const [enquiryStartDate, setEnquiryStartDate] = useState("");
  const [enquiryEndDate, setEnquiryEndDate] = useState("");
  const [tenderPurchaseFilter, setTenderPurchaseFilter] = useState("All");
  const [priceBasisFilter, setPriceBasisFilter] = useState("All");
  const [alMin, setAlMin] = useState("");
  const [alMax, setAlMax] = useState("");
  const [cuMin, setCuMin] = useState("");
  const [cuMax, setCuMax] = useState("");

  // Party Name Multi-select dropdown states
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const partyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (partyDropdownRef.current && !partyDropdownRef.current.contains(event.target as Node)) {
        setShowPartyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleColSearchChange = (key: string, val: string) => {
    setColSearches(prev => ({
      ...prev,
      [key]: val
    }));
    setPage(1);
  };

  const handleClearAllFilters = () => {
    setSearch("");
    setTenderPurchaseFilter("All");
    setPriceBasisFilter("All");
    setEnquiryStartDate("");
    setEnquiryEndDate("");
    setAlMin("");
    setAlMax("");
    setCuMin("");
    setCuMax("");
    setSelectedParties([]);
    setShowPartyDropdown(false);
    setColSearches({
      enquiryDate: "",
      partyName: "",
      docketNumber: "",
      utility: "",
      quotationNumber: "",
      tenderPurchase: "",
      proposedQty: "",
      priceBasis: "",
      rawMaterials: "",
    });
    setPage(1);
  };

  // Unique purchase types for sidebar/column filters
  const purchaseTypes = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.tenderPurchase) set.add(r.tenderPurchase); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  // Unique price basis options for dropdown filter
  const priceBasisOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.priceBasis) set.add(r.priceBasis); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  // Unique party names for dropdown filter
  const partyNamesList = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.partyName) set.add(r.partyName.trim()); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  // Filter
  const filtered = useMemo<SmartsheetTender[]>(() => {
    let rows = data;

    // 1. Sidebar Type Filter / Column Type Filter (Tender / Purchase)
    if (tenderPurchaseFilter !== "All") {
      rows = rows.filter(r => r.tenderPurchase === tenderPurchaseFilter);
    }

    // 2. Global search
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(row =>
        COLUMNS.some(col => {
          if (col.key === "rawMaterials") {
            const rates = [
              row.aluminiumPrice,
              row.aluminiumAlloyPrice,
              row.copperTapePrice,
              row.extrudedSemiconductivePrice,
              row.htXlpePrice,
              row.pvcTypeSt2Price,
              row.galvanisedSteelFlatStripPrice,
              row.fillerPrice
            ];
            return rates.some(p => p !== null && p !== undefined && String(p).includes(q));
          }
          const v = row[col.key];
          return v && String(v).toLowerCase().includes(q);
        })
      );
    }

    // 3. Individual column searches
    Object.entries(colSearches).forEach(([key, val]) => {
      const sVal = val.trim().toLowerCase();
      if (sVal) {
        rows = rows.filter(row => {
          if (key === "rawMaterials") {
            const materials = [
              { label: "al", price: row.aluminiumPrice },
              { label: "al alloy", price: row.aluminiumAlloyPrice },
              { label: "cu", price: row.copperTapePrice },
              { label: "semicon", price: row.extrudedSemiconductivePrice },
              { label: "xlpe", price: row.htXlpePrice },
              { label: "st-2", price: row.pvcTypeSt2Price },
              { label: "steel", price: row.galvanisedSteelFlatStripPrice },
              { label: "filler", price: row.fillerPrice }
            ];
            return materials.some(m => 
              m.price !== null && m.price !== undefined && 
              (m.label.includes(sVal) || String(m.price).includes(sVal))
            );
          }
          const v = row[key as keyof SmartsheetTender];
          return v !== null && v !== undefined && String(v).toLowerCase().includes(sVal);
        });
      }
    });

    // 3b. Specialized: Party Name Multi-select Filter
    if (selectedParties.length > 0) {
      rows = rows.filter(row => row.partyName && selectedParties.includes(row.partyName.trim()));
    }

    // 4. Specialized: Enquiry Date Range Filter
    if (enquiryStartDate) {
      const start = new Date(enquiryStartDate);
      rows = rows.filter(row => {
        if (!row.enquiryDate) return false;
        const d = new Date(row.enquiryDate);
        return d >= start;
      });
    }
    if (enquiryEndDate) {
      const end = new Date(enquiryEndDate);
      end.setHours(23, 59, 59, 999);
      rows = rows.filter(row => {
        if (!row.enquiryDate) return false;
        const d = new Date(row.enquiryDate);
        return d <= end;
      });
    }

    // 5. Specialized: Price Basis Filter
    if (priceBasisFilter !== "All") {
      rows = rows.filter(row => {
        const pb = row.priceBasis || "";
        return pb.toLowerCase() === priceBasisFilter.toLowerCase();
      });
    }

    // 6. Specialized: Raw Materials Aluminum & Copper Price Range Filters
    if (alMin.trim() !== "" || alMax.trim() !== "") {
      rows = rows.filter(row => {
        if (row.aluminiumPrice === null || row.aluminiumPrice === undefined) return false;
        const minVal = alMin.trim() !== "" ? parseFloat(alMin) : Number.NEGATIVE_INFINITY;
        const maxVal = alMax.trim() !== "" ? parseFloat(alMax) : Number.POSITIVE_INFINITY;
        return row.aluminiumPrice >= minVal && row.aluminiumPrice <= maxVal;
      });
    }
    if (cuMin.trim() !== "" || cuMax.trim() !== "") {
      rows = rows.filter(row => {
        if (row.copperTapePrice === null || row.copperTapePrice === undefined) return false;
        const minVal = cuMin.trim() !== "" ? parseFloat(cuMin) : Number.NEGATIVE_INFINITY;
        const maxVal = cuMax.trim() !== "" ? parseFloat(cuMax) : Number.POSITIVE_INFINITY;
        return row.copperTapePrice >= minVal && row.copperTapePrice <= maxVal;
      });
    }

    return rows;
  }, [
    data, 
    search, 
    colSearches, 
    tenderPurchaseFilter, 
    selectedParties,
    enquiryStartDate, 
    enquiryEndDate, 
    priceBasisFilter, 
    alMin, 
    alMax, 
    cuMin, 
    cuMax
  ]);

  // Sort
  const sorted = useMemo<SmartsheetTender[]>(() => {
    return [...filtered].sort((a, b) => cmp(a[sortField], b[sortField], sortDir));
  }, [filtered, sortField, sortDir]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageStart  = (page - 1) * pageSize;
  const paginated  = sorted.slice(pageStart, pageStart + pageSize);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    setPage(1);
  };

  const handleRefresh = async () => { setPage(1); await refresh(); };

  const pageNumbers = (): (number | "...")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const ps: (number | "...")[] = [1];
    if (page > 3) ps.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) ps.push(i);
    if (page < totalPages - 2) ps.push("...");
    ps.push(totalPages);
    return ps;
  };

  // Sidebar stats
  const totalRecords   = data.length;
  const tenderCount    = data.filter(r => r.tenderPurchase?.toLowerCase().includes("tender")).length;
  const purchaseCount  = data.filter(r => r.tenderPurchase?.toLowerCase().includes("purchase")).length;
  const withQuotation  = data.filter(r => r.quotationNumber).length;

  return (
    <div className="tender-layout-container">
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className="tender-sidebar">
        <div className="tender-sidebar-header">📋 Tender Dashboard</div>
        <div className="tender-sidebar-body">

          {/* Stats */}
          <div className="tender-stat-card">
            <div className="tender-stat-label">Total Records</div>
            <div className="tender-stat-value">{totalRecords.toLocaleString()}</div>
            <div className="tender-stat-sub">from Smartsheet</div>
          </div>
          <div className="tender-stat-card">
            <div className="tender-stat-label">Tenders</div>
            <div className="tender-stat-value" style={{ color: "#ff6b6b" }}>{tenderCount.toLocaleString()}</div>
          </div>
          <div className="tender-stat-card">
            <div className="tender-stat-label">Purchases</div>
            <div className="tender-stat-value" style={{ color: "#38ef7d" }}>{purchaseCount.toLocaleString()}</div>
          </div>
          <div className="tender-stat-card">
            <div className="tender-stat-label">With Quotation</div>
            <div className="tender-stat-value" style={{ color: "#69b2ff" }}>{withQuotation.toLocaleString()}</div>
          </div>

          {/* Filters */}
          <div className="tender-filter-section">
            <div className="tender-filter-label">Type Filter</div>
            <select
              className="tender-filter-select"
              value={tenderPurchaseFilter}
              onChange={e => { setTenderPurchaseFilter(e.target.value); setPage(1); }}
            >
              {purchaseTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="tender-filter-section">
            <div className="tender-filter-label">Party Search</div>
            <input
              className="tender-filter-input"
              type="text"
              placeholder="Search party name..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        <div className="tender-sidebar-footer">
          <button
            className="tender-refresh-sidebar-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            {loading ? "🔄 Loading..." : "🔄 Refresh Data"}
          </button>
        </div>
      </aside>

      {/* ── Main Workspace ──────────────────────────────────────────────── */}
      <div className="tender-workspace">
        {/* Header */}
        <header className="tender-top-header">
          <div className="tender-header-brand">
            <h1 className="tender-header-title">LASERPOWER <span>TENDER</span></h1>
            <div className="tender-header-divider" />
            <span className="tender-header-subtitle">Smartsheet Dashboard</span>
          </div>
          <div className="tender-header-actions">
            <button className="clear-filters-btn" onClick={handleClearAllFilters}>
              🧹 Clear Filters
            </button>
            {/* <a
              href="http://192.168.0.230:2026/"
              target="_blank"
              rel="noopener noreferrer"
              className="ai-dashboard-btn"
            >
              🤖 AI Dashboard
            </a> */}
          </div>
        </header>

        {/* Body */}
        <main className="tender-body">
          {/* ── Loading ── */}
          {loading && (
            <div className="smartsheet-table-container">
              <div className="smartsheet-state-wrapper">
                <div className="smartsheet-spinner" />
                <span className="smartsheet-state-title">Fetching Smartsheet Data...</span>
                <span className="smartsheet-state-sub">Connecting to Smartsheet API and mapping columns.</span>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {!loading && error && (
            <div className="smartsheet-table-container">
              <div className="smartsheet-state-wrapper">
                <span className="smartsheet-state-icon">⚠️</span>
                <h3 className="smartsheet-error-title">Failed to Load Tender Data</h3>
                <p className="smartsheet-state-sub">{error.message}</p>
                <div className="smartsheet-error-code">{error.message}</div>
                <button className="smartsheet-retry-btn" onClick={handleRefresh}>
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          {/* ── Data Table ── */}
          {!loading && !error && (
            <div className="smartsheet-table-container">
              {/* Toolbar */}
              <div className="smartsheet-toolbar">
                <div className="smartsheet-toolbar-left">
                  <p className="smartsheet-table-title">Tender Records</p>
                  <span className="smartsheet-record-badge">
                    {filtered.length.toLocaleString()} of {data.length.toLocaleString()} Records
                  </span>
                  <div className="smartsheet-search-container">
                    <span className="smartsheet-search-icon">🔍</span>
                    <input
                      id="smartsheet-global-search"
                      type="text"
                      className="smartsheet-search-input"
                      placeholder="Search all columns..."
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>
              </div>
 
              {/* Empty */}
              {sorted.length === 0 && (
                <div className="smartsheet-state-wrapper">
                  <span className="smartsheet-state-icon">📭</span>
                 <h3 className="smartsheet-state-title">
                    {search || tenderPurchaseFilter !== "All" || enquiryStartDate || enquiryEndDate || priceBasisFilter !== "All" || alMin || alMax || cuMin || cuMax || Object.values(colSearches).some(Boolean) ? "No matching records" : "No Records"}
                  </h3>
                  <p className="smartsheet-state-sub">
                    {search || tenderPurchaseFilter !== "All" || enquiryStartDate || enquiryEndDate || priceBasisFilter !== "All" || alMin || alMax || cuMin || cuMax || Object.values(colSearches).some(Boolean)
                      ? "Try adjusting your search or type filter."
                      : "The Smartsheet returned no rows."}
                  </p>
                </div>
              )}

              {/* Table */}
              {sorted.length > 0 && (
                <>
                  <div className="smartsheet-table-wrapper">
                    <table className="smartsheet-data-table">
                      <thead>
                        <tr>
                          {COLUMNS.map(col => (
                            <th
                              key={col.key}
                              style={{ width: col.width, minWidth: col.width }}
                            >
                              <div className="smartsheet-th-inner" onClick={() => handleSort(col.key)}>
                                {col.label}
                                <span className="smartsheet-sort-icon">
                                  {sortField === col.key
                                    ? sortDir === "asc" ? "▲" : "▼"
                                    : "⇅"}
                                </span>
                              </div>
                              <div className="column-filter-container" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                {col.key !== "attachmentUrl" && (
                                  <input
                                    type="text"
                                    className="column-search-input"
                                    placeholder="Search..."
                                    value={colSearches[col.key] || ""}
                                    onChange={e => handleColSearchChange(col.key, e.target.value)}
                                  />
                                )}
                                {col.key === "partyName" && (
                                  <div className="custom-multiselect-container" ref={partyDropdownRef}>
                                    <button 
                                      className="multiselect-trigger-btn"
                                      onClick={() => setShowPartyDropdown(!showPartyDropdown)}
                                    >
                                      {selectedParties.length === 0 ? "All Parties" : `${selectedParties.length} Selected`} <span className="dropdown-arrow">▼</span>
                                    </button>
                                    {showPartyDropdown && (
                                      <div className="multiselect-dropdown-panel">
                                        <div className="multiselect-actions">
                                          <button className="multiselect-action-btn" onClick={() => { setSelectedParties([]); setPage(1); }}>Clear All</button>
                                          <button className="multiselect-action-btn" onClick={() => { setSelectedParties(partyNamesList.filter(p => p !== "All")); setPage(1); }}>Select All</button>
                                        </div>
                                        <div className="multiselect-options-list">
                                          {partyNamesList.filter(p => p !== "All").map(party => (
                                            <label key={party} className="multiselect-option-label">
                                              <input 
                                                type="checkbox"
                                                checked={selectedParties.includes(party)}
                                                onChange={() => {
                                                  if (selectedParties.includes(party)) {
                                                    setSelectedParties(selectedParties.filter(p => p !== party));
                                                  } else {
                                                    setSelectedParties([...selectedParties, party]);
                                                  }
                                                  setPage(1);
                                                }}
                                              />
                                              <span>{party}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {col.key === "enquiryDate" && (
                                  <div className="column-date-filter">
                                    <input
                                      type="date"
                                      className="date-filter-input"
                                      value={enquiryStartDate}
                                      onChange={e => { setEnquiryStartDate(e.target.value); setPage(1); }}
                                      title="Start Date"
                                    />
                                    <span className="date-filter-to">to</span>
                                    <input
                                      type="date"
                                      className="date-filter-input"
                                      value={enquiryEndDate}
                                      onChange={e => { setEnquiryEndDate(e.target.value); setPage(1); }}
                                      title="End Date"
                                    />
                                    {(enquiryStartDate || enquiryEndDate) && (
                                      <button
                                        className="date-filter-clear-btn"
                                        onClick={() => {
                                          setEnquiryStartDate("");
                                          setEnquiryEndDate("");
                                          setPage(1);
                                        }}
                                        title="Clear date filter"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                )}
                                {col.key === "tenderPurchase" && (
                                  <select
                                    className="price-basis-filter-select"
                                    value={tenderPurchaseFilter}
                                    onChange={e => { setTenderPurchaseFilter(e.target.value); setPage(1); }}
                                  >
                                    {purchaseTypes.map(t => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {col.key === "priceBasis" && (
                                  <select
                                    className="price-basis-filter-select"
                                    value={priceBasisFilter}
                                    onChange={e => { setPriceBasisFilter(e.target.value); setPage(1); }}
                                  >
                                    {priceBasisOptions.map(t => (
                                      <option key={t} value={t}>
                                        {t}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {col.key === "rawMaterials" && (
                                  <div className="column-raw-materials-filter">
                                    <div className="filter-row">
                                      <span className="filter-row-label">Al:</span>
                                      <input
                                        type="number"
                                        placeholder="Min"
                                        className="col-price-filter-input"
                                        value={alMin}
                                        onChange={e => { setAlMin(e.target.value); setPage(1); }}
                                        title="Aluminium Min"
                                      />
                                      <span className="filter-row-dash">-</span>
                                      <input
                                        type="number"
                                        placeholder="Max"
                                        className="col-price-filter-input"
                                        value={alMax}
                                        onChange={e => { setAlMax(e.target.value); setPage(1); }}
                                        title="Aluminium Max"
                                      />
                                    </div>
                                    <div className="filter-row" style={{ marginTop: "4px" }}>
                                      <span className="filter-row-label">Cu:</span>
                                      <input
                                        type="number"
                                        placeholder="Min"
                                        className="col-price-filter-input"
                                        value={cuMin}
                                        onChange={e => { setCuMin(e.target.value); setPage(1); }}
                                        title="Copper Min"
                                      />
                                      <span className="filter-row-dash">-</span>
                                      <input
                                        type="number"
                                        placeholder="Max"
                                        className="col-price-filter-input"
                                        value={cuMax}
                                        onChange={e => { setCuMax(e.target.value); setPage(1); }}
                                        title="Copper Max"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((row, idx) => (
                          <tr key={pageStart + idx} className="smartsheet-row">
                            {/* Enquiry Date */}
                            <td>
                              {row.enquiryDate
                                ? <span className="enquiry-date-badge">{formatDate(row.enquiryDate)}</span>
                                : <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Party Name */}
                            <td title={row.partyName ?? undefined}>
                              {row.partyName ?? <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Docket Number */}
                            <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#0a2540" }}>
                              {row.docketNumber ?? <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Utility */}
                            <td title={row.utility ?? undefined}>
                              {row.utility ?? <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Quotation Number */}
                            <td style={{ fontFamily: "monospace" }}>
                              {row.quotationNumber ?? <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Tender Purchase */}
                            <td>
                              {row.tenderPurchase
                                ? <span className={`purchase-type-badge ${purchaseBadgeClass(row.tenderPurchase)}`}>
                                    {row.tenderPurchase}
                                  </span>
                                : <span className="smartsheet-null-cell">—</span>}
                            </td>
                            {/* Tender Qty */}
                            <td className="col-tender-qty text-pre-line">
                              {(() => {
                                if (!row.proposedQty) return <span className="smartsheet-null-cell">—</span>;
                                const parts = row.proposedQty.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
                                if (parts.length > 1) {
                                  return (
                                    <div className="tender-qty-stack" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                      {parts.map((part, pIdx) => (
                                        <span className="tender-qty-item" key={pIdx} style={{ display: "inline-block", background: "#f1f3f4", padding: "2px 6px", borderRadius: "4px", fontSize: "11px", border: "1px solid #dadce0", width: "fit-content", color: "#202124" }}>
                                          {part}
                                        </span>
                                      ))}
                                    </div>
                                  );
                                }
                                return row.proposedQty;
                              })()}
                            </td>
                            {/* Attachment */}
                            <td style={{ textAlign: "center" }}>
                              {row.attachmentUrl ? (
                                <button
                                  className="table-attachment-btn"
                                  onClick={() => {
                                    window.open(row.attachmentUrl!, "_blank");
                                  }}
                                  title="View Costing Sheet"
                                  style={{ padding: "4px 8px", background: "#e8f0fe", color: "#1a73e8", border: "1px solid #d2e3fc", borderRadius: "4px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
                                >
                                  📎 Costing
                                </button>
                              ) : (
                                <span className="smartsheet-null-cell">—</span>
                              )}
                            </td>
                            {/* Price Basis */}
                            <td style={{ textAlign: "center" }}>
                              {row.priceBasis ? (
                                <span className="purchase-type-badge purchase" style={{ textTransform: "capitalize" }}>
                                  {row.priceBasis}
                                </span>
                              ) : (
                                <span className="smartsheet-null-cell">—</span>
                              )}
                            </td>
                            {/* Raw Materials */}
                            <td>
                              {(() => {
                                const activeRates = [
                                  { label: "Al", price: row.aluminiumPrice },
                                  { label: "Al Alloy", price: row.aluminiumAlloyPrice },
                                  { label: "Cu", price: row.copperTapePrice },
                                  { label: "Semicon", price: row.extrudedSemiconductivePrice },
                                  { label: "XLPE", price: row.htXlpePrice },
                                  { label: "ST-2", price: row.pvcTypeSt2Price },
                                  { label: "Steel", price: row.galvanisedSteelFlatStripPrice },
                                  { label: "Filler", price: row.fillerPrice }
                                ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);

                                return activeRates.length > 0 ? (
                                  <div className="raw-materials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "2px", fontSize: "10px" }}>
                                    {activeRates.map(m => (
                                      <div className="material-rate-tag" key={m.label} title={`${m.label}: ₹${m.price}/kg`} style={{ background: "#f1f3f4", padding: "2px 4px", borderRadius: "3px", border: "1px solid #dadce0" }}>
                                        <span className="mat-lbl" style={{ fontWeight: 600, color: "#5f6368" }}>{m.label}:</span>
                                        <span className="mat-val" style={{ marginLeft: "2px", color: "#202124" }}>₹{m.price}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="smartsheet-null-cell">—</span>
                                );
                              })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="smartsheet-table-footer">
                    <div className="smartsheet-footer-left">
                      <span>Rows per page:</span>
                      <select
                        className="smartsheet-rows-select"
                        value={pageSize}
                        onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                      >
                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="smartsheet-footer-center">
                      {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length}
                    </div>
                    <div className="smartsheet-pagination">
                      <button className="smartsheet-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
                      {pageNumbers().map((p, i) =>
                        p === "..." ? (
                          <span key={`e${i}`} style={{ padding: "0 4px", color: "#5f6368", fontSize: 12 }}>…</span>
                        ) : (
                          <button key={p} className={`smartsheet-page-btn${page === p ? " active" : ""}`} onClick={() => setPage(p as number)}>{p}</button>
                        )
                      )}
                      <button className="smartsheet-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        {/* Footer status bar */}
        <footer className="tender-status-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#137333" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#34a853", display: "inline-block", animation: "blink 1.5s infinite" }} />
              <span>SMARTSHEET LIVE</span>
            </div>
          </div>
          <div style={{ color: "#0a2540", textTransform: "uppercase", fontWeight: 700 }}>
            LASERPOWER TENDER SMARTSHEET PIPELINE
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ backgroundColor: "#e1e6eb", color: "#0a2540", padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
              LASERPOWER ERP V2.1 PRO
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TenderDashboardPage;
