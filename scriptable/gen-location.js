// iOS Location Spoofer · Scriptable 版
// 用法：
// 1. 复制地名到剪贴板 → Scriptable 运行 → 点「从剪贴板读取」
// 2. 快捷指令：「询问输入」→「运行 Scriptable 脚本」传入地名

// 本地配置（可选）：复制 config.local.js.example 为 config.local.js 并填入 Key
// Scriptable 不支持 import，请直接改下方 amapKey

const CONFIG = {
  amapKey: "在此填入高德Web服务Key",
  hAcc: 10,
  vAcc: 20,
};

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

async function main() {
  const place = await askPlace();
  if (!place) return;

  const cands = await resolveCandidates(place);
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
  Pasteboard.copyString(argument);

  let msg = `来源: ${chosen.sourceLabel}\n${chosen.name}\n`;
  msg += `${chosen.lat.toFixed(6)}, ${chosen.lng.toFixed(6)}\n海拔 ${altitude}m\n\n`;
  if (elevWarn) msg += "⚠️ 海拔查询失败，已用 0\n\n";
  msg += "argument 已复制到剪贴板\n\n打开 Shadowrocket → 模块 → 替换 argument= 整行 → 关开定位";

  const alert = new Alert("定位参数已生成", msg);
  alert.addAction("完成");
  await alert.present();
}

async function askPlace() {
  if (args.shortcutParameter) {
    const t = String(args.shortcutParameter).trim();
    if (t) return t;
  }

  const clip = (Pasteboard.paste() || "").trim();
  if (clip) {
    const alert = new Alert("使用剪贴板地名？", clip.length > 40 ? clip.slice(0, 40) + "…" : clip);
    alert.addAction("使用");
    alert.addAction("换一条");
    alert.addCancelAction("取消");
    const idx = await alert.present();
    if (idx === 0) return clip;
    if (idx === -1) return null;
  }

  const alert = new Alert(
    "输入地名",
    "请先把地名复制到剪贴板\n（如：上海外滩）\n\n或添加到快捷指令：\n「询问输入」→「运行 Scriptable」"
  );
  alert.addAction("从剪贴板读取");
  alert.addCancelAction("取消");
  const idx = await alert.present();
  if (idx === 0) {
    const t = (Pasteboard.paste() || "").trim();
    if (!t) {
      const err = new Alert("剪贴板为空", "请先复制地名再运行");
      err.addAction("好");
      await err.present();
    }
    return t || null;
  }
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
  req.timeoutInterval = 12;
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
      source: "amap",
      sourceLabel: "高德 (GCJ→WGS)",
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
      source: "openmeteo",
      sourceLabel: "Open-Meteo",
      elevation: item.elevation != null ? item.elevation : null,
    });
  }
  return out;
}

async function geocodeNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=10&accept-language=zh`;
  const data = await httpJson(url, { "User-Agent": "ios-location-spoofer-scriptable/1.0" });
  return (data || []).map(item => ({
    name: item.display_name || query,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    source: "nominatim",
    sourceLabel: "Nominatim",
    elevation: null,
  }));
}

async function resolveCandidates(query) {
  const errors = [];
  const chain = [
    ["amap", async () => {
      if (!CONFIG.amapKey || CONFIG.amapKey.includes("在此填入")) throw new Error("未配置 amapKey");
      return geocodeAmap(query);
    }],
    ["openmeteo", () => geocodeOpenMeteo(query)],
    ["nominatim", () => geocodeNominatim(query)],
  ];

  for (const [name, fn] of chain) {
    try {
      const cands = await fn();
      if (cands.length) return cands;
      errors.push(`${name}: 无结果`);
    } catch (e) {
      errors.push(`${name}: ${e.message || e}`);
    }
  }
  throw new Error("Geocoding 失败\n" + errors.join("\n"));
}

async function pickCandidate(cands) {
  if (cands.length === 1) return cands[0];
  const alert = new Alert("选择地点", `找到 ${cands.length} 个候选`);
  cands.forEach((c, i) => {
    const short = c.name.length > 28 ? c.name.slice(0, 28) + "…" : c.name;
    alert.addAction(`${i + 1}. ${short}`);
  });
  alert.addCancelAction("取消");
  const idx = await alert.present();
  if (idx === -1) throw new Error("已取消");
  return cands[idx];
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
