// iOS Location Spoofer · Scriptable v2.5

const VERSION = "2.5";
const CONFIG = {
  amapKey: "在此填入高德Web服务Key",
  hAcc: 10,
  vAcc: 20,
};

const PRESETS_CN = ["上海外滩", "北京天安门", "广州塔", "深圳", "香港", "台北"];
const PRESETS_EN = [
  { name: "Los Angeles", lat: 34.052235, lng: -118.243683, elevation: 71, sourceLabel: "预设" },
  { name: "New York", lat: 40.712776, lng: -74.005974, elevation: 10, sourceLabel: "预设" },
  { name: "London", lat: 51.507351, lng: -0.127758, elevation: 11, sourceLabel: "预设" },
  { name: "Paris", lat: 48.856613, lng: 2.352222, elevation: 35, sourceLabel: "预设" },
  { name: "Tokyo Tower", lat: 35.658581, lng: 139.745438, elevation: 52, sourceLabel: "预设" },
  { name: "Hawaii (Honolulu)", lat: 21.306944, lng: -157.858337, elevation: 6, sourceLabel: "预设" },
  { name: "Staples Center, LA", lat: 34.043017, lng: -118.267254, elevation: 92, sourceLabel: "预设" },
];

const BUILTIN_ALIASES = {};
(function initAliases() {
  const add = (keys, preset) => keys.forEach((k) => { BUILTIN_ALIASES[k.trim().toLowerCase()] = preset; });
  PRESETS_EN.forEach((p) => add([p.name], p));
  add(["staples center", "staples center, los angeles", "crypto.com arena", "洛杉矶斯台普斯"], PRESETS_EN[6]);
  add(["hawaii", "honolulu", "夏威夷"], PRESETS_EN[5]);
  add(["la", "los angeles, ca"], PRESETS_EN[0]);
  add(["nyc", "new york city"], PRESETS_EN[1]);
})();

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

async function main() {
  if (!CONFIG.amapKey || CONFIG.amapKey.includes("在此填入")) {
    showPage(errorHtml("未配置高德 Key", "请编辑脚本顶部 CONFIG.amapKey"));
    return;
  }

  try {
    const place = await askPlace();
    if (!place) return;

    const placeName = typeof place === "string" ? place : place.name;
    ping("正在查询", placeName);

    const cands = await resolvePlace(place);
    const chosen = await pickCandidate(cands);

    let elev = chosen.elevation;
    let elevWarn = false;
    if (elev == null) elev = await fetchElevation(chosen.lat, chosen.lng);
    if (elev == null) {
      elev = 0;
      elevWarn = true;
    }

    const altitude = Math.round(elev);
    const argument = buildArgument(chosen.lat, chosen.lng, altitude);
    saveArgument(argument);
    Pasteboard.copyString(argument);
    if (typeof Script !== "undefined" && Script.setShortcutOutput) {
      Script.setShortcutOutput(argument);
    }

    ping("定位已生成", chosen.name);
    showPage(resultHtml(chosen, argument, altitude, elevWarn));
  } catch (e) {
    const msg = String((e && e.message) || e || "未知错误").trim() || "未知错误";
    ping("查询失败", msg.slice(0, 80));
    showPage(errorHtml("查询失败", msg));
  }
}

function locDir() {
  const fm = FileManager.iCloud();
  const dir = fm.joinPath(fm.documentsDirectory(), "location-spoofer");
  fm.createDirectory(dir, true);
  return dir;
}

