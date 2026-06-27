import React, { useState, useMemo, useRef, useEffect } from "react";
import { EpcTenderRecord, CurrentStatus, ManagementDecision } from "../types/tender";
import "./TenderTable.css";

interface TenderTableProps {
  records: EpcTenderRecord[];
}

interface ColumnDef {
  header: string;
  accessor: keyof EpcTenderRecord | "rawMaterials";
  defaultWidth: number;
  align: "left" | "right" | "center";
  type: "string" | "number" | "date" | "boolean" | "percentage" | "currency" | "status" | "decision" | "custom";
}

export const TenderTable: React.FC<TenderTableProps> = ({ records }) => {
  // 1. Column Definitions
  const columns: ColumnDef[] = [
    { header: "Docket No", accessor: "docketNo", defaultWidth: 120, align: "left", type: "string" },
    { header: "Last Date of Submission", accessor: "lastDateOfSubmission", defaultWidth: 200, align: "center", type: "date" },
    { header: "Client Name", accessor: "nameOfTheClient", defaultWidth: 200, align: "left", type: "string" },
    { header: "Tender / NIT No", accessor: "tenderNoNitNo", defaultWidth: 180, align: "left", type: "string" },
    { header: "Attachment", accessor: "attachmentUrl", defaultWidth: 115, align: "center", type: "string" },
    { header: "Tender For", accessor: "tenderFor", defaultWidth: 150, align: "left", type: "string" },
    { header: "Type", accessor: "typeOfTender", defaultWidth: 100, align: "left", type: "string" },
    { header: "Est. Cost (₹)", accessor: "estimatedCostRs", defaultWidth: 140, align: "right", type: "currency" },
    { header: "Price", accessor: "priceBasis", defaultWidth: 90, align: "center", type: "string" },
    { header: "Raw Materials", accessor: "rawMaterials", defaultWidth: 220, align: "center", type: "custom" },
    { header: "EMD Amount", accessor: "emdAmountRs", defaultWidth: 120, align: "right", type: "currency" },
    { header: "Current Status", accessor: "currentStatus", defaultWidth: 150, align: "center", type: "status" },
    { header: "Mgmt Dec.", accessor: "managementDecision", defaultWidth: 100, align: "center", type: "decision" },
    { header: "Prep By", accessor: "tenderPrepareBy", defaultWidth: 120, align: "left", type: "string" },
    { header: "RA?", accessor: "reverseAuctionApplicable", defaultWidth: 60, align: "center", type: "boolean" },
    { header: "LOI / PO No.", accessor: "loiPoNoAndDate", defaultWidth: 150, align: "left", type: "string" },
    { header: "Diff L1 (%)", accessor: "diffPercentFromL1", defaultWidth: 100, align: "right", type: "percentage" },
    { header: "Diff L2 (%)", accessor: "diffPercentFromL2", defaultWidth: 100, align: "right", type: "percentage" },
  ];

  // 2. States
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  
  const [sortColumn, setSortColumn] = useState<keyof EpcTenderRecord | "rawMaterials" | null>("lastDateOfSubmission");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initialWidths: Record<string, number> = {};
    columns.forEach(col => {
      initialWidths[col.accessor] = col.defaultWidth;
    });
    return initialWidths;
  });

  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  
  // DOM Ref for scroll container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Resize column state refs
  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 3. Draggable Column Resizing Handlers
  const handleResizeStart = (e: React.MouseEvent, accessor: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingColumnRef.current = accessor;
    startXRef.current = e.clientX;
    startWidthRef.current = currentWidth;
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "col-resize";
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(50, startWidthRef.current + diff); // Minimum width 50px
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumnRef.current!]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
  };

  // 4. Sorting Handler
  const handleSort = (column: keyof EpcTenderRecord | "rawMaterials") => {
    if (column === "rawMaterials") return; // Skip sorting on custom virtual column
    if (sortColumn === column) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  // Toggle Row Expansion
  const toggleRowExpansion = (slNo: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [slNo]: !prev[slNo]
    }));
  };

  // 5. Processing Data (Filtering & Sorting)
  const processedRecords = useMemo(() => {
    let result = [...records];

    // Global Text Search
    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter(record => {
        return (
          record.docketNo.toLowerCase().includes(searchLower) ||
          record.nameOfTheClient.toLowerCase().includes(searchLower) ||
          record.tenderNoNitNo.toLowerCase().includes(searchLower) ||
          record.tenderFor.toLowerCase().includes(searchLower) ||
          record.tenderPrepareBy.toLowerCase().includes(searchLower) ||
          record.currentStatus.toLowerCase().includes(searchLower) ||
          (record.remarks && record.remarks.toLowerCase().includes(searchLower)) ||
          (record.nameOfWorkDescription && record.nameOfWorkDescription.toLowerCase().includes(searchLower))
        );
      });
    }

    // Date Range Filter on lastDateOfSubmission
    if (startDate || endDate) {
      result = result.filter(record => {
        if (!record.lastDateOfSubmission) return false;
        const dateVal = record.lastDateOfSubmission;
        
        if (!(dateVal instanceof Date) || isNaN(dateVal.getTime())) {
          return false;
        }
        
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (dateVal < start) return false;
        }
        
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (dateVal > end) return false;
        }
        
        return true;
      });
    }

    // Sorting
    if (sortColumn) {
      result.sort((a, b) => {
        if (sortColumn === "rawMaterials") return 0; // Skip sorting on custom virtual column
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === null || valA === undefined) return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined) return sortDirection === "asc" ? 1 : -1;

        if (valA instanceof Date && valB instanceof Date) {
          return sortDirection === "asc"
            ? valA.getTime() - valB.getTime()
            : valB.getTime() - valA.getTime();
        }

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === "asc" ? valA - valB : valB - valA;
        }

        // Default String compare
        return sortDirection === "asc"
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [records, globalSearch, sortColumn, sortDirection, startDate, endDate]);

  // 6. Pagination Calculations
  const totalRecords = processedRecords.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  
  // Adjust current page if out of bounds
  const activePage = Math.min(currentPage, totalPages);
  
  const paginatedRecords = useMemo(() => {
    const startIndex = (activePage - 1) * rowsPerPage;
    return processedRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [processedRecords, activePage, rowsPerPage]);

  // Reset page when search, date filters, or row limit changes
  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, rowsPerPage, startDate, endDate]);

  // 7. Scrolling is managed natively by the browser's layout engine

  // 8. Export Data Exporters
  const getCSVData = () => {
    const headers = columns.map(c => c.header).join(",");
    const rows = processedRecords.map(rec => {
      return columns.map(col => {
        let val: any;
        if (col.accessor === "rawMaterials") {
          const activeRates = [
            { label: "Alu", price: rec.aluminiumPrice },
            { label: "Al Alloy", price: rec.aluminiumAlloyPrice },
            { label: "Cu", price: rec.copperTapePrice },
            { label: "Semicon", price: rec.extrudedSemiconductivePrice },
            { label: "XLPE", price: rec.htXlpePrice },
            { label: "ST-2", price: rec.pvcTypeSt2Price },
            { label: "Steel", price: rec.galvanisedSteelFlatStripPrice },
            { label: "Filler", price: rec.fillerPrice }
          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);
          val = activeRates.map(m => `${m.label}: ₹${m.price}`).join(" | ");
        } else {
          val = rec[col.accessor as keyof EpcTenderRecord];
        }
        if (val === null || val === undefined) return "";
        if (val instanceof Date) return val.toLocaleDateString("en-GB");
        
        // Escape quotes
        let strVal = String(val);
        if (strVal.includes(",") || strVal.includes('"') || strVal.includes("\n")) {
          strVal = `"${strVal.replace(/"/g, '""')}"`;
        }
        return strVal;
      }).join(",");
    });
    return [headers, ...rows].join("\n");
  };

  const handleExportCSV = () => {
    const csvContent = getCSVData();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tender_Participation_Data_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    // Generates a well-formed HTML Table formatted spreadsheet that Microsoft Excel parses cleanly
    const tableHeader = columns.map(c => `<th style="background-color:#0a2540;color:#ffffff;font-weight:bold;">${c.header}</th>`).join("");
    const tableRows = processedRecords.map(rec => {
      const cells = columns.map(col => {
        let val: any;
        if (col.accessor === "rawMaterials") {
          const activeRates = [
            { label: "Al", price: rec.aluminiumPrice },
            { label: "Al Alloy", price: rec.aluminiumAlloyPrice },
            { label: "Cu", price: rec.copperTapePrice },
            { label: "Semicon", price: rec.extrudedSemiconductivePrice },
            { label: "XLPE", price: rec.htXlpePrice },
            { label: "ST-2", price: rec.pvcTypeSt2Price },
            { label: "Steel", price: rec.galvanisedSteelFlatStripPrice },
            { label: "Filler", price: rec.fillerPrice }
          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);
          val = activeRates.map(m => `${m.label}: ${m.price}`).join(" | ");
        } else {
          val = rec[col.accessor as keyof EpcTenderRecord];
        }
        if (val === null || val === undefined) return "<td></td>";
        if (val instanceof Date) return `<td>${val.toLocaleDateString("en-GB")}</td>`;
        if (col.type === "currency") return `<td style="text-align:right;">${val}</td>`;
        if (col.type === "percentage") return `<td style="text-align:right;">${((val as number) * 100).toFixed(1)}%</td>`;
        return `<td>${String(val)}</td>`;
      }).join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-type" content="text/html;charset=utf-8" />
        <!--[if gte o4 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Tenders</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
      </head>
      <body>
        <table border="1">
          <thead><tr>${tableHeader}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([excelHtml], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Tender_Participation_Data_${new Date().toISOString().split('T')[0]}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Formatting Helper Utilities
  const formatCurrency = (val: number | null): string => {
    if (val === null) return "-";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(val);
  };

  const formatDate = (val: Date | null): string => {
    if (!val) return "-";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = new Date(val);
    const day = String(d.getDate()).padStart(2, "0");
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  };

  const formatPercentage = (val: number | null): string => {
    if (val === null) return "-";
    const prefix = val > 0 ? "+" : "";
    return `${prefix}${(val * 100).toFixed(1)}%`;
  };

  const getStatusClass = (status: CurrentStatus): string => {
    switch (status) {
      case CurrentStatus.WON: return "won";
      case CurrentStatus.LOST: return "lost";
      case CurrentStatus.UNDER_EVALUATION: return "eval";
      case CurrentStatus.SUBMITTED: return "submitted";
      case CurrentStatus.RA_PENDING: return "loi"; // Map RA Pending to alternate style
      default: return "submitted";
    }
  };

  const getDecisionClass = (decision: ManagementDecision): string => {
    switch (decision) {
      case ManagementDecision.GO: return "go";
      case ManagementDecision.NO_GO: return "nogo";
      default: return "";
    }
  };

  const getLoiLabel = (status: CurrentStatus): string => {
    return status === CurrentStatus.WON ? "WON" : status;
  };

  return (
    <div className="tender-table-container">
      {/* 9. Header Toolbar */}
      <div className="tender-table-toolbar">
        <div className="toolbar-left">
          <h2 className="table-title">Master Tender Participation Tracker (Jan 2026 - Present)</h2>
          <span className="record-count-badge">{totalRecords} Records Total</span>
          <div className="global-search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="global-search-input"
              placeholder="Search..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button className="export-btn" onClick={handleExportCSV}>
            📥 Export CSV
          </button>
          <button className="export-btn" onClick={handleExportExcel}>
            📊 Export Excel
          </button>
        </div>
      </div>

      {/* 10. Data Table Grid */}
      <div 
        className="tender-table-wrapper" 
        ref={scrollContainerRef}
      >
        <table className="tender-data-table">
          <thead>
            <tr>
              <th style={{ width: "40px" }} className="col-center"></th> {/* Expansion Column */}
              {columns.map(col => (
                <th
                  key={col.accessor}
                  style={{ width: `${columnWidths[col.accessor]}px` }}
                >
                  <div className="header-content" onClick={() => handleSort(col.accessor)}>
                    <span>{col.header}</span>
                    {sortColumn === col.accessor && (
                      <span className="sort-indicator">
                        {sortDirection === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                  {col.accessor === "lastDateOfSubmission" && (
                    <div 
                      className="column-date-filter" 
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="date"
                        className="date-filter-input"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        title="Start Date"
                      />
                      <span className="date-filter-to">to</span>
                      <input
                        type="date"
                        className="date-filter-input"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        title="End Date"
                      />
                      {(startDate || endDate) && (
                        <button
                          className="date-filter-clear-btn"
                          onClick={() => {
                            setStartDate("");
                            setEndDate("");
                          }}
                          title="Clear date filter"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    className="column-resizer"
                    onMouseDown={(e) => handleResizeStart(e, col.accessor, columnWidths[col.accessor])}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Rendered Visible Rows */}
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: "center", padding: "40px", color: "rgba(0,0,0,0.4)" }}>
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((record) => {
                const isExpanded = !!expandedRows[record.slNo];
                


                return (
                  <React.Fragment key={record.slNo}>
                    {/* Collapsed Primary Row */}
                    <tr className={`tender-row ${isExpanded ? "expanded-row" : ""}`}>
                      <td className="col-center">
                        <button 
                          className="details-link"
                          onClick={() => toggleRowExpansion(record.slNo)}
                        >
                          {isExpanded ? "▼" : "▶"}
                        </button>
                      </td>
                      
                      {columns.map(col => {
                        let cellVal: any;
                        let cellContent: React.ReactNode = "-";
                        let cellClass = "";

                        if (col.accessor === "rawMaterials") {
                          const activeRates = [
                            { label: "Al", price: record.aluminiumPrice },
                            { label: "Al Alloy", price: record.aluminiumAlloyPrice },
                            { label: "Cu", price: record.copperTapePrice },
                            { label: "Semicon", price: record.extrudedSemiconductivePrice },
                            { label: "XLPE", price: record.htXlpePrice },
                            { label: "ST-2", price: record.pvcTypeSt2Price },
                            { label: "Steel", price: record.galvanisedSteelFlatStripPrice },
                            { label: "Filler", price: record.fillerPrice }
                          ].filter(m => m.price !== null && m.price !== undefined && m.price !== 0);

                          cellContent = activeRates.length > 0 ? (
                            <div className="raw-materials-grid">
                              {activeRates.map(m => (
                                <div className="material-rate-tag" key={m.label} title={`${m.label}: ₹${m.price}/kg`}>
                                  <span className="mat-lbl">{m.label}:</span>
                                  <span className="mat-val">₹{m.price}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="no-rates-placeholder">-</span>
                          );
                          cellClass = "col-raw-materials";
                        } else {
                          cellVal = record[col.accessor as keyof EpcTenderRecord];
                          
                          if (col.accessor === "attachmentUrl") {
                            const url = cellVal as string | null;
                            cellContent = url ? (
                              <a 
                                href={url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="table-attachment-link"
                                title="Click to view costing attachment"
                              >
                                📄 Costing
                              </a>
                            ) : "-";
                            cellClass = "col-center";
                          } else if (col.accessor === "priceBasis") {
                            const basis = (cellVal as string) || "Firm";
                            cellContent = (
                              <span className={`price-basis-badge ${basis.toLowerCase().includes("variable") ? "variable" : "firm"}`}>
                                {basis}
                              </span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "currency") {
                            cellContent = formatCurrency(cellVal as number | null);
                            cellClass = "col-currency";
                          } else if (col.type === "percentage") {
                            cellContent = formatPercentage(cellVal as number | null);
                            cellClass = "col-percentage";
                            if (cellVal !== null) {
                              cellClass += (cellVal as number) < 0 ? " col-lost" : ""; // Optional text highlight
                            }
                          } else if (col.type === "date") {
                            cellContent = formatDate(cellVal as Date | null);
                            cellClass = "col-center";
                          } else if (col.type === "boolean") {
                            const isApp = cellVal as boolean;
                            cellContent = (
                              <span className={`ra-icon ${isApp ? "applicable" : "not-applicable"}`}>
                                {isApp ? "✔" : "○"}
                              </span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "status") {
                            const statusVal = cellVal as CurrentStatus;
                            cellContent = (
                              <span className={`status-badge ${getStatusClass(statusVal)}`}>
                                {getLoiLabel(statusVal)}
                              </span>
                            );
                            cellClass = "col-center";
                          } else if (col.type === "decision") {
                            const decVal = cellVal as ManagementDecision;
                            cellContent = (
                              <span className={`decision-badge ${getDecisionClass(decVal)}`}>
                                {decVal}
                              </span>
                            );
                            cellClass = "col-center";
                          } else {
                            cellContent = cellVal !== null && cellVal !== undefined ? String(cellVal) : "-";
                            if (col.accessor === "docketNo") {
                              cellClass = "col-docket";
                            }
                          }
                        }

                        return (
                          <td 
                            key={col.accessor}
                            className={cellClass}
                            style={{ width: `${columnWidths[col.accessor]}px` }}
                            title={col.accessor !== "rawMaterials" && col.type !== "boolean" && cellVal !== null && cellVal !== undefined ? String(cellVal) : undefined}
                          >
                            {cellContent}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Expandable Details Row */}
                    {isExpanded && (
                      <tr className="details-panel-row">
                        <td colSpan={columns.length + 1}>
                          <div className="details-panel-content">
                            <div className="details-grid">
                              {/* 1. Name of Work / Item Description */}
                              <div className="details-item span-full">
                                <span className="details-label">Name of Work / Item Description</span>
                                <span className="details-value">{record.nameOfWorkDescription}</span>
                              </div>

                              {/* 2. Total Quantity in Meter */}
                              <div className="details-item">
                                <span className="details-label">Total Quantity (in Meters)</span>
                                <span className="details-value">
                                  {record.totalQuantityMeter !== null && record.totalQuantityMeter !== undefined 
                                    ? new Intl.NumberFormat("en-IN").format(record.totalQuantityMeter) 
                                    : "-"}
                                </span>
                              </div>

                              {/* 3. Bid Validity */}
                              <div className="details-item">
                                <span className="details-label">Bid Validity</span>
                                <span className="details-value">
                                  {record.bidValidityDays !== null ? `${record.bidValidityDays} Days` : "-"}
                                </span>
                              </div>

                              {/* 4. Contract Period in Days */}
                              <div className="details-item">
                                <span className="details-label">Contract Period</span>
                                <span className="details-value">
                                  {record.contractPeriodDays !== null ? `${record.contractPeriodDays} Days` : "-"}
                                </span>
                              </div>

                              {/* 5. Cost of Tender / Tender Fee (In Rs) */}
                              <div className="details-item">
                                <span className="details-label">Tender Fee / Cost</span>
                                <span className="details-value">
                                  {record.costOfTenderFeeRs !== null ? `₹ ${formatCurrency(record.costOfTenderFeeRs)}` : "-"}
                                </span>
                              </div>

                              {/* 6. EMD Payment Through BG / NEFT */}
                              <div className="details-item">
                                <span className="details-label">EMD Payment Mode</span>
                                <span className="details-value">{record.emdPaymentMode || "-"}</span>
                              </div>

                              {/* 7. BG No / UTR No */}
                              <div className="details-item">
                                <span className="details-label">BG No / UTR No</span>
                                <span className="details-value">{record.bgNoUtrNo || "-"}</span>
                              </div>

                              {/* 8. EMD Validity */}
                              <div className="details-item">
                                <span className="details-label">EMD Validity Date</span>
                                <span className="details-value">{formatDate(record.emdValidity)}</span>
                              </div>

                              {/* 9. Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">Remarks</span>
                                <span className="details-value">{record.remarks || "-"}</span>
                              </div>

                              {/* 10. Final Remarks */}
                              <div className="details-item span-full">
                                <span className="details-label">Final Remarks</span>
                                <span className="details-value">{record.finalRemarks || "-"}</span>
                              </div>

                              {/* 11. Costing Attachment Link */}
                              {record.attachmentUrl && (
                                <div className="details-item span-full">
                                  <span className="details-label">Costing Attachment</span>
                                  <span className="details-value" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "flex-start", marginTop: "6px" }}>
                                    <a 
                                      href={record.attachmentUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="costing-attachment-link"
                                    >
                                      📄 View Costing Attachment
                                    </a>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}

            {/* No virtual spacers needed - native scroll enabled */}
          </tbody>
        </table>
      </div>

      {/* 11. Pagination Footer */}
      <div className="tender-table-footer">
        <div className="footer-left">
          <span>Rows per page:</span>
          <select
            className="rows-per-page-select"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="footer-center">
          Showing {totalRecords > 0 ? (activePage - 1) * rowsPerPage + 1 : 0} -{" "}
          {Math.min(activePage * rowsPerPage, totalRecords)} of {totalRecords}
        </div>

        <div className="footer-right">
          <button
            className="page-btn"
            onClick={() => setCurrentPage(1)}
            disabled={activePage === 1}
          >
            FIRST
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={activePage === 1}
          >
            PREV
          </button>
          
          {/* Render abbreviated page numbers */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
            // Logic to center the current page index in the page range
            let pageNum = idx + 1;
            if (totalPages > 5 && activePage > 3) {
              pageNum = activePage - 3 + idx;
              if (pageNum + (4 - idx) > totalPages) {
                pageNum = totalPages - 4 + idx;
              }
            }
            return (
              <button
                key={pageNum}
                className={`page-btn ${activePage === pageNum ? "active" : ""}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}

          {totalPages > 5 && activePage < totalPages - 2 && (
            <>
              <span style={{ padding: "0 4px", color: "rgba(0,0,0,0.4)" }}>...</span>
              <button
                className={`page-btn ${activePage === totalPages ? "active" : ""}`}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            className="page-btn"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={activePage === totalPages}
          >
            NEXT
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage(totalPages)}
            disabled={activePage === totalPages}
          >
            LAST
          </button>
        </div>
      </div>
    </div>
  );
};
