import React, { useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { TenderDashboardPage } from "./pages/TenderDashboardPage";
import "./pages/TenderDashboard.css";

type Tab = "executive" | "tender";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>("executive");

  return (
    <>
      {/* Shared tab navigation rendered above both pages */}
      <div className="tab-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
        <button
          id="tab-executive-dashboard"
          className={`tab-btn${activeTab === "executive" ? " active" : ""}`}
          onClick={() => setActiveTab("executive")}
        >
          {/* <span className="tab-icon">📊</span> */}
          Executive Dashboard
        </button>
        <button
          id="tab-tender-dashboard"
          className={`tab-btn${activeTab === "tender" ? " active" : ""}`}
          onClick={() => setActiveTab("tender")}
        >
          {/* <span className="tab-icon">📋</span> */}
          Enquiry to Quotation Dashboard
        </button>
      </div>

      {/* Offset for fixed tab nav (42px height from CSS) */}
      <div style={{ paddingTop: "42px", height: "100vh", display: "flex", flexDirection: "column" }}>
        {activeTab === "executive" && <Dashboard />}
        {activeTab === "tender"    && <TenderDashboardPage />}
      </div>
    </>
  );
};

export default App;
