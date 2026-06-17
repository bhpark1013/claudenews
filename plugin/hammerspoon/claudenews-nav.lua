-- claudenews key navigation (managed by /claudenews:nav).
--
-- Captures ctrl+shift+←/→ and, ONLY when a supported terminal is frontmost,
-- steps the (global) news prev/next instead of letting the key reach the app.
-- Anywhere else the key passes through untouched.
--
-- Why ctrl+SHIFT+arrow (not ctrl+arrow): ctrl+arrow is bound to word-jump in
-- shells (readline/zle), so capturing it would require an expensive ~90ms
-- AppleScript probe per press to confirm Claude Code (vs a shell) is focused
-- before swallowing. ctrl+shift+arrow is unused in terminal line-editing, so we
-- can swallow it on a cheap frontmost-bundle-id check alone — no IPC, instant.
-- Outside a terminal (browser/editor/IDE) ctrl+shift+arrow selects text, so we
-- gate on "a supported terminal is frontmost" and pass it through everywhere else.
--
-- The activation command appends a `dofile(...)` of this file to
-- ~/.hammerspoon/init.lua. Requires Hammerspoon + Accessibility permission.

-- Stable nav launcher installed by `/claudenews:nav on`.
local NAV = os.getenv("HOME") .. "/.claude/hud/claudenews-nav"
local SHELL = os.getenv("SHELL") or "/bin/zsh"

-- Keycodes: 123 = Left, 124 = Right.
local LEFT, RIGHT = 123, 124

-- Minimum gap between two nav steps. A held key (autorepeat) never steps more
-- than once per press anyway (see below); this only rate-limits rapid distinct
-- presses so mashing the key can't spawn a burst of launcher processes.
local DEBOUNCE_S = 0.15

-- Supported terminals: frontmost bundle id -> captured. Inside any of these,
-- ctrl+shift+arrow is unused by the shell, so swallowing it breaks nothing.
local TERMS = {
  ["com.googlecode.iterm2"]  = true,
  ["com.apple.Terminal"]     = true,
  ["com.github.wez.wezterm"] = true,
  ["net.kovidgoyal.kitty"]   = true,
}

local lastNavAt = 0

-- Store the tap in a GLOBAL: a local in a dofile'd chunk gets garbage-collected
-- right after load and the eventtap silently stops firing. A global reference
-- keeps it alive for the session.
if _G.__claudenewsNavTap then _G.__claudenewsNavTap:stop() end
__claudenewsNavTap = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(e)
  local kc = e:getKeyCode()
  if kc ~= LEFT and kc ~= RIGHT then return false end
  local f = e:getFlags()
  -- Require ctrl+shift together, and NOT cmd/alt; tolerate fn/numericpad (arrows
  -- always carry the fn flag on macOS).
  if not (f.ctrl and f.shift and not (f.cmd or f.alt)) then return false end

  -- Gate: a supported terminal must be frontmost. This is an instant in-process
  -- bundle-id lookup — no AppleScript/ps/tty probe. Outside a terminal the key
  -- passes through so ctrl+shift+arrow still selects text in other apps.
  local app = hs.application.frontmostApplication()
  if not (app and TERMS[app:bundleID()]) then
    return false
  end

  -- Capture it. Step the news once per physical press (autorepeat suppressed),
  -- rate-limited so rapid presses can't spawn a flood of launcher processes.
  local isRepeat = e:getProperty(hs.eventtap.event.properties.keyboardEventAutorepeat) == 1
  if not isRepeat then
    local now = hs.timer.secondsSinceEpoch()
    if now - lastNavAt >= DEBOUNCE_S then
      lastNavAt = now
      -- Login shell so the launcher's python3 resolves on the user's PATH
      -- (hs.task otherwise has a minimal PATH).
      hs.task.new(SHELL, nil, { "-l", "-c", NAV .. " " .. (kc == RIGHT and "next" or "prev") }):start()
    end
  end
  return true -- swallow: ctrl+shift+arrow never reaches the app
end)
__claudenewsNavTap:start()

return __claudenewsNavTap
