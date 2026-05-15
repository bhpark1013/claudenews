#!/bin/bash
# Launch the claudenews news viewer.
# Preference order:
#   1. tmux split (if inside tmux)
#   2. Native terminal split (WezTerm / Kitty / iTerm2)
#   3. New macOS Terminal window
#   4. Print run instructions

set -e

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
VIEWER="$PLUGIN_ROOT/commands/viewer.py"

if [ ! -f "$VIEWER" ]; then
  echo "  Error: viewer script not found at $VIEWER"
  exit 1
fi

# 1. tmux split
if [ -n "$TMUX" ]; then
  tmux split-window -h -p 35 "python3 $VIEWER"
  tmux select-pane -L
  echo "  Opened news viewer in a tmux split (Ctrl+b → arrow to focus, Ctrl+b x to close)"
  exit 0
fi

# 2a. cmux split (cmux is a Ghostty-based terminal with rich CLI)
if [ -n "$CMUX_SOCKET" ] && command -v cmux >/dev/null 2>&1; then
  split_out=$(cmux new-split right 2>&1) || split_out=""
  surface_ref=$(echo "$split_out" | grep -oE 'surface:[0-9]+' | head -1)
  if [ -n "$surface_ref" ]; then
    cmux send --surface "$surface_ref" "python3 '$VIEWER'
" >/dev/null 2>&1
    echo "  Opened news viewer in a cmux split pane"
    exit 0
  fi
fi

# 2b. WezTerm vertical split
if [ -n "$WEZTERM_PANE" ] && command -v wezterm >/dev/null 2>&1; then
  wezterm cli split-pane --right --percent 35 -- python3 "$VIEWER" >/dev/null
  echo "  Opened news viewer in a WezTerm split pane"
  exit 0
fi

# 2b. Kitty vertical split (requires allow_remote_control in kitty.conf)
if [ -n "$KITTY_WINDOW_ID" ] && command -v kitty >/dev/null 2>&1; then
  if kitty @ launch --type=window --location=vsplit --no-response --keep-focus python3 "$VIEWER" >/dev/null 2>&1; then
    echo "  Opened news viewer in a Kitty split window"
    exit 0
  fi
fi

# 2c. iTerm2 vertical split
if [ "$TERM_PROGRAM" = "iTerm.app" ]; then
  osascript <<EOF >/dev/null
tell application "iTerm"
  tell current session of current window
    set newSession to (split vertically with default profile)
    tell newSession
      write text "python3 '$VIEWER'"
    end tell
  end tell
end tell
EOF
  echo "  Opened news viewer in an iTerm2 vertical split"
  exit 0
fi

# 3. macOS Terminal — new window (no native split scriptability)
if [[ "$OSTYPE" == "darwin"* ]]; then
  osascript <<EOF >/dev/null
tell application "Terminal"
  do script "python3 '$VIEWER'"
  activate
end tell
EOF
  echo "  Opened news viewer in a new Terminal window"
  exit 0
fi

# 4. Fallback
echo "  No supported terminal split detected. Run the viewer manually:"
echo "    python3 $VIEWER"
