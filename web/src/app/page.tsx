"use client";

import { useState, useEffect } from "react";
import { useT } from "@/lib/i18n";

// ─── Terminal Animation ───────────────────────────────────────────────────────

const DELAYS: Record<string, number> = {
  prompt: 100,
  info: 900,
  spacer: 300,
  "ad-border": 500,
  "ad-label": 500,
  "ad-body": 220,
  "ad-url": 220,
  earn: 400,
  output: 800,
};

const COLOR_MAP: Record<string, string> = {
  prompt: "text-zinc-200",
  info: "text-zinc-500",
  spacer: "",
  "ad-border": "text-zinc-600",
  "ad-label": "text-zinc-600",
  "ad-body": "text-zinc-400",
  "ad-url": "text-zinc-500",
  earn: "text-zinc-300",
  output: "text-zinc-200",
};

function TerminalDemo() {
  const { t } = useT();
  const [visible, setVisible] = useState(0);
  const [cursor, setCursor] = useState(true);

  const TERMINAL_LINES = [
    { type: "prompt", text: "$ claude \"refactor payment module\"" },
    { type: "info", text: t("terminal_thinking") },
    { type: "spacer", text: "" },
    { type: "ad-label", text: t("terminal_ad_label") },
    { type: "ad-body", text: t("terminal_ad_body") },
    { type: "ad-url", text: t("terminal_ad_url") },
    { type: "ad-label", text: t("terminal_ad_label_end") },
    { type: "spacer", text: "" },
    { type: "earn", text: t("terminal_earned") },
    { type: "spacer", text: "" },
    { type: "output", text: t("terminal_done") },
  ];

  useEffect(() => {
    if (visible >= TERMINAL_LINES.length) {
      const timer = setTimeout(() => setVisible(0), 4000);
      return () => clearTimeout(timer);
    }
    const line = TERMINAL_LINES[visible];
    const delay = DELAYS[line?.type ?? "spacer"] ?? 300;
    const timer = setTimeout(() => setVisible((v) => v + 1), delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    const timer = setInterval(() => setCursor((c) => !c), 560);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-lg mx-auto lg:mx-0 lg:ml-auto">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden shadow-xl shadow-black/40">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="ml-3 text-xs text-zinc-600 font-mono select-none">
            ~/work/my-project
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-4 font-mono text-sm h-[220px] overflow-hidden relative">
          <div
            className="transition-transform duration-300 ease-out"
            style={{
              transform: `translateY(-${Math.max(0, (visible - 7) * 24)}px)`,
            }}
          >
            {TERMINAL_LINES.slice(0, visible).map((line, i) => (
              <div
                key={i}
                className={`leading-6 ${COLOR_MAP[line.type] ?? "text-zinc-400"}`}
              >
                {line.text === "" ? <>&nbsp;</> : line.text}
              </div>
            ))}
            <span
              className={`inline-block w-[7px] h-[14px] bg-zinc-400 align-middle transition-opacity duration-75 ${
                cursor ? "opacity-70" : "opacity-0"
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Copy snippet with copy button ────────────────────────────────────────────

function CopySnippet({ code }: { code: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="inline-flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2.5">
      <span className="text-zinc-600 font-mono text-sm select-none">$</span>
      <code className="font-mono text-sm text-zinc-300">{code}</code>
      <button
        onClick={handleCopy}
        className="text-zinc-600 hover:text-zinc-300 transition-colors ml-1"
        aria-label={t("copy_aria")}
      >
        {copied ? (
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-zinc-300">
            <path fillRule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Language Toggle ──────────────────────────────────────────────────────────

function LangToggle() {
  const { locale, setLocale } = useT();
  return (
    <button
      onClick={() => setLocale(locale === "en" ? "ko" : "en")}
      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
      aria-label="Toggle language"
    >
      {locale === "en" ? "EN / KO" : "KO / EN"}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { t } = useT();

  return (
    <div className="flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-zinc-900/80 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-13 flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-zinc-200 tracking-tight">
            claudenews
          </span>
          <div className="flex items-center gap-4">
            <LangToggle />
            <a
              href="#install"
              className="text-xs font-medium text-zinc-900 bg-zinc-200 hover:bg-white px-3 py-1.5 rounded transition-colors"
            >
              {t("nav_install")}
            </a>
          </div>
        </div>
      </header>

      <main className="flex flex-col">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-32 pb-20 px-6">
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-start gap-14 lg:gap-20">
            {/* Left: copy */}
            <div className="flex-1 flex flex-col gap-7 pt-2">
              <div className="space-y-4">
                <p className="text-xs font-mono text-zinc-500 tracking-wider uppercase">
                  {t("hero_beta")}
                </p>
                <h1 className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold tracking-tight leading-[1.1] text-zinc-100">
                  {t("hero_headline_1")}
                  <br />
                  {t("hero_headline_2")}
                </h1>
                <p className="text-base text-zinc-400 leading-relaxed max-w-sm">
                  {t("hero_desc")}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start gap-3" id="install">
                <a
                  href="https://github.com/bhpark1013/claudenews"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 h-10 px-5 rounded bg-zinc-200 hover:bg-white text-zinc-900 text-sm font-semibold transition-colors"
                >
                  {t("hero_cta_install")}
                </a>
                <a
                  href="#how"
                  className="inline-flex items-center gap-1 h-10 px-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {t("hero_cta_how")}
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 ml-0.5">
                    <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Right: terminal */}
            <div className="w-full lg:flex-1">
              <TerminalDemo />
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section id="how" className="py-20 px-6 border-t border-zinc-900">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-xl space-y-10">
              <h2 className="text-xs font-mono text-zinc-500 tracking-wider uppercase">
                {t("how_title")}
              </h2>

              <ol className="space-y-8">
                {[
                  {
                    n: "01",
                    title: t("how_step1_title"),
                    desc: t("how_step1_desc"),
                  },
                  {
                    n: "02",
                    title: t("how_step2_title"),
                    desc: t("how_step2_desc"),
                  },
                  {
                    n: "03",
                    title: t("how_step3_title"),
                    desc: t("how_step3_desc"),
                  },
                ].map((step) => (
                  <li key={step.n} className="flex gap-6 items-start">
                    <span className="font-mono text-xs text-zinc-700 pt-0.5 shrink-0 w-6 tabular-nums">
                      {step.n}
                    </span>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-zinc-200">{step.title}</p>
                      <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ── Honest pitch ─────────────────────────────────────────────────── */}
        <section className="py-20 px-6 border-t border-zinc-900">
          <div className="max-w-5xl mx-auto">
            <div className="max-w-xl space-y-4">
              <h2 className="text-xs font-mono text-zinc-500 tracking-wider uppercase">
                {t("honest_title")}
              </h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {t("honest_p1")}
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                {t("honest_p2")}
              </p>
            </div>
          </div>
        </section>

        {/* ── Footer CTA ───────────────────────────────────────────────────── */}
        <section className="py-20 px-6 border-t border-zinc-900">
          <div className="max-w-5xl mx-auto flex flex-col gap-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-zinc-200">{t("footer_cta_title")}</h2>
              <p className="text-sm text-zinc-500">
                {t("footer_cta_desc")}
              </p>
            </div>

            <CopySnippet code="curl -fsSL https://raw.githubusercontent.com/bhpark1013/claudenews/main/install.sh | bash" />

            <div className="flex items-center gap-4 pt-1">
              <a
                href="https://github.com/bhpark1013/claudenews"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-9 px-4 rounded bg-zinc-200 hover:bg-white text-zinc-900 text-sm font-semibold transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 px-6 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <span className="font-mono text-xs text-zinc-700">claudenews</span>
          <div className="flex gap-5 text-xs text-zinc-700">
            <a href="#" className="hover:text-zinc-400 transition-colors">
              {t("footer_privacy")}
            </a>
            <a href="#" className="hover:text-zinc-400 transition-colors">
              {t("footer_terms")}
            </a>
            <a
              href="mailto:hello@codearn.dev"
              className="hover:text-zinc-400 transition-colors"
            >
              {t("footer_contact")}
            </a>
          </div>
          <span className="text-xs text-zinc-700">© 2025 CodeEarn</span>
        </div>
      </footer>
    </div>
  );
}
