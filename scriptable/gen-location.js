// iOS Location Spoofer · Scriptable 版
// 输出在剪贴板 + Scriptable 文档目录 argument.txt（文件 App 可查看）

const CONFIG = {
  amapKey: "在此填入高德Web服务Key",
  hAcc: 10,
  vAcc: 20,
};

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

async function main() {
  try {
    const place = await askPlace();
    if (!place) return;

    const wait = new Alert("正在查询", `${place}\n请稍候…`);
    wait.addAction(" ");
    wait.present();

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
    const savedPath = saveArgument(argument);

    Pasteboard.copyString(argument);
    if (typeof Script !== "undefined" && Script.setShortcutOutput) {
      Script.setShortcutOutput(argument);
    }

    await showResult(chosen, argument, altitude, elevWarn, savedPath);
  } catch (e) {
    const err = new Alert("出错了", String(e.message || e));
    err.addAction("好");
    await err.present();
  }
}

function saveArgument(argument) {
  const fm = FileManager.iCloud();
  const dir = fm.joinPath(fm.documentsDirectory(), "location-spoofer");
  fm.createDirectory(dir, true);
  const path = fm.joinPath(dir, "argument.txt");
  fm.writeString(path, argument);
  return path;
}

async function showResult(chosen, argument, altitude, elevWarn, savedPath) {
  const elevNote = elevWarn ? "<p style='color:#ff9500'>⚠️ 海拔查询失败，已用 0</p>" : "";
  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system;padding:16px;background:#f2f2f7;line-height:1.5}
.card{background:#fff;border-radius:12px;padding:16px;margin-bottom:12px}
h2{margin:0 0 8px;font-size:20px}
.label{color:#666;font-size:13px;margin-bottom:4px}
textarea{width:100%;box-sizing:border-box;height:88px;font-size:12px;padding:10px;border:1px solid #ddd;border-radius:8px}
button{width:100%;padding:14px;margin-top:10px;font-size:17px;border:none;border-radius:10px}
.primary{background:#007aff;color:#fff}
.secondary{background:#e5e5ea;color:#000}
.tip{font-size:13px;color:#666;margin-top:8px}
</style></head><body>
<div class="card">
<h2>✅ 定位参数已生成</h2>
<p><b>${esc(chosen.name)}</b></p>
<p>来源: ${esc(chosen.sourceLabel)}</p>
<p>${chosen.lat.toFixed(6)}, ${chosen.lng.toFixed(6)}</p>
<p>海拔: ${altitude}m</p>
${elevNote}
<p class="tip">已自动复制到剪贴板<br>文件已保存到 Scriptable/location-spoofer/argument.txt</p>
</div>
<div class="card">
<div class="label">粘贴到 Shadowrocket 模块 argument= 后面：</div>
<textarea id="arg" readonly>${esc(argument)}</textarea>
<button class="primary" onclick="copy()">再次复制</button>
<button class="secondary" onclick="done()">完成</button>
</div>
<p class="tip">Shadowrocket → 配置 → 模块 → iOS Location Spoofer → 替换 argument= 整行 → 保存 → 关开定位</p>
<script>
function copy(){
  var t=document.getElementById('arg');
  t.select();t.setSelectionRange(0,99999);
  document.execCommand('copy');
  alert('已复制');
}
function done(){ window.location='done://ok'; }
</script>
</body></html>`;

  return new Promise(async (resolve) => {
    const wv = new WebView();
    wv.shouldAllowRequest = (req) => {
      if (req.url.startsWith("done://")) {
        resolve();
        return false;
      }
      return true;
    };
    wv.loadHTML(html);
    await wv.present(true);
    resolve();
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function inputText(title, placeholder) {
  return new Promise(async (resolve) => {
    let result = null;
    const wv = new WebView();
    wv.shouldAllowRequest = (req) => {
      if (req.url.startsWith("input://")) {
        result = decodeURIComponent(req.url.slice(8));
        wv.close();
        return false;
      }
      if (req.url.startsWith("cancel://")) {
        wv.close();
        return false;
      }
      return true;
    };
    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system;padding:20px;background:#f2f2f7}
h3{margin:0 0 16px}
input{width:100%;box-sizing:border-box;padding:14px;font-size:17px;border:1px solid #ccc;border-radius:10px}
button{width:100%;padding:14px;margin-top:12px;font-size:17px;border:none;border-radius:10px}
.ok{background:#007aff;color:#fff}
.cancel{background:#e5e5ea;color:#000}
</style></head><body>
<h3>${esc(title)}</h3>
<input id="t" placeholder="${esc(placeholder)}" autofocus>
<button class="ok" onclick="go()">确定</button>
<button class="cancel" onclick="window.location='cancel://'">取消</button>
<script>
function go(){
  var v=document.getElementById('t').value.trim();
  if(!v){alert('请输入地名');return;}
  window.location='input://'+encodeURIComponent(v);
}
document.getElementById('t').addEventListener('keydown',function(e){if(e.key==='Enter')go();});
</script></body></html>`;
    wv.loadHTML(html);
    await wv.present(true);
    resolve(result);
  });
}

async function askPlace() {
  if (args.shortcutParameter) {
    const t = String(args.shortcutParameter).trim();
    if (t) return t;
  }

  const alert = new Alert("iOS 定位生成", "选择输入方式");
  alert.addAction("手动输入地名");
  alert.addAction("从剪贴板读取");
  alert.addCancelAction("取消");
  const idx = await alert.present();
  if (idx === 0) return await inputText("输入地名", "例如：洛杉矶、上海外滩");
  if (idx === 1) {
    const t = (Pasteboard.paste() || "").trim();
    if (!t) {
      const err = new Alert("剪贴板为空", "请先复制地名，或选手动输入");
      err.addAction("好");
      await err.present();
      return null;
    }
    return t;
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
  req.timeoutInterval = 15;
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
  for (const [name, fn] of chain) {
    try {
      const cands = await fn();
      if (cands.length) return cands;
      errors.push(`${name}: 无结果`);
    } catch (e) {
      errors.push(`${name}: ${e.message || e}`);
    }
  }
  throw new Error("找不到地点\n" + errors.join("\n"));
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
