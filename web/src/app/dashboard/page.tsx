"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";

interface EarningsData {
  totalEarnings: number;
  pendingPayout: number;
  todayEarnings: number;
  totalSessions?: number;
  recentSessions: {
    duration_seconds: number;
    earning: number;
    created_at: string;
  }[];
  dailyEarnings?: {
    date: string;
    amount: number;
  }[];
  referralCode?: string;
  referralBonus?: number;
  adsEnabled?: boolean;
}

function relativeTime(dateStr: string, locale: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (locale === "ko") {
    if (seconds < 60) return `${seconds}초 전`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return `${days}일 전`;
  } else {
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildDailyBars(
  dailyEarnings?: { date: string; amount: number }[]
): { label: string; amount: number }[] {
  const days: { label: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    const found = dailyEarnings?.find((x) => x.date === key);
    days.push({ label, amount: found?.amount ?? 0 });
  }
  return days;
}

// SVG icons
const IconTrending = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,11 5,7 9,9 15,3" />
    <polyline points="11,3 15,3 15,7" />
  </svg>
);
const IconClock = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6.5" />
    <polyline points="8,4.5 8,8 10.5,10" />
  </svg>
);
const IconWallet = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="14" height="10" rx="1.5" />
    <path d="M1 7h14" />
    <circle cx="12" cy="10.5" r="1" fill="currentColor" stroke="none" />
    <path d="M4 4V3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
  </svg>
);
const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" />
    <rect x="9.5" y="1.5" width="5" height="5" rx="0.5" />
    <rect x="1.5" y="9.5" width="5" height="5" rx="0.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
  </svg>
);
const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="9" height="9" rx="1" />
    <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2,8 6,12 14,4" />
  </svg>
);
const IconRefresh = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 8a6 6 0 1 1-1.5-4" />
    <polyline points="14,2 14,6 10,6" />
  </svg>
);
const IconLink = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 9.5a3.54 3.54 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5L7 4" />
    <path d="M9.5 6.5a3.54 3.54 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5L9 12" />
  </svg>
);
const IconToggleOn = () => (
  <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
    <rect width="28" height="16" rx="8" fill="#22c55e" />
    <circle cx="20" cy="8" r="6" fill="white" />
  </svg>
);
const IconToggleOff = () => (
  <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
    <rect width="28" height="16" rx="8" fill="#3f3f46" />
    <circle cx="8" cy="8" r="6" fill="#71717a" />
  </svg>
);

// ─── Language Toggle ──────────────────────────────────────────────────────────

function LangToggle() {
  const { locale, setLocale } = useT();
  return (
    <button
      onClick={() => setLocale(locale === "en" ? "ko" : "en")}
      style={{
        background: "transparent",
        border: "1px solid #3f3f46",
        color: "#71717a",
        fontFamily: "'JetBrains Mono', monospace",
        padding: "4px 10px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "11px",
        transition: "border-color 0.15s, color 0.15s",
      }}
      aria-label="Toggle language"
    >
      {locale === "en" ? "EN / KO" : "KO / EN"}
    </button>
  );
}

