import React, { useState, useMemo } from "react";
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
  { key: "enquiryDate",     label: "Enquiry Date",      width: 120 },
  { key: "partyName",       label: "Party Name",         width: 200 },
  { key: "docketNumber",    label: "Docket Number",      width: 140 },
  { key: "utility",         label: "Utility",            width: 180 },
  { key: "quotationNumber", label: "Quotation Number",   width: 150 },
  { key: "tenderPurchase",  label: "Tender / Purchase",  width: 130 },
  { key: "proposedQty",     label: "Tender Qty",         width: 120 },
  { key: "attachmentUrl",   label: "Attachment",         width: 110 },
  { key: "priceBasis",      label: "Price Basis",        width: 100 },
  { key: "rawMaterials",    label: "Raw Materials",      width: 220 },
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
  const [typeFilter, setTypeFilter] = useState("All");

  const handleClearAllFilters = () => {
    setSearch("");
    setTypeFilter("All");
    setPage(1);
  };

  // Unique purchase types for sidebar filter
  const purchaseTypes = useMemo(() => {
    const set = new Set<string>();
    data.forEach(r => { if (r.tenderPurchase) set.add(r.tenderPurchase); });
    return ["All", ...Array.from(set).sort()];
  }, [data]);

  // Filter
  const filtered = useMemo<SmartsheetTender[]>(() => {
    let rows = data;
    if (typeFilter !== "All") {
      rows = rows.filter(r => r.tenderPurchase === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(row =>
        COLUMNS.some(col => {
          const v = row[col.key];
          return v && v.toLowerCase().includes(q);
        })
      );
    }
    return rows;
  }, [data, search, typeFilter]);

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
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
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
            <a
              href="http://192.168.0.230:2026/"
              target="_blank"
              rel="noopener noreferrer"
              className="ai-dashboard-btn"
            >
              🤖 AI Dashboard
            </a>
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
                    {search || typeFilter !== "All" ? "No matching records" : "No Records"}
                  </h3>
                  <p className="smartsheet-state-sub">
                    {search || typeFilter !== "All"
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
                              onClick={() => handleSort(col.key)}
                            >
                              <div className="smartsheet-th-inner">
                                {col.label}
                                <span className="smartsheet-sort-icon">
                                  {sortField === col.key
                                    ? sortDir === "asc" ? "▲" : "▼"
                                    : "⇅"}
                                </span>
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
                            <td className="text-pre-line">
                              {row.proposedQty ?? <span className="smartsheet-null-cell">—</span>}
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