function writeLocFile(name, text) {
  const path = FileManager.iCloud().joinPath(locDir(), name);
  FileManager.iCloud().writeString(path, text);
  return path;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pageShell(title, body) {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0b0f;color:#f2f2f7;padding:20px 16px 32px;line-height:1.5}
.wrap{max-width:480px;margin:0 auto}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:12px}
.ok{background:rgba(52,199,89,.18);color:#34c759}
.err{background:rgba(255,69,58,.18);color:#ff453a}
h1{font-size:22px;font-weight:700;margin-bottom:6px;word-break:break-word}
.sub{font-size:14px;color:#8e8e93;margin-bottom:18px}
.card{background:#1c1c1e;border-radius:14px;padding:14px 16px;margin-bottom:12px}
.card h2{font-size:12px;color:#8e8e93;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.item label{display:block;font-size:11px;color:#8e8e93;margin-bottom:2px}
.item span{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.full{grid-column:1/-1}
.code{font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.55;word-break:break-all;color:#e5e5ea;background:#111114;border-radius:10px;padding:12px}
.tag{display:inline-block;font-size:11px;color:#34c759;background:rgba(52,199,89,.12);padding:2px 8px;border-radius:6px;margin-bottom:8px}
.warn{font-size:12px;color:#ff9f0a;margin-top:6px}
.steps{counter-reset:step}
.steps li{list-style:none;position:relative;padding-left:28px;margin-bottom:10px;font-size:14px;color:#d1d1d6}
.steps li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:#2c2c2e;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.map{margin-top:10px;border-radius:12px;overflow:hidden;border:1px solid #2c2c2e}
.map img{display:block;width:100%;height:auto}
.foot{margin-top:16px;text-align:center;font-size:11px;color:#636366}
</style></head><body><div class="wrap">${body}<p class="foot">iOS Location Spoofer v${VERSION}</p></div></body></html>`;
}

function resultHtml(chosen, argument, altitude, elevWarn) {
  const lat = chosen.lat.toFixed(6);
  const lng = chosen.lng.toFixed(6);
  const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=13&size=600x220&markers=${lat},${lng},red`;
  const body = `
<span class="badge ok">定位已生成</span>
<h1>${esc(chosen.name)}</h1>
<p class="sub">argument 已复制到剪贴板</p>
<div class="card">
  <h2>坐标信息</h2>
  <div class="grid">
    <div class="item"><label>纬度</label><span>${lat}</span></div>
    <div class="item"><label>经度</label><span>${lng}</span></div>
    <div class="item"><label>海拔</label><span>${altitude} m</span></div>
    <div class="item"><label>来源</label><span>${esc(chosen.sourceLabel)}</span></div>
  </div>
  ${elevWarn ? '<p class="warn">海拔查询失败，已使用 0</p>' : ""}
  <div class="map"><img src="${mapUrl}" alt="map"></div>
</div>
<div class="card">
  <h2>Shadowrocket 参数</h2>
  <span class="tag">已复制</span>
  <div class="code">${esc(argument)}</div>
</div>
<div class="card">
  <h2>下一步</h2>
  <ol class="steps">
    <li>Shadowrocket → 配置 → 模块</li>
    <li>替换 <code>argument=</code> 整行并保存</li>
    <li>设置 → 隐私 → 定位服务 关开一次</li>
  </ol>
</div>`;
  return pageShell("result", body);
}

function errorHtml(title, message) {
  const body = `
<span class="badge err">${esc(title)}</span>
<h1>${esc(title)}</h1>
<div class="card full"><div class="code">${esc(message)}</div></div>`;
  return pageShell("error", body);
}

function showPage(html) {
  const wv = new WebView();
  wv.loadHTML(html);
  wv.present();
}

function showFile(path) {
  QuickLook.present(path);
}

function ping(title, body) {
  try {
    const n = new Notification();
    n.title = title;
    n.body = body;
    n.schedule();
  } catch (e) { /* ignore */ }
}

function saveArgument(argument) {
  writeLocFile("argument.txt", argument);
}

async function shortAlert(title, message, actions) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  actions.forEach((name) => a.addAction(name));
  return await a.present();
}

async function askFromClipboard() {
  const t = (Pasteboard.paste() || "").trim();
  if (!t) {
    showPage(errorHtml("剪贴板为空", "请先复制地名再运行"));
    return null;
  }
  const preview = t.length > 40 ? t.slice(0, 40) + "…" : t;
  const idx = await shortAlert("确认查询", preview, ["开始查询"]);
  return idx === 0 ? t : null;
}

async function pickFromList(title, list) {
  const a = new Alert();
  a.title = title;
  a.message = "点选查询";
  list.forEach((item) => a.addAction(typeof item === "string" ? item : item.name));
  a.addCancelAction("取消");
  const idx = await a.present();
  if (idx === -1) return null;
  return list[idx] || null;
}

async function pickPresetCity() {
  const idx = await shortAlert("常用城市", "选国内或国外", ["国内", "国外"]);
  if (idx === 0) return await pickFromList("国内城市", PRESETS_CN);
  if (idx === 1) return await pickFromList("国外城市", PRESETS_EN);
  return null;
}

async function askPlace() {
  if (args.shortcutParameter) {
    const t = String(args.shortcutParameter).trim();
    if (t) return t;
  }
  const a = new Alert();
  a.title = "iOS定位 v" + VERSION;
  a.message = "剪贴板 / 常用城市";
  a.addAction("从剪贴板读取");
  a.addAction("常用城市");
  a.addCancelAction("取消");
  const idx = await a.present();
  if (idx === 0) return await askFromClipboard();
  if (idx === 1) return await pickPresetCity();
  return null;
}

function outOfChina(lat, lng) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function tLat(x, y) {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  r += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return r;
}

function tLng(x, y) {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  r += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  r += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return r;
}

function wgs2gcj(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let m = Math.sin(radLat);
  m = 1 - EE * m * m;
  const sm = Math.sqrt(m);
  dLat = dLat * 180 / ((A * (1 - EE)) / (m * sm) * PI);
  dLng = dLng * 180 / (A / sm * Math.cos(radLat) * PI);
  return [lat + dLat, lng + dLng];
}

function gcj2wgs(lat, lng) {
  if (outOfChina(lat, lng)) return [lat, lng];
  let wlat = lat, wlng = lng;
  for (let i = 0; i < 3; i++) {
    const g = wgs2gcj(wlat, wlng);
    wlat += lat - g[0];
    wlng += lng - g[1];
  }
  return [wlat, wlng];
}

async function httpJson(url, headers) {
  const req = new Request(url);
  req.timeoutInterval = 10;
  if (headers) req.headers = headers;
  return await req.loadJSON();
}

async function geocodeAmap(query) {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${CONFIG.amapKey}&address=${encodeURIComponent(query)}&output=json`;
  const data = await httpJson(url);
  if (data.status !== "1") throw new Error(data.info || "高德失败");
  const out = [];
  for (const item of data.geocodes || []) {
    const loc = item.location || "";
    if (!loc.includes(",")) continue;
    const [lngS, latS] = loc.split(",");
    const wgs = gcj2wgs(parseFloat(latS), parseFloat(lngS));
    out.push({
      name: item.formatted_address || query,
      lat: wgs[0],
      lng: wgs[1],
      sourceLabel: "高德",
      elevation: null,
    });
  }
  return out;
}

async function geocodeOpenMeteo(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=zh`;
  const data = await httpJson(url);
  const out = [];
  for (const item of data.results || []) {
    const name = [item.name, item.admin1, item.country].filter(Boolean).join(", ");
    out.push({
      name,
      lat: item.latitude,
      lng: item.longitude,
      sourceLabel: "Open-Meteo",
      elevation: item.elevation != null ? item.elevation : null,
    });
  }
  return out;
}

async function geocodeNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&accept-language=zh`;
  const data = await httpJson(url, { "User-Agent": "ios-location-spoofer-scriptable/1.0" });
  return (data || []).map((item) => ({
    name: item.display_name || query,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    sourceLabel: "Nominatim",
    elevation: null,
  }));
}

function lookupBuiltin(query) {
  return BUILTIN_ALIASES[String(query || "").trim().toLowerCase()] || null;
}

async function resolvePlace(place) {
  if (place && typeof place === "object" && place.lat != null) return [place];
  const builtin = lookupBuiltin(place);
  if (builtin) return [builtin];
  return await resolveCandidates(place);
}

function isLikelyInternational(query) {
  const q = String(query || "").trim();
  if (/[a-zA-Z]/.test(q)) return true;
  return !/(北京|上海|广州|深圳|香港|台北|澳门|中国|省|市|区|县|路|街|镇|村|外滩|天安门|塔)/.test(q);
}

async function resolveCandidates(query) {
  const errors = [];
  const intl = isLikelyInternational(query);
  const chain = intl
    ? [() => geocodeOpenMeteo(query), () => geocodeNominatim(query), () => geocodeAmap(query)]
    : [() => geocodeAmap(query), () => geocodeOpenMeteo(query), () => geocodeNominatim(query)];
  for (const fn of chain) {
    try {
      const cands = await fn();
      if (cands.length) return cands;
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  throw new Error(`找不到: ${query}\n${errors.join("\n")}`);
}

async function pickCandidate(cands) {
  if (cands.length === 1) return cands[0];
  const a = new Alert();
  a.title = "选择地点";
  a.message = `共 ${cands.length} 个候选`;
  cands.forEach((c, i) => {
    const short = c.name.length > 24 ? c.name.slice(0, 24) + "…" : c.name;
    a.addAction(`${i + 1}.${short}`);
  });
  a.addCancelAction("取消");
  const idx = await a.present();
  if (idx === -1) throw new Error("已取消");
  const chosen = cands[idx];
  if (!chosen) throw new Error("选择无效");
  return chosen;
}

async function fetchElevation(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
    const data = await httpJson(url);
    const vals = data.elevation || [];
    if (vals.length && vals[0] != null) return vals[0];
  } catch (e) { /* ignore */ }
  return null;
}

function buildArgument(lat, lng, altitude) {
  return `mode=response&latitude=${lat.toFixed(6)}&longitude=${lng.toFixed(6)}&horizontalAccuracy=${CONFIG.hAcc}&verticalAccuracy=${CONFIG.vAcc}&altitude=${altitude}&debug=false`;
}

await main();
