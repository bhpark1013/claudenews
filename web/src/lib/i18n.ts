"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createElement } from "react";

// ─── Dictionary ───────────────────────────────────────────────────────────────

export type Locale = "en" | "ko";

const dict = {
  en: {
    // Nav / landing
    nav_login: "Login",
    nav_install: "Install",
    hero_beta: "Beta",
    hero_headline_1: "Dev news,",
    hero_headline_2: "while AI thinks.",
    hero_desc:
      "Hacker News, GitHub Trending, and AI updates appear in your status line while Claude Code works. Learn something during every wait.",
    hero_cta_install: "Install Plugin",
    hero_cta_how: "How it works",
    how_title: "How it works",
    how_step1_title: "One-line install",
    how_step1_desc:
      "Run a single command. It registers automatically with Claude Code.",
    how_step2_title: "Keep coding",
    how_step2_desc:
      "When you send a prompt, a fresh news item rotates into the status line. No prompts, code, or keystrokes are collected.",
    how_step3_title: "Stay in the loop",
    how_step3_desc:
      "Top HN stories, trending GitHub repos, and AI releases — curated and always current.",
    honest_title: "Honestly speaking",
    honest_p1:
      "Built because I was tired of staring at 'Thinking...' for 30 seconds. Now I read something instead.",
    honest_p2:
      "Free, open source, takes 5 minutes to install. Remove it anytime if you don't like it.",
    footer_cta_title: "Install",
    footer_cta_desc:
      "Requires Claude Code. One command and you're done.",
    footer_dashboard: "Dashboard",
    footer_privacy: "Privacy Policy",
    footer_terms: "Terms of Service",
    footer_contact: "Contact",
    copy_aria: "Copy",
    // Terminal animation
    terminal_thinking: "  Thinking...",
    terminal_ad_label: "  [feed] HackerNews",
    terminal_ad_body: "  Rust 2.0 compiler is 10x faster than GCC",
    terminal_ad_url: "  ▲ 847  💬 234",
    terminal_ad_label_end: "  news.ycombinator.com/item?id=...",
    terminal_earned: "  [feed] GitHub Trending",
    terminal_done: "  Done. 8 files, 247 lines changed.",
    // Ad page
    ad_earning_header: "Earning while you wait",
    ad_tip_label: "tip",
    ad_trending_title: "Popular Dev Tools & Repos",
    ad_news_title: "Developer News",
    ad_quiz_title: "Mini Coding Quiz",
    ad_footer: "This page will close automatically when the agent responds",
    ad_score_suffix: "correct",
    ad_quiz_next: "Next →",
    ad_quiz_correct: "✓ Correct!",
    ad_quiz_wrong: "✗ Wrong",
    ad_tip_aria: "Tip",
    // Dashboard
    dash_connected: "Connected",
    dash_not_connected: "Disconnected",
    dash_refresh_title: "Refresh",
    dash_api_key_label: "API Key",
    dash_api_key_placeholder: "Enter API key from plugin installation",
    dash_lookup: "Look up",
    dash_total_earnings: "Total Earnings",
    dash_payout_progress: "Until minimum payout",
    dash_today: "Today's Earnings",
    dash_pending: "Pending Payout",
    dash_total_sessions: "Total Sessions",
    dash_sessions_unit: "sessions",
    dash_chart_title: "Last 7 Days",
    dash_chart_empty: "No earnings data for the last 7 days",
    dash_recent_sessions: "Recent Sessions",
    dash_no_sessions: "No sessions yet",
    dash_referral_title: "Referral Link",
    dash_referral_desc_pre: "Invite friends and earn ",
    dash_referral_desc_pct: "10%",
    dash_referral_desc_post: " of their earnings permanently.",
    dash_referral_bonus: "Referral Bonus",
    dash_copy: "Copy",
    dash_copied: "Copied",
    dash_payout_title: "Payout",
    dash_min_payout: "Minimum payout:",
    dash_payout_request: "Request Payout",
    dash_payout_short: "short",
    dash_payout_processing: "Processing...",
    dash_settings_title: "Settings",
    dash_ads_monetization: "Ad Monetization",
    dash_ads_enabled: "Enabled",
    dash_ads_disabled: "Disabled",
    dash_ads_toggle_on: "Disable ads",
    dash_ads_toggle_off: "Enable ads",
    dash_reset_key: "Reset API Key",
    dash_disconnect: "Disconnect",
    dash_reset_btn: "Reset",
    // relativeTime
    time_seconds_ago: "s ago",
    time_minutes_ago: "m ago",
    time_hours_ago: "h ago",
    time_days_ago: "d ago",
    // Tips - Claude Code
    tip_cc_1: "Use /compact to compress context and save tokens in long sessions.",
    tip_cc_2: "Write project rules in CLAUDE.md and agents will reference them automatically.",
    tip_cc_3: "Press Shift+Tab to enter multi-line input and pass complex commands at once.",
    tip_cc_4: "Use /cost to check real-time token usage and cost for the current session.",
    tip_cc_5: "Connect MCP servers to integrate external tools like databases, Slack, and GitHub.",
    tip_cc_6: "Configure hooks to run automatic commands on PreToolUse and PostToolUse events.",
    tip_cc_7: "Use Git worktree to work on multiple branches simultaneously in different directories.",
    tip_cc_8: "Plan mode makes agents draft a plan and wait for review before executing.",
    tip_cc_9: "Use /clear to reset conversation history and start with a fresh context.",
    tip_cc_10: "Use AGENTS.md to finely control roles and permissions for sub-agents.",
    // Tips - GitHub Copilot
    tip_gh_1: "Press Tab to accept Copilot suggestions; use Alt+] / Alt+[ to navigate next/prev.",
    tip_gh_2: "Write clear comments to get much more accurate Copilot suggestions.",
    tip_gh_3: "In Copilot Chat, use /explain, /fix, /tests slash commands for quick actions.",
    tip_gh_4: "Keep multiple files open so Copilot better understands project context.",
    tip_gh_5: "Copilot Workspace automates the full dev flow from issue to PR.",
    // Tips - AI General
    tip_ai_1: "Providing input/output examples with code requests greatly improves accuracy.",
    tip_ai_2: "Don't use generated code as-is — always understand the logic and write tests.",
    tip_ai_3: "Ask 'Why did you choose this approach?' to uncover alternatives and trade-offs.",
    tip_ai_4: "Paste the full error message and stack trace so AI can pinpoint the root cause.",
    tip_ai_5: "For refactoring, specify 'minimize scope and preserve existing patterns'.",
    tip_ai_6: "Break complex features into small steps and implement them conversationally.",
    tip_ai_7: "Always check AI-generated SQL queries with EXPLAIN to verify performance.",
    // Trending repos descriptions
    repo_claude_code_desc: "Official CLI tool for pair programming with Claude AI directly from the terminal",
    repo_vscode_desc: "The most popular open-source code editor. Copilot, extensibility, multi-platform support",
    repo_continue_desc: "Open-source AI coding assistant for VS Code / JetBrains. Supports local models",
    repo_ollama_desc: "Tool for running Llama 3, Mistral, Gemma and other LLMs locally with ease",
    repo_cline_desc: "Autonomous AI coding agent extension that edits and runs files directly in VS Code",
    repo_vercel_ai_desc: "Official AI SDK for building streaming AI UIs quickly in React/Next.js",
    // Dev news
    news_1_title: "Claude 4 Opus Released — Surpasses GPT-5 on Coding Benchmarks",
    news_1_time: "2 hours ago",
    news_1_tag: "AI",
    news_2_title: "GitHub Copilot Agent Mode GA — Automates Issue to PR Flow",
    news_2_time: "5 hours ago",
    news_2_tag: "Tools",
    news_3_title: "Next.js 16 Released — Full React 19 Support, Turbopack by Default",
    news_3_time: "1 day ago",
    news_3_tag: "Framework",
    news_4_title: "Stack Overflow Survey: 76% of Developers Use AI Coding Tools Daily",
    news_4_time: "1 day ago",
    news_4_tag: "Industry",
    news_5_title: "Google DeepMind AlphaCode 3 Reaches IOI Gold Medal Level",
    news_5_time: "2 days ago",
    news_5_tag: "AI",
    news_6_title: "Rust Overtakes JavaScript as #1 Language in WebAssembly Ecosystem",
    news_6_time: "3 days ago",
    news_6_tag: "Languages",
    // Quiz
    quiz_1_question: "What does `git rebase` do?",
    quiz_1_opt_0: "Creates a new branch",
    quiz_1_opt_1: "Reapplies commits on top of a different base",
    quiz_1_opt_2: "Clones a remote branch locally",
    quiz_1_opt_3: "Clears the staging area",
    quiz_1_explanation:
      "Rebase reapplies the current branch's commits sequentially on top of the specified base commit. Unlike merge, it maintains a linear history.",
    quiz_2_question: "What is the output of this TypeScript code?",
    quiz_2_opt_0: "'no'",
    quiz_2_opt_1: "'yes'",
    quiz_2_opt_2: "TypeError",
    quiz_2_opt_3: "undefined",
    quiz_2_explanation:
      "string is a subtype of unknown, so the conditional type 'string extends unknown' evaluates to true, resulting in 'yes'.",
    quiz_3_question: "What does HTTP status code 429 mean?",
    quiz_3_opt_0: "Bad request format",
    quiz_3_opt_1: "Authentication required",
    quiz_3_opt_2: "Too Many Requests (Rate Limit)",
    quiz_3_opt_3: "Internal server error",
    quiz_3_explanation:
      "429 Too Many Requests — returned by the server when the client sends too many requests in a short time. Common with AI APIs.",
    quiz_4_question: "What is the main purpose of React's `useCallback` hook?",
    quiz_4_opt_0: "Convert async functions to sync",
    quiz_4_opt_1: "Memoize function references to prevent unnecessary re-renders",
    quiz_4_opt_2: "Subscribe to global state",
    quiz_4_opt_3: "Run cleanup logic on component unmount",
    quiz_4_explanation:
      "useCallback creates a new function reference only when dependencies change. Used to prevent unnecessary re-renders when passing functions as props to child components.",
    quiz_5_question: "What is required for CSS `z-index` to work?",
    quiz_5_opt_0: "display: flex is set",
    quiz_5_opt_1: "position is set to a value other than static",
    quiz_5_opt_2: "overflow: hidden is set",
    quiz_5_opt_3: "width/height are specified",
    quiz_5_explanation:
      "z-index only works when position is relative, absolute, fixed, or sticky. It does not apply to elements with position: static (the default).",
    // Tag translations for news (display)
    tag_tools: "Tools",
    tag_framework: "Framework",
    tag_industry: "Industry",
    tag_languages: "Languages",
  },
  ko: {
    // Nav / landing
    nav_login: "로그인",
    nav_install: "설치하기",
    hero_beta: "베타",
    hero_headline_1: "AI가 생각하는 동안,",
    hero_headline_2: "개발 뉴스를 읽어요.",
    hero_desc:
      "Claude Code가 응답을 만드는 동안 상태바에 Hacker News, GitHub Trending, AI 소식이 흘러갑니다. 대기 시간을 정보로 바꿉니다.",
    hero_cta_install: "플러그인 설치",
    hero_cta_how: "어떻게 작동하나요",
    how_title: "작동 방식",
    how_step1_title: "한 줄로 설치",
    how_step1_desc:
      "명령어 하나 실행. Claude Code에 자동 등록됩니다.",
    how_step2_title: "평소처럼 코딩",
    how_step2_desc:
      "프롬프트를 보낼 때마다 상태바에 새 뉴스가 뜹니다. 프롬프트나 코드는 수집하지 않습니다.",
    how_step3_title: "트렌드를 놓치지 않기",
    how_step3_desc:
      "HN 핫스토리, GitHub 트렌딩 레포, AI 릴리즈 — 실시간으로 큐레이션됩니다.",
    honest_title: "솔직하게 말하면",
    honest_p1:
      "AI 응답 기다리면서 30초씩 '생각 중...'만 보는 게 지겨워서 만들었습니다. 이제는 뭐라도 읽으면서 기다려요.",
    honest_p2:
      "무료, 오픈소스, 설치 5분. 싫으면 언제든 제거하세요.",
    footer_cta_title: "설치해보기",
    footer_cta_desc: "Claude Code 필수. 명령어 하나면 끝.",
    footer_dashboard: "대시보드",
    footer_privacy: "개인정보 처리방침",
    footer_terms: "이용약관",
    footer_contact: "문의",
    copy_aria: "복사",
    // Terminal animation
    terminal_thinking: "  생각 중...",
    terminal_ad_label: "  [feed] HackerNews",
    terminal_ad_body: "  Rust 2.0 컴파일러, GCC보다 10배 빨라",
    terminal_ad_url: "  ▲ 847  💬 234",
    terminal_ad_label_end: "  news.ycombinator.com/item?id=...",
    terminal_earned: "  [feed] GitHub Trending",
    terminal_done: "  완료. 파일 8개, 247줄 변경.",
    // Ad page
    ad_earning_header: "광고를 시청하며 수익을 쌓고 있습니다",
    ad_tip_label: "tip",
    ad_trending_title: "인기 개발 도구 & 레포",
    ad_news_title: "개발자 뉴스",
    ad_quiz_title: "미니 코딩 퀴즈",
    ad_footer: "에이전트 응답이 완료되면 이 페이지는 자동으로 닫힙니다",
    ad_score_suffix: "정답",
    ad_quiz_next: "다음 문제 →",
    ad_quiz_correct: "✓ 정답!",
    ad_quiz_wrong: "✗ 오답",
    ad_tip_aria: "팁",
    // Dashboard
    dash_connected: "연결됨",
    dash_not_connected: "미연결",
    dash_refresh_title: "새로고침",
    dash_api_key_label: "API Key",
    dash_api_key_placeholder: "플러그인 설치 시 발급된 API Key를 입력하세요",
    dash_lookup: "조회",
    dash_total_earnings: "총 수익",
    dash_payout_progress: "출금 최소 금액까지",
    dash_today: "오늘 수익",
    dash_pending: "출금 대기",
    dash_total_sessions: "총 세션",
    dash_sessions_unit: "세션",
    dash_chart_title: "최근 7일 수익",
    dash_chart_empty: "최근 7일간 수익 데이터가 없습니다",
    dash_recent_sessions: "최근 세션",
    dash_no_sessions: "아직 세션이 없습니다",
    dash_referral_title: "추천인 링크",
    dash_referral_desc_pre: "친구를 초대하면 그 친구의 수익의 ",
    dash_referral_desc_pct: "10%",
    dash_referral_desc_post: "를 영구적으로 받습니다.",
    dash_referral_bonus: "추천 보너스",
    dash_copy: "복사",
    dash_copied: "복사됨",
    dash_payout_title: "출금",
    dash_min_payout: "최소 출금액:",
    dash_payout_request: "출금 신청",
    dash_payout_short: "부족",
    dash_payout_processing: "처리 중...",
    dash_settings_title: "설정",
    dash_ads_monetization: "광고 수익화",
    dash_ads_enabled: "활성화됨",
    dash_ads_disabled: "비활성화됨",
    dash_ads_toggle_on: "광고 비활성화",
    dash_ads_toggle_off: "광고 활성화",
    dash_reset_key: "API Key 초기화",
    dash_disconnect: "연결 해제",
    dash_reset_btn: "초기화",
    // relativeTime
    time_seconds_ago: "초 전",
    time_minutes_ago: "분 전",
    time_hours_ago: "시간 전",
    time_days_ago: "일 전",
    // Tips - Claude Code
    tip_cc_1: "/compact 명령으로 컨텍스트를 압축하면 긴 세션에서도 토큰을 절약할 수 있습니다.",
    tip_cc_2: "CLAUDE.md 파일에 프로젝트 규칙을 작성하면 에이전트가 자동으로 참고합니다.",
    tip_cc_3: "Shift+Tab으로 여러 줄을 입력하면 복잡한 명령도 한 번에 전달할 수 있습니다.",
    tip_cc_4: "/cost 명령으로 현재 세션의 토큰 사용량과 비용을 실시간으로 확인하세요.",
    tip_cc_5: "MCP 서버를 연결하면 데이터베이스, Slack, GitHub 등 외부 도구와 연동됩니다.",
    tip_cc_6: "Hook 설정으로 PreToolUse, PostToolUse 이벤트에 자동 명령을 실행할 수 있습니다.",
    tip_cc_7: "Git worktree를 활용하면 여러 브랜치를 동시에 서로 다른 디렉토리에서 작업할 수 있습니다.",
    tip_cc_8: "Plan 모드를 사용하면 에이전트가 실행 전에 계획을 수립하고 검토를 기다립니다.",
    tip_cc_9: "/clear 명령으로 대화 히스토리를 초기화하면 새로운 컨텍스트로 시작할 수 있습니다.",
    tip_cc_10: "AGENTS.md 파일로 서브에이전트별 역할과 권한을 세밀하게 제어할 수 있습니다.",
    // Tips - GitHub Copilot
    tip_gh_1: "Tab 키로 Copilot 제안을 수락하고, Alt+] / Alt+[ 로 다음·이전 제안을 탐색하세요.",
    tip_gh_2: "주석으로 의도를 명확히 작성하면 Copilot이 훨씬 정확한 코드를 제안합니다.",
    tip_gh_3: "Copilot Chat에서 /explain, /fix, /tests 슬래시 명령을 사용하면 빠른 작업이 가능합니다.",
    tip_gh_4: "여러 파일을 열어두면 Copilot이 프로젝트 문맥을 더 잘 이해하여 제안의 질이 올라갑니다.",
    tip_gh_5: "Copilot Workspace로 이슈에서 PR까지 전체 개발 플로우를 자동화할 수 있습니다.",
    // Tips - AI General
    tip_ai_1: "AI에게 코드를 요청할 때 입출력 예시를 함께 제공하면 정확도가 크게 높아집니다.",
    tip_ai_2: "생성된 코드를 그대로 쓰지 말고, 항상 로직을 이해하고 테스트를 작성하세요.",
    tip_ai_3: "AI에게 '왜 이 방법을 선택했나요?'를 물으면 대안과 트레이드오프를 파악할 수 있습니다.",
    tip_ai_4: "에러 메시지 전체를 복사해서 붙여넣으면 AI가 스택 트레이스를 분석해 원인을 찾습니다.",
    tip_ai_5: "리팩토링 요청 시 '변경 범위를 최소화하고 기존 패턴을 유지해줘'라고 명시하면 좋습니다.",
    tip_ai_6: "복잡한 기능은 한 번에 요청하지 말고 작은 단계로 나눠 대화하며 구현하세요.",
    tip_ai_7: "AI가 생성한 SQL 쿼리는 실행 계획(EXPLAIN)으로 성능을 반드시 확인하세요.",
    // Trending repos descriptions
    repo_claude_code_desc: "터미널에서 직접 Claude AI와 페어 프로그래밍할 수 있는 공식 CLI 도구",
    repo_vscode_desc: "가장 인기 있는 오픈소스 코드 에디터. Copilot, 확장성, 멀티 플랫폼 지원",
    repo_continue_desc: "VS Code / JetBrains용 오픈소스 AI 코딩 어시스턴트. 로컬 모델 연동 가능",
    repo_ollama_desc: "로컬에서 Llama 3, Mistral, Gemma 등 LLM을 손쉽게 실행하는 툴",
    repo_cline_desc: "VS Code에서 AI가 파일을 직접 수정·실행하는 자율 코딩 에이전트 확장",
    repo_vercel_ai_desc: "React/Next.js에서 스트리밍 AI UI를 빠르게 구축하는 공식 AI SDK",
    // Dev news
    news_1_title: "Claude 4 Opus 출시 — 코딩 벤치마크에서 GPT-5 능가",
    news_1_time: "2시간 전",
    news_1_tag: "AI",
    news_2_title: "GitHub Copilot, 에이전트 모드 GA — 이슈에서 PR까지 자동화",
    news_2_time: "5시간 전",
    news_2_tag: "도구",
    news_3_title: "Next.js 16 정식 출시 — React 19 완전 지원·Turbopack 기본 설정",
    news_3_time: "1일 전",
    news_3_tag: "프레임워크",
    news_4_title: "Stack Overflow 설문: 개발자 76%가 AI 코딩 도구 매일 사용",
    news_4_time: "1일 전",
    news_4_tag: "업계",
    news_5_title: "Google DeepMind AlphaCode 3, IOI 금메달 수준 도달",
    news_5_time: "2일 전",
    news_5_tag: "AI",
    news_6_title: "Rust, JavaScript를 제치고 WebAssembly 생태계 1위 언어 등극",
    news_6_time: "3일 전",
    news_6_tag: "언어",
    // Quiz
    quiz_1_question: "`git rebase`는 무엇을 하는 명령어인가요?",
    quiz_1_opt_0: "새 브랜치를 만든다",
    quiz_1_opt_1: "커밋 히스토리를 다른 베이스 위로 재배치한다",
    quiz_1_opt_2: "원격 브랜치를 로컬로 복제한다",
    quiz_1_opt_3: "스테이징 영역을 초기화한다",
    quiz_1_explanation:
      "rebase는 현재 브랜치의 커밋들을 지정한 베이스 커밋 위에 순서대로 재적용합니다. merge와 달리 선형 히스토리를 유지합니다.",
    quiz_2_question: "다음 TypeScript 코드의 출력 결과는?",
    quiz_2_opt_0: "'no'",
    quiz_2_opt_1: "'yes'",
    quiz_2_opt_2: "TypeError",
    quiz_2_opt_3: "undefined",
    quiz_2_explanation:
      "string은 unknown의 서브타입이므로 조건부 타입 'string extends unknown'은 true가 되어 'yes'가 됩니다.",
    quiz_3_question: "HTTP 상태 코드 429의 의미는?",
    quiz_3_opt_0: "요청 형식 오류",
    quiz_3_opt_1: "인증 필요",
    quiz_3_opt_2: "요청 횟수 초과 (Rate Limit)",
    quiz_3_opt_3: "서버 내부 오류",
    quiz_3_explanation:
      "429 Too Many Requests — 클라이언트가 짧은 시간 내에 너무 많은 요청을 보냈을 때 서버가 반환합니다. AI API에서 자주 마주치는 코드입니다.",
    quiz_4_question: "React의 `useCallback` 훅의 주요 목적은?",
    quiz_4_opt_0: "비동기 함수를 동기로 변환",
    quiz_4_opt_1: "함수 참조를 메모이제이션하여 불필요한 리렌더 방지",
    quiz_4_opt_2: "전역 상태를 구독",
    quiz_4_opt_3: "컴포넌트 언마운트 시 정리 작업 실행",
    quiz_4_explanation:
      "useCallback은 의존성 배열이 변경될 때만 새 함수 참조를 생성합니다. 자식 컴포넌트에 함수를 props로 전달할 때 불필요한 리렌더를 막는 데 사용합니다.",
    quiz_5_question: "CSS `z-index`가 동작하려면 반드시 필요한 조건은?",
    quiz_5_opt_0: "display: flex 설정",
    quiz_5_opt_1: "position이 static이 아닌 값으로 설정",
    quiz_5_opt_2: "overflow: hidden 설정",
    quiz_5_opt_3: "width/height 명시",
    quiz_5_explanation:
      "z-index는 position 속성이 relative, absolute, fixed, sticky 중 하나일 때만 동작합니다. position: static(기본값)인 요소에는 z-index가 적용되지 않습니다.",
    // Tag translations for news (display)
    tag_tools: "도구",
    tag_framework: "프레임워크",
    tag_industry: "업계",
    tag_languages: "언어",
  },
} as const;

export type TranslationKey = keyof typeof dict.en;

// ─── Context ──────────────────────────────────────────────────────────────────

import React from "react";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

const STORAGE_KEY = "claudenews-locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === "en" || saved === "ko") {
      setLocaleState(saved);
    }
  }, []);

  function setLocale(l: Locale) {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  function t(key: TranslationKey): string {
    return dict[locale][key] as string;
  }

  return createElement(LocaleContext.Provider, { value: { locale, setLocale, t } }, children);
}

export function useT() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used within LocaleProvider");
  return ctx;
}
