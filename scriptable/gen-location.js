// iOS Location Spoofer · Scriptable v2.0
// 不用 WebView 输入（部分机型按钮无响应），改用剪贴板 / 常用城市 / 快捷指令

const VERSION = "2.0";
const QUERY_TIMEOUT_MS = 30000;
const CONFIG = {
  amapKey: "在此填入高德Web服务Key",
  hAcc: 10,
  vAcc: 20,
};

const PRESETS = [
  "上海外滩", "北京天安门", "广州塔", "深圳",
  "洛杉矶", "Los Angeles", "纽约", "New York",
  "东京塔", "Tokyo Tower", "夏威夷", "Hawaii",
  "Staples Center, Los Angeles", "London", "巴黎",
];

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

async function main() {
  try {
    const place = await askPlace();
    if (!place) return;

    ping("正在查询", `「${place}」\n约 3～10 秒`);

    const cands = await withTimeout(
      resolveCandidates(place),
      QUERY_TIMEOUT_MS,
      `查询「${place}」超时\n请检查网络或换关键词`
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
    await showResult(chosen, argument, altitude, elevWarn);
  } catch (e) {
    const msg = String((e && e.message) || e || "未知错误").trim() || "未知错误";
    ping("查询失败", msg);
    await showTip("查询失败", msg);
  }
}

async function showTip(title, message) {
  const a = new Alert(String(title), String(message));
  a.addAction("好");
  await a.present();
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = Script.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { Script.clearTimeout(timer); resolve(v); },
      (e) => { Script.clearTimeout(timer); reject(e); }
    );
  });
}

function ping(title, body) {
  const n = new Notification();
  n.title = title;
  n.body = body;
  n.schedule();
}

function saveArgument(argument) {
  const fm = FileManager.iCloud();
  const dir = fm.joinPath(fm.documentsDirectory(), "location-spoofer");
  fm.createDirectory(dir, true);
  fm.writeString(fm.joinPath(dir, "argument.txt"), argument);
}

async function showResult(chosen, argument, altitude, elevWarn) {
  let msg = `${chosen.name}\n来源: ${chosen.sourceLabel}\n`;
  msg += `${chosen.lat.toFixed(6)}, ${chosen.lng.toFixed(6)}\n海拔: ${altitude}m\n`;
  if (elevWarn) msg += "\n⚠️ 海拔查询失败，已用 0\n";
  msg += "\n✅ argument 已复制到剪贴板\n";
  msg += `文件: Scriptable/location-spoofer/argument.txt\n\n`;
  msg += `${argument}\n\n`;
  msg += "Shadowrocket → 配置 → 模块\n替换 argument= 整行 → 保存 → 关开定位";
  await showTip("定位参数已生成", msg);
}

async function askFromClipboard() {
  const t = (Pasteboard.paste() || "").trim();
  if (!t) {
    await showTip(
      "剪贴板为空",
      "请先在地图 / 备忘录 / Safari 复制地名\n然后重新运行脚本\n\n或选「常用城市」"
    );
    return null;
  }
  const preview = t.length > 50 ? t.slice(0, 50) + "…" : t;
  const alert = new Alert("确认查询", preview);
  alert.addAction("开始查询");
  alert.addCancelAction("取消");
  const idx = await alert.present();
  return idx === 0 ? t : null;
}

async function pickPresetCity() {
  const alert = new Alert("常用城市", "点选即可查询");
  PRESETS.forEach((name) => alert.addAction(name));
  alert.addCancelAction("取消");
  const idx = await alert.present();
  if (idx === -1) return null;
  return PRESETS[idx];
}

async function askPlace() {
  if (args.shortcutParameter) {
    const t = String(args.shortcutParameter).trim();
    if (t) return t;
  }

  const alert = new Alert(
    `iOS 定位 v${VERSION}`,
    "① 剪贴板：先复制地名再点\n② 常用城市：直接点选\n③ 键盘输入：加到快捷指令「询问输入」→「运行 Scriptable」"
  );
  alert.addAction("从剪贴板读取");
  alert.addAction("常用城市");
  alert.addCancelAction("取消");
  const idx = await alert.present();
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
  for (const [, fn] of chain) {
    try {
      const cands = await fn();
      if (cands.length) return cands;
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  throw new Error(
    `找不到「${query}」\n\n建议：\n· 用城市/地标名\n· 国外用英文\n· 球队/店名改成具体地址`
  );
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
  if (idx === -1) throw new Error("已取消选择");
  const chosen = cands[idx];
  if (!chosen) throw new Error("选择无效，请重试");
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
