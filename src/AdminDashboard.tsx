import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Download,
  FileArchive,
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

export function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [hasAdminClaim, setHasAdminClaim] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [profiles, setProfiles] = useState<QodnProfileRow[]>([]);
  const [usageLogs, setUsageLogs] = useState<QodnUsageLogRow[]>([]);
  const [historyRows, setHistoryRows] = useState<QodnHistoryRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("ALL");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const isAdmin = await checkSupabaseAdminRole();
      setHasAdminClaim(isAdmin);
      const [pRes, uRes, hRes] = await Promise.all([
        fetchAllQodnProfilesAdmin(),
        fetchAllQodnUsageLogsAdmin(400),
        fetchAllQodnHistoryAdmin(400),
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
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        (p.full_name || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.company_name || "").toLowerCase().includes(q),
    );
  }, [profiles, userSearch]);

  const filteredUsageLogs = useMemo(() => {
    return usageLogs.filter((row) => {
      if (selectedEmail && row.user_email.toLowerCase() !== selectedEmail.toLowerCase()) return false;
      if (actionFilter !== "ALL" && row.action !== actionFilter) return false;
      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        const summary = typeof row.metadata?.summary === "string" ? row.metadata.summary : "";
        return (
          row.user_email.toLowerCase().includes(q) ||
          row.action.toLowerCase().includes(q) ||
          (row.file_name || "").toLowerCase().includes(q) ||
          summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [usageLogs, selectedEmail, actionFilter, userSearch]);

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

  function handleExportCsv() {
    const headers = ["Timestamp", "User Email", "Action", "Mode", "File Name", "Entity Count", "Summary"];
    const lines = [headers.join(",")];
    for (const row of filteredUsageLogs) {
      const summary = typeof row.metadata?.summary === "string" ? row.metadata.summary : "";
      lines.push(
        [
          csvEscape(row.created_at),
          csvEscape(row.user_email),
          csvEscape(row.action),
          csvEscape(row.mode || ""),
          csvEscape(row.file_name || ""),
          csvEscape(row.entity_count ?? 0),
          csvEscape(summary),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qodn-admin-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="accountWorkspace">
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
          <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Total Usage Events</div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
            {usageLogs.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>
            {hasAdminClaim ? "Admin RLS Verified" : "Own-user scope (admin claim pending)"}
          </div>
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
          <strong>Admin RLS Note:</strong> Run{" "}
          <code>supabase/migrations/20261118010000_add_qodn_admin_rls.sql</code> in Supabase SQL Editor and sign out /
          sign back in once to refresh your JWT <code>app_metadata.role = &quot;admin&quot;</code> claim so all
          users&apos; records appear here.
        </div>
      )}

      {errorMsg && <p className="error">{errorMsg}</p>}

      {/* Controls Toolbar */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={18} color="#16a34a" />
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
            <div className="activitySearchBox">
              <Search size={15} color="#64748b" />
              <input
                type="text"
                placeholder="Search user, email, company, file..."
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
              disabled={filteredUsageLogs.length === 0}
              onClick={handleExportCsv}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", fontSize: "12.5px" }}
            >
              <Download size={14} />
              <span>Export Usage CSV</span>
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
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Usage Events</th>
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
                      title="Click to filter usage logs for this user"
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

      {/* Usage Telemetry Feed */}
      <div className="panel" style={{ padding: "18px 20px" }}>
        <div className="activityToolbar" style={{ marginBottom: "12px" }}>
          <div className="activityFilterPills">
            {[
              { id: "ALL", label: `All Events (${usageLogs.length})` },
              { id: "KMZ_CONVERT", label: "KMZ Conversions" },
              { id: "EXPORT_DXF", label: "DXF Exports" },
              { id: "EXPORT_DWG", label: "DWG Exports" },
              { id: "OSM_ROADS_FETCH", label: "OSM Roads" },
              { id: "GOOGLE_SIGN_IN", label: "Sign-Ins" },
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
              const summary = typeof log.metadata?.summary === "string" ? log.metadata.summary : "";
              const isExport = log.action.startsWith("EXPORT_");
              return (
                <div key={log.id} className="activityRowCard">
                  <div className={`activityEventIcon ${isExport ? "export" : "convert"}`}>
                    {isExport ? <Download size={18} /> : <FileArchive size={18} />}
                  </div>
                  <div className="activityRowMain">
                    <div className="activityRowTop">
                      <strong>{log.user_email}</strong>
                      <span className={`activityEventBadge ${isExport ? "export" : "convert"}`}>
                        {log.action.replace(/_/g, " ")}
                      </span>
                      {log.file_name && <span className="activityModeBadge">{log.file_name}</span>}
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
