#!/usr/bin/env python3
"""Helpers for lightweight background Claude CLI calls."""

from __future__ import annotations

import json
import os
import re
import subprocess
from typing import Any

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)")


def sanitize_model_output(text: str) -> str:
    """Strip ANSI escape sequences and control chars from model output
    before it is cached or rendered. Untrusted web content flows into the
    background prompt, so a crafted article could try to emit terminal
    escape sequences through the summary/translation into the status line."""
    if not text:
        return ""
    text = _ANSI_RE.sub("", text)
    text = re.sub(r"[\x00-\x1f\x7f]", " ", text)
    return re.sub(r"\s+", " ", text).strip()

CONFIG_DIR = os.path.expanduser("~/.claudenews")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
CLAUDE_SETTINGS_FILE = os.path.expanduser("~/.claude/settings.json")
HOOK_LOG_FILE = os.path.join(CONFIG_DIR, "hook.log")
BACKGROUND_CHILD_ENV = "CODE_EARN_BACKGROUND_CHILD"
DEFAULT_BACKGROUND_MODEL = "haiku"
FALLBACK_PLUGIN_IDS = (
    "claudenews@claudenews",
    "oh-my-claudecode@omc",
)


def load_json_file(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


def resolve_background_model(task_name: str, config: dict[str, Any] | None = None) -> str:
    if config is None:
        config = load_json_file(CONFIG_FILE)

    env_model = os.environ.get(f"CODE_EARN_{task_name.upper()}_MODEL")
    if env_model:
        return env_model

    shared_env_model = os.environ.get("CODE_EARN_BACKGROUND_MODEL")
    if shared_env_model:
        return shared_env_model

    if config:
        model = config.get(f"{task_name}Model") or config.get("backgroundModel")
        if isinstance(model, str) and model.strip():
            return model.strip()

    return DEFAULT_BACKGROUND_MODEL


def build_plugin_disable_overrides(
    settings_path: str = CLAUDE_SETTINGS_FILE,
) -> dict[str, dict[str, bool]]:
    settings = load_json_file(settings_path)
    enabled_plugins = settings.get("enabledPlugins")

    overrides: dict[str, bool] = {}
    if isinstance(enabled_plugins, dict):
        for plugin_id, enabled in enabled_plugins.items():
            if enabled:
                overrides[plugin_id] = False

    for plugin_id in FALLBACK_PLUGIN_IDS:
        overrides.setdefault(plugin_id, False)

    return {"enabledPlugins": overrides}


def build_background_env() -> dict[str, str]:
    env = os.environ.copy()
    env[BACKGROUND_CHILD_ENV] = "1"
    # Force UTF-8 in child Python processes (translator/summarizer) and signal
    # UTF-8 to Claude. Windows defaults to a legacy code page (e.g. cp949),
    # which corrupts non-ASCII news titles/translations in file I/O and pipes.
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def build_claude_command(
    prompt: str,
    *,
    task_name: str,
    config: dict[str, Any] | None = None,
    settings_path: str = CLAUDE_SETTINGS_FILE,
) -> list[str]:
    model = resolve_background_model(task_name, config=config)
    command = [
        "claude",
        "--print",
        "--model",
        model,
        "--tools",
        "",
        "--disable-slash-commands",
        "--no-session-persistence",
    ]

    overrides = build_plugin_disable_overrides(settings_path=settings_path)
    if overrides.get("enabledPlugins"):
        command.extend(
            ["--settings", json.dumps(overrides, ensure_ascii=False, separators=(",", ":"))]
        )

    command.append(prompt)
    return command


def run_background_prompt(
    prompt: str,
    *,
    task_name: str,
    timeout: int,
    config: dict[str, Any] | None = None,
) -> subprocess.CompletedProcess[str]:
    os.makedirs(CONFIG_DIR, exist_ok=True)
    return subprocess.run(
        build_claude_command(prompt, task_name=task_name, config=config),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        cwd=CONFIG_DIR,
        env=build_background_env(),
    )


_AUTH_ERROR_MARKERS = (
    "not logged in",
    "please run /login",
    "invalid api key",
    "authentication failed",
    "session expired",
    "rate limit",
    "context limit",
)


def atomic_write_json(path: str, data: Any) -> None:
    """Write JSON to path atomically so concurrent readers never see a
    half-written or empty file. Important: show-news, translator, and
    summarizer all rewrite ~/.claudenews/.current-news, and the statusline
    HUD reads it on every render. Truncate-then-write would briefly expose
    an empty file."""
    tmp = f"{path}.tmp.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)


def looks_like_error_output(text: str) -> bool:
    """Detect Claude CLI status/error messages that should NOT be cached as
    real model output (auth errors, rate limits, etc.)."""
    if not text:
        return True
    lowered = text.lower()
    return any(marker in lowered for marker in _AUTH_ERROR_MARKERS)


def summarize_process_error(result: subprocess.CompletedProcess[str]) -> str:
    message = (result.stderr or result.stdout or "").strip()
    if message:
        message = message.splitlines()[0].strip()
        return f"exit {result.returncode}: {message[:200]}"
    return f"exit {result.returncode}"


def log_background_event(message: str) -> None:
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(HOOK_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{task_name_timestamp()}] {message}\n")
    except Exception:
        pass


def task_name_timestamp() -> str:
    import time

    return time.strftime("%H:%M:%S")
