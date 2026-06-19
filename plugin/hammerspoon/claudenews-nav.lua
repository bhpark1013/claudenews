-- claudenews key navigation (managed by /claudenews:nav).
--
-- Captures the nav key combo and, ONLY when a supported terminal is frontmost,
-- steps the (global) news prev/next instead of letting the key reach the app.
-- Anywhere else the key passes through untouched.
--
-- Default combo is ctrl+SHIFT+arrow (not ctrl+arrow): ctrl+arrow is bound to
-- word-jump in shells (readline/zle), so capturing it would require an expensive
-- ~90ms AppleScript probe per press to confirm Claude Code (vs a shell) is
-- focused before swallowing. ctrl+shift+arrow is unused in terminal line-editing,
-- so we can swallow it on a cheap frontmost-bundle-id check alone — no IPC,
-- instant. Outside a terminal (browser/editor/IDE) ctrl+shift+arrow selects text,
-- so we gate on "a supported terminal is frontmost" and pass it through elsewhere.
--
-- The combo is overridable via ~/.claudenews/config.json (see loadNavKeys below).
-- Picking a combo the shell DOES use (e.g. cmd/alt+arrow) means losing that
-- shortcut inside the terminal — keep to a shell-unused combo (ctrl+shift+…).
--
-- The activation command appends a `dofile(...)` of this file to
-- ~/.hammerspoon/init.lua. Requires Hammerspoon + Accessibility permission.

-- Stable nav launcher installed by `/claudenews:nav on`.
local NAV = os.getenv("HOME") .. "/.claude/hud/claudenews-nav"
local SHELL = os.getenv("SHELL") or "/bin/zsh"

-- Key binding — overridable via ~/.claudenews/config.json:
--   "navKeys": { "modifiers": ["ctrl", "shift"], "prev": "left", "next": "right" }
-- modifiers: any of ctrl/shift/cmd/alt (held together; all others must be up).
-- prev/next: any hs.keycodes.map name ("left","right","[","]","j", …).
-- Read once at load; rerun /claudenews:nav on (restarts Hammerspoon) to apply.
local function loadNavKeys()
  local d = {
    mods = { ctrl = true, shift = true, cmd = false, alt = false },
    prev = "left",
    next = "right",
  }
  local ok, cfg = pcall(hs.json.read, os.getenv("HOME") .. "/.claudenews/config.json")
  if not ok or type(cfg) ~= "table" or type(cfg.navKeys) ~= "table" then return d end
  local nk = cfg.navKeys
  local mods = { ctrl = false, shift = false, cmd = false, alt = false }
  local any = false
  if type(nk.modifiers) == "table" then
    for _, m in ipairs(nk.modifiers) do
      m = tostring(m):lower()
      if m == "ctrl" or m == "control" then mods.ctrl = true; any = true
      elseif m == "shift" then mods.shift = true; any = true
      elseif m == "cmd" or m == "command" then mods.cmd = true; any = true
      elseif m == "alt" or m == "option" or m == "opt" then mods.alt = true; any = true end
    end
  end
  -- Empty / unrecognized modifiers would swallow BARE arrows — never do that;
  -- fall back to the safe default combo instead.
  if not any then mods = d.mods end
  local prev = (type(nk.prev) == "string" and nk.prev:lower()) or d.prev
  local nxt = (type(nk.next) == "string" and nk.next:lower()) or d.next
  return { mods = mods, prev = prev, next = nxt }
end

local NK = loadNavKeys()
local MODS = NK.mods
-- Keycodes: default 123 = Left, 124 = Right; resolved by name so any key works.
local PREV_KC = hs.keycodes.map[NK.prev] or 123
local NEXT_KC = hs.keycodes.map[NK.next] or 124

-- Minimum gap between two nav steps. A held key (autorepeat) never steps more
-- than once per press anyway (see below); this only rate-limits rapid distinct
-- presses so mashing the key can't spawn a burst of launcher processes.
local DEBOUNCE_S = 0.15

-- Supported terminals: frontmost bundle id -> captured. Inside any of these,
-- the (shell-unused) nav combo is free to swallow, so it breaks nothing.
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
  if kc ~= PREV_KC and kc ~= NEXT_KC then return false end
  local f = e:getFlags()
  -- Exact modifier match: every required modifier held, every other one up.
  -- (fn/numericpad ignored — arrows always carry the fn flag on macOS.) Matching
  -- only the configured set keeps the cheap frontmost-only gate valid.
  if (not not f.ctrl)  ~= MODS.ctrl  then return false end
  if (not not f.shift) ~= MODS.shift then return false end
  if (not not f.cmd)   ~= MODS.cmd   then return false end
  if (not not f.alt)   ~= MODS.alt   then return false end

  -- Gate: a supported terminal must be frontmost. This is an instant in-process
  -- bundle-id lookup — no AppleScript/ps/tty probe. Outside a terminal the key
  -- passes through so the combo still does its normal thing in other apps.
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
      hs.task.new(SHELL, nil, { "-l", "-c", NAV .. " " .. (kc == NEXT_KC and "next" or "prev") }):start()
    end
  end
  return true -- swallow: the nav combo never reaches the app
end)
__claudenewsNavTap:start()

return __claudenewsNavTap
