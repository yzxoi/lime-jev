-- GPL-3.0. Based on xushengfeng/lime's Rime translator.
local json = require("lime_jev_json")
local config = require("lime_jev_config")
local M = { translator = {}, processor = {} }
local function quote(s) return "'" .. tostring(s):gsub("'", "'\"'\"'") .. "'" end
local function request(path, body)
  body.session = "rime"
  local command = "curl --silent --connect-timeout 0.15 --max-time 1.5 --request POST --url " ..
    quote(config.url .. path) .. " --header " .. quote("Content-Type: application/json") ..
    " --header " .. quote("Authorization: Bearer " .. config.token) .. " --data " .. quote(json.encode(body)) .. " 2>/dev/null"
  local handle = io.popen(command)
  if not handle then return nil end
  local response = handle:read("*a")
  handle:close()
  local ok, result = pcall(json.decode, response)
  if ok and type(result) == "table" then return result end
  return nil
end
function M.translator.init(env)
  env.connection = env.engine.context.commit_notifier:connect(function(ctx)
    local text = ctx:get_commit_text()
    if text ~= "" then request("/commit", { text = text }) end
  end)
  env.option_connection = env.engine.context.option_update_notifier:connect(function(ctx, name)
    if name == "ascii_mode" then request("/reset", {}) end
  end)
end
function M.translator.fini(env)
  if env.connection then env.connection:disconnect() end
  if env.option_connection then env.option_connection:disconnect() end
end
function M.translator.func(input, seg, env)
  local preedit = env.engine.context:get_preedit().text
  local prefix = preedit:sub(1, math.max(0, #preedit - (seg._end - seg.start)))
  local result = request("/candidates", { keys = input, preedit = prefix })
  if not result or not result.candidates then return end
  for i, v in ipairs(result.candidates) do
    local comment = ""
    if i == 1 and result.ranking and result.ranking.applied then comment = "语境" end
    local c = Candidate("lime_jev", seg.start, seg.start + v.consumedkeys, v.word, comment)
    c.quality = 1000 - i
    c.preedit = v.preedit
    yield(c)
  end
end
function M.processor.func(key, env)
  local repr = key:repr()
  if repr == "Control+Shift+BackSpace" or repr == "Shift+Control+BackSpace" then
    request("/reset", {})
    return 1
  end
  -- These edits make a commit-only prefix unreliable. Reset conservatively.
  local composing = env.engine.context:is_composing()
  local base = repr:match("([^+]+)$")
  local edits = { BackSpace=true, Delete=true, Left=true, Right=true, Up=true, Down=true,
    Home=true, End=true, Return=true, Tab=true }
  if not composing and (edits[base] or repr:find("Super+", 1, true) or repr:find("Control+", 1, true)) then
    request("/reset", {})
  end
  return 2
end
return M
