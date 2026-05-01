import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import {
  Users,
  Files,
  VideoCamera,
  ChatCircle,
  UserPlus,
} from "@phosphor-icons/react";

/* ── Auth helper ──────────────────────────────────────────── */
function getAuth() {
  const session = JSON.parse(localStorage.getItem("ets_auth") || "{}");
  return {
    token: session.access_token,
    userId: session.user?.id,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  };
}
const BASE = import.meta.env.VITE_SUPABASE_URL;

/* ── Date helpers ─────────────────────────────────────────── */
function getStartDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(isoStr) {
  return isoStr ? isoStr.slice(0, 10) : null;
}

function groupByDate(items, startDate) {
  const map = {};
  items.forEach((item) => {
    const key = toDateKey(item.created_at);
    if (!key) return;
    const d = new Date(key);
    if (d >= startDate) {
      map[key] = (map[key] || 0) + 1;
    }
  });
  return map;
}

function buildDailyData(map, startDate, days) {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map[key] || 0 });
  }
  return result;
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Custom Tooltip ───────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "var(--t1)",
      }}
    >
      <div style={{ color: "var(--t3)", marginBottom: "4px" }}>{formatDateLabel(label)}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--t1)" }}>
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "12px",
        color: "var(--t1)",
      }}
    >
      <strong>{payload[0].name}</strong>: {payload[0].value} users
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────── */
function StatCard({ icon, label, value, loading }) {
  return (
    <div className="admin-stats-card">
      <div className="admin-stats-icon">{icon}</div>
      <div className="admin-stats-value">
        {loading ? (
          <div style={{ width: "60px", height: "24px", background: "var(--hover)", borderRadius: "6px", animation: "pulse 1.5s ease-in-out infinite" }} />
        ) : (
          value.toLocaleString()
        )}
      </div>
      <div className="admin-stats-label">{label}</div>
    </div>
  );
}

