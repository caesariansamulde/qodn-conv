import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  FileArchive,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  checkSupabaseAdminRole,
  fetchAllQodnHistoryAdmin,
  fetchAllQodnProfilesAdmin,
  fetchAllQodnUsageLogsAdmin,
  type QodnHistoryRow,
  type QodnProfileRow,
  type QodnUsageLogRow,
} from "./supabaseDb";

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function metaStr(meta: Record<string, unknown> | undefined, key: string): string {
  const val = meta?.[key];
  return typeof val === "string" ? val : "";
}

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [hasAdminClaim, setHasAdminClaim] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [profiles, setProfiles] = useState<QodnProfileRow[]>([]);
  const [usageLogs, setUsageLogs] = useState<QodnUsageLogRow[]>([]);
  const [historyRows, setHistoryRows] = useState<QodnHistoryRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<"ALL" | "24H" | "7D" | "30D">("ALL");
  const [actionFilter, setActionFilter] = useState<string>("ALL");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const isAdmin = await checkSupabaseAdminRole();
      setHasAdminClaim(isAdmin);
      const [pRes, uRes, hRes] = await Promise.all([
        fetchAllQodnProfilesAdmin(),
        fetchAllQodnUsageLogsAdmin(500),
        fetchAllQodnHistoryAdmin(500),
      ]);
      if (pRes.error || uRes.error || hRes.error) {
        setErrorMsg(pRes.error || uRes.error || hRes.error || "Unable to load admin data.");
      }
      setProfiles(pRes.rows);
      setUsageLogs(uRes.rows);
      setHistoryRows(hRes.rows);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load admin telemetry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const profileByEmail = useMemo(() => {
    const map = new Map<string, QodnProfileRow>();
    for (const p of profiles) {
      map.set(p.email.toLowerCase(), p);
    }
    return map;
  }, [profiles]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const p of profiles) {
      if (p.company_name?.trim()) set.add(p.company_name.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  const userStatsByEmail = useMemo(() => {
    const map = new Map<string, { conversions: number; exports: number; events: number }>();
    for (const h of historyRows) {
      const key = (h.user_email || "").toLowerCase();
      const cur = map.get(key) || { conversions: 0, exports: 0, events: 0 };
      if (h.event === "KMZ_CONVERT") cur.conversions += 1;
      if (h.event.startsWith("EXPORT_")) cur.exports += 1;
      map.set(key, cur);
    }
    for (const u of usageLogs) {
      const key = (u.user_email || "").toLowerCase();
      const cur = map.get(key) || { conversions: 0, exports: 0, events: 0 };
      cur.events += 1;
      map.set(key, cur);
    }
    return map;
  }, [historyRows, usageLogs]);

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return profiles.filter((p) => {
      if (companyFilter !== "ALL" && (p.company_name || "").trim() !== companyFilter) return false;
      if (!q) return true;
      return (
        (p.full_name || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.company_name || "").toLowerCase().includes(q)
      );
    });
  }, [profiles, userSearch, companyFilter]);

  const filteredUsageLogs = useMemo(() => {
    const now = Date.now();
    const cutoff =
      dateRange === "24H"
        ? now - 24 * 60 * 60 * 1000
        : dateRange === "7D"
          ? now - 7 * 24 * 60 * 60 * 1000
          : dateRange === "30D"
            ? now - 30 * 24 * 60 * 60 * 1000
            : 0;

    return usageLogs.filter((row) => {
      if (cutoff > 0 && new Date(row.created_at).getTime() < cutoff) return false;
      if (selectedEmail && row.user_email.toLowerCase() !== selectedEmail.toLowerCase()) return false;
      if (companyFilter !== "ALL") {
        const prof = profileByEmail.get(row.user_email.toLowerCase());
        const rowCompany = metaStr(row.metadata, "companyName") || prof?.company_name || "";
        if (rowCompany.trim() !== companyFilter) return false;
      }
      if (actionFilter !== "ALL" && row.action !== actionFilter) return false;
      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        const summary = metaStr(row.metadata, "summary");
        const company = metaStr(row.metadata, "companyName") || profileByEmail.get(row.user_email.toLowerCase())?.company_name || "";
        const machineId = metaStr(row.metadata, "machineId");
        return (
          row.user_email.toLowerCase().includes(q) ||
          row.action.toLowerCase().includes(q) ||
          company.toLowerCase().includes(q) ||
          machineId.toLowerCase().includes(q) ||
          (row.file_name || "").toLowerCase().includes(q) ||
          summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [usageLogs, selectedEmail, companyFilter, dateRange, actionFilter, userSearch, profileByEmail]);

  const totalConversions = useMemo(
    () => usageLogs.filter((u) => u.action === "KMZ_CONVERT").length,
    [usageLogs],
  );
  const totalExports = useMemo(
    () => usageLogs.filter((u) => u.action.startsWith("EXPORT_")).length,
    [usageLogs],
  );
  const active7d = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return profiles.filter((p) => new Date(p.last_sign_in_at).getTime() >= cutoff).length;
  }, [profiles]);

  function handleExportAuditCsv() {
    const headers = [
      "Log ID",
      "Timestamp (UTC)",
      "User ID",
      "Full Name",
      "Company",
      "User Email",
      "Action",
      "Mode",
      "File Name",
      "Entity Count",
      "Origin",
      "Machine ID",
      "Platform",
      "App Version",
      "EULA Accepted",
      "Licensor",
      "Summary",
    ];
    const lines = [headers.join(",")];
    for (const row of filteredUsageLogs) {
      const prof = profileByEmail.get(row.user_email.toLowerCase());
      const fullName = metaStr(row.metadata, "fullName") || prof?.full_name || "";
      const company = metaStr(row.metadata, "companyName") || prof?.company_name || "";
      lines.push(
        [
          csvEscape(row.id),
          csvEscape(row.created_at),
          csvEscape(row.user_id),
          csvEscape(fullName),
          csvEscape(company),
          csvEscape(row.user_email),
          csvEscape(row.action),
          csvEscape(row.mode || ""),
          csvEscape(row.file_name || ""),
          csvEscape(row.entity_count ?? 0),
          csvEscape(metaStr(row.metadata, "origin")),
          csvEscape(metaStr(row.metadata, "machineId")),
          csvEscape(metaStr(row.metadata, "platform")),
          csvEscape(metaStr(row.metadata, "appVersion")),
          csvEscape(row.metadata?.eulaAccepted === true ? "YES" : ""),
          csvEscape(metaStr(row.metadata, "licensor") || "Caesar Ian Samulde"),
          csvEscape(metaStr(row.metadata, "summary")),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qodn-audit-evidence-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportUsersCsv() {
    const headers = [
      "User ID",
      "Full Name",
      "Email",
      "Company",
      "Status",
      "Conversions",
      "CAD Exports",
      "Usage Events",
      "First Registered (UTC)",
      "Last Sign-In (UTC)",
    ];
    const lines = [headers.join(",")];
    for (const p of filteredProfiles) {
      const stats = userStatsByEmail.get(p.email.toLowerCase()) || {
        conversions: 0,
        exports: 0,
        events: 0,
      };
      lines.push(
        [
          csvEscape(p.id),
          csvEscape(p.full_name || ""),
          csvEscape(p.email),
          csvEscape(p.company_name || ""),
          csvEscape(p.profile_completed ? "Active" : "Onboarding"),
          csvEscape(stats.conversions),
          csvEscape(stats.exports),
          csvEscape(stats.events),
          csvEscape(p.created_at),
          csvEscape(p.last_sign_in_at),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qodn-registered-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="accountWorkspace">
      {/* IP & Audit Trail Banner */}
      <div
        className="panel"
        style={{
          padding: "12px 18px",
          borderColor: "rgba(22, 163, 74, 0.35)",
          background: "rgba(22, 163, 74, 0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#0f172a" }}>
          <ShieldCheck size={18} color="#16a34a" />
          <span>
            <strong>Immutable Audit &amp; IP Evidence Ledger</strong> — Append-only Supabase log (no API update/delete) •
            Sole Author &amp; Copyright Owner: <strong>Caesar Ian Samulde</strong>
          </span>
        </div>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: "999px",
            background: hasAdminClaim ? "rgba(22, 163, 74, 0.14)" : "rgba(245, 158, 11, 0.16)",
            color: hasAdminClaim ? "#15803d" : "#b45309",
          }}
        >
          {hasAdminClaim ? "Admin RLS Verified" : "Admin Claim Pending"}
        </span>
      </div>

      {/* Top KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "12px",
        }}
      >
        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Registered Users</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {profiles.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "#16a34a", marginTop: "2px" }}>
            {active7d} active in last 7 days
          </div>
        </div>

        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Companies Recorded</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {companies.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>Distinct organizations</div>
        </div>

        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>KMZ Conversions</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {totalConversions}
          </div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>Across all users</div>
        </div>

        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>CAD Exports</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {totalExports}
          </div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>DXF &amp; DWG downloads</div>
        </div>

        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Audit Events</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {usageLogs.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>Timestamped in Postgres</div>
        </div>
      </div>

      {!hasAdminClaim && (
        <div
          className="panel"
          style={{
            padding: "12px 16px",
            borderColor: "#f59e0b",
            background: "rgba(245, 158, 11, 0.08)",
            fontSize: "12.5px",
            color: "#92400e",
          }}
        >
          <strong>Admin Session Refresh Needed:</strong> Sign out and sign back in once so your JWT refreshes with{" "}
          <code>app_metadata.role = &quot;admin&quot;</code> and displays all users&apos; records.
        </div>
      )}

      {errorMsg && <p className="error">{errorMsg}</p>}

      {/* Controls Toolbar & Users Directory */}
      <div className="panel" style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Users size={18} color="#16a34a" />
            <strong style={{ fontSize: "14px", color: "#0f172a" }}>Users &amp; Company Directory</strong>
            {selectedEmail && (
              <button
                type="button"
                className="secondaryButton"
                style={{ padding: "4px 10px", fontSize: "11.5px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                onClick={() => setSelectedEmail(null)}
              >
                <span>Filtered: {selectedEmail}</span>
                <X size={12} />
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              style={{
                padding: "7px 10px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "12.5px",
                background: "#fff",
              }}
              aria-label="Filter by company"
            >
              <option value="ALL">All Companies ({companies.length})</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as "ALL" | "24H" | "7D" | "30D")}
              style={{
                padding: "7px 10px",
                borderRadius: "8px",
                border: "1px solid #cbd5e1",
                fontSize: "12.5px",
                background: "#fff",
              }}
              aria-label="Filter by date range"
            >
              <option value="ALL">All Time</option>
              <option value="24H">Last 24 Hours</option>
              <option value="7D">Last 7 Days</option>
              <option value="30D">Last 30 Days</option>
            </select>

            <div className="activitySearchBox">
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search user, email, company, file, machine..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="secondaryButton"
              disabled={loading}
              onClick={() => void loadData()}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", fontSize: "12.5px" }}
            >
              {loading ? <Loader2 size={14} className="qodnSpinIcon" /> : <RefreshCw size={14} />}
              <span>Refresh</span>
            </button>

            <button
              type="button"
              className="secondaryButton"
              disabled={filteredProfiles.length === 0}
              onClick={handleExportUsersCsv}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", fontSize: "12.5px" }}
            >
              <FileSpreadsheet size={14} />
              <span>Export Users CSV</span>
            </button>

            <button
              type="button"
              className="primaryButton"
              disabled={filteredUsageLogs.length === 0}
              onClick={handleExportAuditCsv}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", fontSize: "12.5px" }}
            >
              <Download size={14} />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>

        {/* Users Table */}
        {loading && profiles.length === 0 ? (
          <div className="qodnSkeletonList" style={{ marginTop: "14px" }}>
            <div className="qodnSkeletonRow" />
            <div className="qodnSkeletonRow" />
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
            <Users size={24} style={{ marginBottom: "6px", opacity: 0.6 }} />
            <div>No users found.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "14px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left", color: "#64748b" }}>
                  <th style={{ padding: "8px 10px" }}>User</th>
                  <th style={{ padding: "8px 10px" }}>Company</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Conversions</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>CAD Exports</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Events</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>First Registered</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Last Sign-In</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((p) => {
                  const stats = userStatsByEmail.get(p.email.toLowerCase()) || {
                    conversions: 0,
                    exports: 0,
                    events: 0,
                  };
                  const isSelected = selectedEmail?.toLowerCase() === p.email.toLowerCase();
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedEmail(isSelected ? null : p.email)}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        cursor: "pointer",
                        background: isSelected ? "rgba(22, 163, 74, 0.06)" : "transparent",
                      }}
                      title="Click to filter audit logs for this user"
                    >
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {p.avatar_url ? (
                            <img
                              src={p.avatar_url}
                              alt={p.full_name || p.email}
                              style={{ width: 30, height: 30, borderRadius: "999px", objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: "999px",
                                background: "#e2e8f0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                color: "#334155",
                              }}
                            >
                              {(p.full_name || p.email).slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: "#0f172a" }}>{p.full_name || "Unnamed User"}</div>
                            <div style={{ fontSize: "11.5px", color: "#64748b" }}>{p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px", color: "#334155" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                          <Building2 size={13} color="#64748b" />
                          {p.company_name || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: p.profile_completed ? "rgba(22, 163, 74, 0.12)" : "rgba(245, 158, 11, 0.14)",
                            color: p.profile_completed ? "#15803d" : "#b45309",
                          }}
                        >
                          {p.profile_completed ? "Active" : "Onboarding"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{stats.conversions}</td>
                      <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{stats.exports}</td>
                      <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{stats.events}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#64748b" }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "10px", textAlign: "right", color: "#64748b" }}>
                        {new Date(p.last_sign_in_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit & Usage Telemetry Feed */}
      <div className="panel" style={{ padding: "18px 20px" }}>
        <div className="activityToolbar" style={{ marginBottom: "12px" }}>
          <div className="activityFilterPills">
            {[
              { id: "ALL", label: `All Events (${filteredUsageLogs.length})` },
              { id: "KMZ_CONVERT", label: "KMZ Conversions" },
              { id: "EXPORT_DXF", label: "DXF Exports" },
              { id: "EXPORT_DWG", label: "DWG Exports" },
              { id: "OSM_ROADS_FETCH", label: "OSM Roads" },
              { id: "GOOGLE_SIGN_IN", label: "Sign-Ins" },
              { id: "EULA_ACCEPTED", label: "EULA Accepted" },
              { id: "APP_LAUNCH", label: "App Launches" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`activityFilterBtn ${actionFilter === tab.id ? "active" : ""}`}
                onClick={() => setActionFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && usageLogs.length === 0 ? (
          <div className="qodnSkeletonList">
            <div className="qodnSkeletonRow" />
            <div className="qodnSkeletonRow" />
            <div className="qodnSkeletonRow" />
          </div>
        ) : filteredUsageLogs.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
            <FileArchive size={24} style={{ marginBottom: "6px", opacity: 0.6 }} />
            <div>No usage events match the current filter.</div>
          </div>
        ) : (
          <div className="activityList">
            {filteredUsageLogs.map((log) => {
              const prof = profileByEmail.get(log.user_email.toLowerCase());
              const summary = metaStr(log.metadata, "summary");
              const company = metaStr(log.metadata, "companyName") || prof?.company_name || "";
              const machineId = metaStr(log.metadata, "machineId");
              const origin = metaStr(log.metadata, "origin");
              const isExport = log.action.startsWith("EXPORT_");
              return (
                <div key={log.id} className="activityRowCard">
                  <div className={`activityEventIcon ${isExport ? "export" : "convert"}`}>
                    {isExport ? <Download size={18} /> : <FileArchive size={18} />}
                  </div>
                  <div className="activityRowMain">
                    <div className="activityRowTop">
                      <strong>{log.user_email}</strong>
                      {company && <span className="activityProviderBadge">{company}</span>}
                      <span className={`activityEventBadge ${isExport ? "export" : "convert"}`}>
                        {log.action.replace(/_/g, " ")}
                      </span>
                      {log.file_name && <span className="activityModeBadge">{log.file_name}</span>}
                      {machineId && (
                        <span className="activityModeBadge" title="Device / Browser Machine ID">
                          ID: {machineId}
                        </span>
                      )}
                      {origin && <span className="activityModeBadge">{origin}</span>}
                    </div>
                    <div className="activityRowSummary">{summary || `${log.mode || "pole_survey"} event`}</div>
                  </div>
                  <div className="activityRowRight">
                    <div className="activityCountPill">{(log.entity_count || 0).toLocaleString()} items</div>
                    <time>{new Date(log.created_at).toLocaleString()}</time>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