export default function Dashboard() {
  const { t, locale } = useT();
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [adsEnabled, setAdsEnabled] = useState(true);
  const [payoutLoading, setPayoutLoading] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/earnings", {
        headers: { "x-api-key": apiKey },
      });
      if (!res.ok) throw new Error("Invalid API key");
      const json = await res.json();
      setData(json);
      if (json.adsEnabled !== undefined) setAdsEnabled(json.adsEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    const saved = localStorage.getItem("claudenews-api-key");
    if (saved) setApiKey(saved);
  }, []);

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("claudenews-api-key", apiKey);
      fetchEarnings();
    }
  }, [apiKey, fetchEarnings]);

  const referralLink = data?.referralCode
    ? `https://codearn.io/r/${data.referralCode}`
    : `https://codearn.io/r/—`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handlePayout = async () => {
    setPayoutLoading(true);
    await new Promise((r) => setTimeout(r, 1200));
    setPayoutLoading(false);
  };

  const MIN_PAYOUT = 20;
  const canPayout = (data?.pendingPayout ?? 0) >= MIN_PAYOUT;
  const bars = buildDailyBars(data?.dailyEarnings);
  const maxBar = Math.max(...bars.map((b) => b.amount), 0.0001);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Outfit:wght@400;500;600;700&display=swap');

        .dash-root {
          font-family: 'Outfit', sans-serif;
          background: #09090b;
          min-height: 100vh;
          color: #e4e4e7;
        }
        .mono { font-family: 'JetBrains Mono', monospace; }

        .bar-fill {
          transition: height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
          position: relative;
          overflow: hidden;
        }
        .bar-fill::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%);
        }
        .bar-fill.today {
          animation: pulse-bar 2s ease-in-out infinite;
        }
        @keyframes pulse-bar {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }

        .stat-card {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 12px;
          padding: 20px;
          transition: border-color 0.2s;
        }
        .stat-card:hover { border-color: #3f3f46; }

        .section-card {
          background: #18181b;
          border: 1px solid #27272a;
          border-radius: 12px;
        }

        .session-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #27272a;
          transition: background 0.15s;
        }
        .session-row:last-child { border-bottom: none; }
        .session-row:hover { background: #1f1f23; }

        .btn-primary {
          background: #22c55e;
          color: #09090b;
          font-weight: 600;
          font-family: 'Outfit', sans-serif;
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.15s, transform 0.1s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .btn-primary:hover { background: #16a34a; }
        .btn-primary:active { transform: scale(0.98); }
        .btn-primary:disabled {
          background: #27272a;
          color: #52525b;
          cursor: not-allowed;
          transform: none;
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid #3f3f46;
          color: #a1a1aa;
          font-family: 'Outfit', sans-serif;
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          transition: border-color 0.15s, color 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .btn-ghost:hover { border-color: #52525b; color: #e4e4e7; }

        .input-field {
          background: #09090b;
          border: 1px solid #27272a;
          color: #e4e4e7;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          padding: 10px 14px;
          border-radius: 8px;
          outline: none;
          width: 100%;
          transition: border-color 0.15s;
        }
        .input-field:focus { border-color: #22c55e; }
        .input-field::placeholder { color: #3f3f46; }

        .tag {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
          font-family: 'JetBrains Mono', monospace;
          letter-spacing: 0.03em;
        }
        .tag-green { background: #14532d; color: #4ade80; }
        .tag-zinc  { background: #27272a; color: #71717a; }

        .progress-track {
          height: 4px;
          background: #27272a;
          border-radius: 2px;
          overflow: hidden;
          margin-top: 10px;
        }
        .progress-fill {
          height: 100%;
          background: #22c55e;
          border-radius: 2px;
          transition: width 0.8s cubic-bezier(0.34, 1.2, 0.64, 1);
        }

        .divider { border: none; border-top: 1px solid #27272a; margin: 0; }

        .copy-field {
          background: #09090b;
          border: 1px solid #27272a;
          border-radius: 8px;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .spinner {
          width: 12px; height: 12px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .section-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #52525b;
          padding: 16px 16px 10px;
        }
      `}</style>

      <div className="dash-root">
        {/* Header */}
        <header style={{
          borderBottom: "1px solid #1c1c1f",
          padding: "0 24px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "rgba(9,9,11,0.9)",
          backdropFilter: "blur(10px)",
          zIndex: 50,
        }}>
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 700, fontSize: "16px", color: "#e4e4e7", fontFamily: "'Outfit', sans-serif" }}>
              Code<span style={{ color: "#22c55e" }}>Earn</span>
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LangToggle />
            {data && (
              <span className="tag tag-green" style={{ marginRight: "4px" }}>{t("dash_connected")}</span>
            )}
            <button
              onClick={fetchEarnings}
              disabled={loading || !apiKey}
              className="btn-ghost"
              style={{ padding: "6px 10px" }}
              title={t("dash_refresh_title")}
            >
              {loading ? <span className="spinner" /> : <IconRefresh />}
            </button>
          </div>
        </header>

        <main style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 24px 80px" }}>

          {/* API Key Section */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "13px", color: "#71717a", fontWeight: 500 }}>{t("dash_api_key_label")}</span>
              {!data && (
                <span className="tag tag-zinc">{t("dash_not_connected")}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchEarnings()}
                placeholder="ce_xxxxxxxxxxxxxxxx"
                className="input-field"
                style={{ flex: 1 }}
              />
              <button
                onClick={fetchEarnings}
                disabled={loading || !apiKey}
                className="btn-primary"
                style={{ whiteSpace: "nowrap" }}
              >
                {loading ? <span className="spinner" /> : t("dash_lookup")}
              </button>
            </div>
            {error && (
              <p style={{ marginTop: "8px", fontSize: "13px", color: "#f87171" }}>{error}</p>
            )}
            {!data && !error && (
              <p style={{ marginTop: "6px", fontSize: "12px", color: "#3f3f46" }}>
                {t("dash_api_key_placeholder")}
              </p>
            )}
          </div>

          {data && (
            <>
              {/* Stats Cards */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "12px",
                marginBottom: "24px",
              }}>
                {/* Total Earnings */}
                <div className="stat-card" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "12px", color: "#52525b", marginBottom: "6px", fontWeight: 500 }}>
                        {t("dash_total_earnings")}
                      </div>
                      <div className="mono" style={{ fontSize: "32px", fontWeight: 600, color: "#22c55e", letterSpacing: "-0.02em" }}>
                        ${data.totalEarnings.toFixed(4)}
                      </div>
                    </div>
                    <div style={{ color: "#22c55e", opacity: 0.6 }}>
                      <IconTrending />
                    </div>
                  </div>
                  {/* Payout progress */}
                  <div style={{ marginTop: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", color: "#52525b" }}>
                        {t("dash_payout_progress")}
                      </span>
                      <span className="mono" style={{ fontSize: "11px", color: "#71717a" }}>
                        ${data.pendingPayout.toFixed(2)} / ${MIN_PAYOUT}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min((data.pendingPayout / MIN_PAYOUT) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Today */}
                <div className="stat-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ color: "#3f3f46" }}><IconClock /></span>
                    <span style={{ fontSize: "12px", color: "#52525b", fontWeight: 500 }}>{t("dash_today")}</span>
                  </div>
                  <div className="mono" style={{ fontSize: "22px", fontWeight: 600, color: "#e4e4e7" }}>
                    ${data.todayEarnings.toFixed(4)}
                  </div>
                </div>

                {/* Pending */}
                <div className="stat-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ color: "#3f3f46" }}><IconWallet /></span>
                    <span style={{ fontSize: "12px", color: "#52525b", fontWeight: 500 }}>{t("dash_pending")}</span>
                  </div>
                  <div className="mono" style={{ fontSize: "22px", fontWeight: 600, color: "#e4e4e7" }}>
                    ${data.pendingPayout.toFixed(4)}
                  </div>
                </div>

                {/* Total Sessions */}
                <div className="stat-card" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                    <span style={{ color: "#3f3f46" }}><IconGrid /></span>
                    <span style={{ fontSize: "12px", color: "#52525b", fontWeight: 500 }}>{t("dash_total_sessions")}</span>
                  </div>
                  <div className="mono" style={{ fontSize: "22px", fontWeight: 600, color: "#e4e4e7" }}>
                    {data.totalSessions ?? data.recentSessions.length}
                    <span style={{ fontSize: "13px", color: "#52525b", marginLeft: "6px", fontFamily: "'Outfit', sans-serif" }}>
                      {t("dash_sessions_unit")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Daily Earnings Chart */}
              <div className="section-card" style={{ marginBottom: "24px" }}>
                <div className="section-label">{t("dash_chart_title")}</div>
                <hr className="divider" />
                <div style={{ padding: "20px 16px 16px" }}>
                  <div style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "8px",
                    height: "96px",
                  }}>
                    {bars.map((bar, i) => {
                      const isToday = i === bars.length - 1;
                      const pct = maxBar > 0 ? (bar.amount / maxBar) * 100 : 0;
                      const heightPx = Math.max(pct * 0.88, bar.amount > 0 ? 4 : 1);
                      return (
                        <div key={bar.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", height: "100%" }}>
                          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                            <div
                              className={`bar-fill${isToday ? " today" : ""}`}
                              style={{
                                width: "100%",
                                height: `${heightPx}%`,
                                minHeight: "2px",
                                background: isToday
                                  ? "#22c55e"
                                  : bar.amount > 0
                                    ? "#166534"
                                    : "#1c1c1f",
                                borderRadius: "4px 4px 2px 2px",
                              }}
                              title={`$${bar.amount.toFixed(4)}`}
                            />
                          </div>
                          <span className="mono" style={{ fontSize: "10px", color: isToday ? "#71717a" : "#3f3f46" }}>
                            {bar.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {bars.every((b) => b.amount === 0) && (
                    <p style={{ textAlign: "center", fontSize: "12px", color: "#3f3f46", marginTop: "12px" }}>
                      {t("dash_chart_empty")}
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Sessions */}
              <div className="section-card" style={{ marginBottom: "24px" }}>
                <div className="section-label">{t("dash_recent_sessions")}</div>
                <hr className="divider" />
                {data.recentSessions.length === 0 ? (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "#3f3f46", fontSize: "13px" }}>
                    {t("dash_no_sessions")}
                  </div>
                ) : (
                  data.recentSessions.map((session, i) => (
                    <div key={i} className="session-row">
                      <div>
                        <div style={{ fontSize: "13px", color: "#a1a1aa", marginBottom: "2px" }}>
                          {relativeTime(session.created_at, locale)}
                        </div>
                        <div className="mono" style={{ fontSize: "11px", color: "#3f3f46" }}>
                          {formatDuration(session.duration_seconds)} &middot; {formatDate(session.created_at)}
                        </div>
                      </div>
                      <span className="mono tag tag-green" style={{ padding: "3px 10px" }}>
                        +${session.earning.toFixed(4)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Referral Section */}
              <div className="section-card" style={{ marginBottom: "24px" }}>
                <div className="section-label">{t("dash_referral_title")}</div>
                <hr className="divider" />
                <div style={{ padding: "16px" }}>
                  <p style={{ fontSize: "13px", color: "#71717a", marginBottom: "12px" }}>
                    {t("dash_referral_desc_pre")}
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>{t("dash_referral_desc_pct")}</span>
                    {t("dash_referral_desc_post")}
                  </p>
                  <div className="copy-field">
                    <span className="mono" style={{ fontSize: "12px", color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#52525b", marginRight: "4px" }}><IconLink /></span>
                      {referralLink}
                    </span>
                    <button
                      onClick={handleCopy}
                      className="btn-ghost"
                      style={{ flexShrink: 0, padding: "5px 10px", gap: "4px" }}
                    >
                      {copied ? (
                        <><span style={{ color: "#22c55e" }}><IconCheck /></span> {t("dash_copied")}</>
                      ) : (
                        <><IconCopy /> {t("dash_copy")}</>
                      )}
                    </button>
                  </div>
                  {data.referralBonus !== undefined && data.referralBonus > 0 && (
                    <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#52525b" }}>{t("dash_referral_bonus")}</span>
                      <span className="mono tag tag-green">${data.referralBonus.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payout + Settings Row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>

                {/* Payout */}
                <div className="section-card">
                  <div className="section-label">{t("dash_payout_title")}</div>
                  <hr className="divider" />
                  <div style={{ padding: "16px" }}>
                    <p style={{ fontSize: "12px", color: "#52525b", marginBottom: "12px" }}>
                      {t("dash_min_payout")} <span className="mono" style={{ color: "#71717a" }}>${MIN_PAYOUT}.00</span>
                    </p>
                    <div className="mono" style={{ fontSize: "18px", fontWeight: 600, color: canPayout ? "#22c55e" : "#3f3f46", marginBottom: "14px" }}>
                      ${data.pendingPayout.toFixed(2)}
                    </div>
                    <button
                      onClick={handlePayout}
                      disabled={!canPayout || payoutLoading}
                      className="btn-primary"
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      {payoutLoading ? (
                        <><span className="spinner" /> {t("dash_payout_processing")}</>
                      ) : canPayout ? (
                        t("dash_payout_request")
                      ) : (
                        `$${(MIN_PAYOUT - data.pendingPayout).toFixed(2)} ${t("dash_payout_short")}`
                      )}
                    </button>
                  </div>
                </div>

                {/* Settings */}
                <div className="section-card">
                  <div className="section-label">{t("dash_settings_title")}</div>
                  <hr className="divider" />
                  <div style={{ padding: "16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: 500, marginBottom: "2px" }}>
                          {t("dash_ads_monetization")}
                        </div>
                        <div style={{ fontSize: "11px", color: "#52525b" }}>
                          {adsEnabled ? t("dash_ads_enabled") : t("dash_ads_disabled")}
                        </div>
                      </div>
                      <button
                        onClick={() => setAdsEnabled(!adsEnabled)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                        aria-label={adsEnabled ? t("dash_ads_toggle_on") : t("dash_ads_toggle_off")}
                      >
                        {adsEnabled ? <IconToggleOn /> : <IconToggleOff />}
                      </button>
                    </div>
                    <hr className="divider" style={{ marginBottom: "12px" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: "13px", color: "#a1a1aa", fontWeight: 500, marginBottom: "2px" }}>
                          {t("dash_reset_key")}
                        </div>
                        <div style={{ fontSize: "11px", color: "#52525b" }}>
                          {t("dash_disconnect")}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          localStorage.removeItem("claudenews-api-key");
                          setApiKey("");
                          setData(null);
                        }}
                        className="btn-ghost"
                        style={{ padding: "4px 10px", fontSize: "12px" }}
                      >
                        {t("dash_reset_btn")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