/* ── Plan colors ──────────────────────────────────────────── */
const PLAN_COLORS = {
  Free: "#64748b",
  Pro: "#3b82f6",
  Business: "#f59e0b",
};
const DEFAULT_PIE_COLORS = ["#64748b", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

/* ── Date range buttons ───────────────────────────────────── */
const RANGES = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

/* ── Main Page ────────────────────────────────────────────── */
export default function AdminAnalytics() {
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);

  // Raw data
  const [users, setUsers] = useState([]);
  const [files, setFiles] = useState([]);
  const [videos, setVideos] = useState([]);
  const [comments, setComments] = useState([]);
  const [planDist, setPlanDist] = useState([]);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        const { headers } = getAuth();
        const [usersRes, filesRes, videosRes, commentsRes, plansRes] = await Promise.all([
          fetch(`${BASE}/rest/v1/profiles?select=created_at&order=created_at.asc`, { headers }),
          fetch(`${BASE}/rest/v1/drive_files?select=created_at,file_size&is_trashed=eq.false&order=created_at.asc`, { headers }),
          fetch(`${BASE}/rest/v1/project_media?select=created_at&is_trashed=eq.false&order=created_at.asc`, { headers }),
          fetch(`${BASE}/rest/v1/media_comments?select=created_at&order=created_at.asc`, { headers }),
          fetch(`${BASE}/rest/v1/user_plans?select=plans(name)&is_active=eq.true`, { headers }),
        ]);
        const [u, f, v, c, p] = await Promise.all([
          usersRes.json(),
          filesRes.json(),
          videosRes.json(),
          commentsRes.json(),
          plansRes.json(),
        ]);
        setUsers(Array.isArray(u) ? u : []);
        setFiles(Array.isArray(f) ? f : []);
        setVideos(Array.isArray(v) ? v : []);
        setComments(Array.isArray(c) ? c : []);

        // Build plan distribution
        if (Array.isArray(p)) {
          const countMap = {};
          p.forEach((row) => {
            const name = row.plans?.name || "Unknown";
            countMap[name] = (countMap[name] || 0) + 1;
          });
          setPlanDist(Object.entries(countMap).map(([name, value]) => ({ name, value })));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const startDate = getStartDate(rangeDays);

  // Stats
  const totalUsers = users.filter((u) => {
    const d = new Date(u.created_at);
    return d >= startDate;
  }).length;

  const newSignups = totalUsers;

  const filesUploaded = files.filter((f) => {
    const d = new Date(f.created_at);
    return d >= startDate;
  }).length;

  const videosUploaded = videos.filter((v) => {
    const d = new Date(v.created_at);
    return d >= startDate;
  }).length;

  const commentsCount = comments.filter((c) => {
    const d = new Date(c.created_at);
    return d >= startDate;
  }).length;

  // Chart data
  const userDailyMap = groupByDate(users, startDate);
  const fileDailyMap = groupByDate(files, startDate);
  const videoDailyMap = groupByDate(videos, startDate);

  const userChartData = buildDailyData(userDailyMap, startDate, rangeDays);
  const fileChartData = buildDailyData(fileDailyMap, startDate, rangeDays);
  const videoChartData = buildDailyData(videoDailyMap, startDate, rangeDays);

  // For sparse data, show only every N-th tick
  const tickInterval = rangeDays <= 7 ? 0 : rangeDays <= 30 ? 4 : 9;

  const axisStyle = { fontSize: 11, fill: "var(--t3)" };

  return (
    <div>
      <div className="admin-page-title">Analytics</div>
      <div className="admin-page-sub">Platform usage metrics and growth charts.</div>

      {/* Date range selector */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
        {RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => setRangeDays(r.days)}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              border: `1px solid ${rangeDays === r.days ? "#f97316" : "var(--border)"}`,
              background: rangeDays === r.days ? "rgba(249,115,22,0.12)" : "var(--card)",
              color: rangeDays === r.days ? "#f97316" : "var(--t2)",
              fontSize: "13px",
              fontWeight: rangeDays === r.days ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="admin-stats-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <StatCard
          icon={<Users size={18} weight="duotone" />}
          label="Total Users"
          value={users.length}
          loading={loading}
        />
        <StatCard
          icon={<UserPlus size={18} weight="duotone" />}
          label={`New Signups (${RANGES.find((r) => r.days === rangeDays)?.label})`}
          value={newSignups}
          loading={loading}
        />
        <StatCard
          icon={<Files size={18} weight="duotone" />}
          label="Files Uploaded"
          value={filesUploaded}
          loading={loading}
        />
        <StatCard
          icon={<VideoCamera size={18} weight="duotone" />}
          label="Videos Uploaded"
          value={videosUploaded}
          loading={loading}
        />
        <StatCard
          icon={<ChatCircle size={18} weight="duotone" />}
          label="Comments"
          value={commentsCount}
          loading={loading}
        />
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
        {/* User Growth */}
        <div className="admin-section">
          <div className="admin-section-title">User Growth</div>
          <div className="admin-section-body">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={userChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  interval={tickInterval}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="New Users"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#f97316" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upload Volume */}
        <div className="admin-section">
          <div className="admin-section-title">Upload Volume</div>
          <div className="admin-section-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={fileChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  interval={tickInterval}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Files" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Video Uploads */}
        <div className="admin-section">
          <div className="admin-section-title">Video Uploads</div>
          <div className="admin-section-body">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={videoChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDateLabel}
                  interval={tickInterval}
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Videos" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="admin-section">
          <div className="admin-section-title">Plan Distribution</div>
          <div className="admin-section-body">
            {loading ? (
              <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "13px" }}>
                Loading…
              </div>
            ) : planDist.length === 0 ? (
              <div style={{ height: "220px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t3)", fontSize: "13px" }}>
                No active plans data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={planDist}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={3}
                  >
                    {planDist.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PLAN_COLORS[entry.name] || DEFAULT_PIE_COLORS[index % DEFAULT_PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend
                    formatter={(value) => (
                      <span style={{ fontSize: "12px", color: "var(--t2)" }}>{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
