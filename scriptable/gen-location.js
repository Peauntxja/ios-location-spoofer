// iOS Location Spoofer · Scriptable v2.2
// 结果/错误用 QuickLook 展示（长文本 Alert 在部分机型不显示）

const VERSION = "2.2";
const QUERY_TIMEOUT_MS = 30000;
const CONFIG = {
  amapKey: "在此填入高德Web服务Key",
  hAcc: 10,
  vAcc: 20,
};

const PRESETS_CN = ["上海外滩", "北京天安门", "广州塔", "深圳", "香港", "台北"];
const PRESETS_EN = [
  "Los Angeles", "New York", "London", "Paris",
  "Tokyo Tower", "Hawaii", "Staples Center, Los Angeles",
];

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

async function main() {
  if (!CONFIG.amapKey || CONFIG.amapKey.includes("在此填入")) {
    showFile(writeLocFile("error.txt", "未配置高德 Key\n请编辑脚本顶部 CONFIG.amapKey"));
    return;
  }

  try {
    const place = await askPlace();
    if (!place) return;

    ping("正在查询", place);

    const cands = await withTimeout(
      resolveCandidates(place),
      QUERY_TIMEOUT_MS,
      `查询超时: ${place}`
    );
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
    showFile(showResult(chosen, argument, altitude, elevWarn));
  } catch (e) {
    const msg = String((e && e.message) || e || "未知错误").trim() || "未知错误";
    ping("查询失败", msg.slice(0, 80));
    showFile(writeLocFile("error.txt", "查询失败\n\n" + msg));
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

function showFile(path) {
  QuickLook.present(path);
}

function showResult(chosen, argument, altitude, elevWarn) {
  const lines = [
    "=== 定位已生成 ===",
    "",
    `地点: ${chosen.name}`,
    `来源: ${chosen.sourceLabel}`,
    `坐标: ${chosen.lat.toFixed(6)}, ${chosen.lng.toFixed(6)}`,
    `海拔: ${altitude}m`,
    elevWarn ? "(海拔查询失败，已用 0)" : "",
    "",
    "argument 已复制到剪贴板:",
    argument,
    "",
    "下一步:",
    "Shadowrocket -> 配置 -> 模块",
    "替换 argument= 整行 -> 保存",
    "设置 -> 隐私 -> 定位服务 关开一次",
  ].filter((x) => x !== "");
  return writeLocFile("result.txt", lines.join("\n"));
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      Script.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
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
    showFile(writeLocFile("error.txt", "剪贴板为空\n请先复制地名再运行"));
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
  list.forEach((name) => a.addAction(name));
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

async function resolveCandidates(query) {
  const errors = [];
  const chain = [
    () => geocodeAmap(query),
    () => geocodeOpenMeteo(query),
    () => geocodeNominatim(query),
  ];
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
