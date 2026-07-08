// iOS Location Spoofer · Scriptable v3.0

const VERSION = "3.0";
const CONFIG = {
    amapKey: "8ad224cc1617bdfe92edd15167be87dc",
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

// 海外唐人街内置坐标（Open-Meteo 常无结果、高德会误匹配国内时使用）
const CHINATOWN_COORDS = {
    芝加哥: { lat: 41.851658, lng: -87.633138, elevation: 182 },
    纽约: { lat: 40.715751, lng: -73.997039, elevation: 10 },
    旧金山: { lat: 37.794078, lng: -122.407784, elevation: 52 },
    洛杉矶: { lat: 34.062809, lng: -118.238766, elevation: 91 },
    波士顿: { lat: 42.350382, lng: -71.062393, elevation: 6 },
    西雅图: { lat: 47.598988, lng: -122.326389, elevation: 20 },
    多伦多: { lat: 43.653226, lng: -79.383184, elevation: 97 },
    温哥华: { lat: 49.279793, lng: -123.109043, elevation: 20 },
    伦敦: { lat: 51.511741, lng: -0.124676, elevation: 15 },
    巴黎: { lat: 48.871078, lng: 2.345347, elevation: 38 },
};

(function initChinatownAliases() {
    const add = (keys, preset) => keys.forEach((k) => { BUILTIN_ALIASES[k.trim().toLowerCase()] = preset; });
    for (const [zh, coord] of Object.entries(CHINATOWN_COORDS)) {
        const preset = {
            name: `${zh}唐人街`,
            lat: coord.lat,
            lng: coord.lng,
            elevation: coord.elevation,
            sourceLabel: "预设",
        };
        add([`${zh}中国城`, `${zh}唐人街`, `${zh}华埠`, `${zh}的唐人街`, `${zh}的中国城`], preset);
    }
    add(["chicago chinatown", "chinatown chicago"], BUILTIN_ALIASES["芝加哥唐人街"]);
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
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0b0f;color:#f2f2f7;padding:0 16px env(safe-area-inset-bottom,20px);line-height:1.5}
.wrap{max-width:480px;margin:0 auto;padding-top:calc(env(safe-area-inset-top,0px) + 56px)}
.hero{padding-bottom:4px}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px;margin-bottom:12px;margin-left:2px}
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
    const gcjNote = chosen.gcjLat != null
        ? `<div class="item full"><label>高德 GCJ 对照（与坐标拾取器一致）</label><span>${chosen.gcjLat.toFixed(6)}, ${chosen.gcjLng.toFixed(6)}</span></div>`
        : "";
    const body = `
<div class="hero">
<span class="badge ok">定位已生成</span>
<h1>${esc(chosen.name)}</h1>
<p class="sub">argument 已复制到剪贴板</p>
</div>
<div class="card">
  <h2>坐标信息</h2>
  <div class="grid">
    <div class="item"><label>纬度 WGS-84</label><span>${lat}</span></div>
    <div class="item"><label>经度 WGS-84</label><span>${lng}</span></div>
    ${gcjNote}
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
<div class="hero">
<span class="badge err">${esc(title)}</span>
<h1>${esc(title)}</h1>
</div>
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

const CITY_ZH_TO_EN = {
    // 美国
    芝加哥: "Chicago", 纽约: "New York", 洛杉矶: "Los Angeles", 旧金山: "San Francisco",
    西雅图: "Seattle", 波士顿: "Boston", 华盛顿: "Washington", 费城: "Philadelphia",
    迈阿密: "Miami", 休斯敦: "Houston", 休斯顿: "Houston", 拉斯维加斯: "Las Vegas",
    檀香山: "Honolulu", 夏威夷: "Honolulu", 丹佛: "Denver", 亚特兰大: "Atlanta",
    圣地亚哥: "San Diego", 凤凰城: "Phoenix", 达拉斯: "Dallas", 奥斯汀: "Austin",
    波特兰: "Portland", 底特律: "Detroit", 明尼阿波利斯: "Minneapolis", 新奥尔良: "New Orleans",
    盐湖城: "Salt Lake City", 巴尔的摩: "Baltimore", 匹兹堡: "Pittsburgh", 夏洛特: "Charlotte",
    // 加拿大
    多伦多: "Toronto", 温哥华: "Vancouver", 蒙特利尔: "Montreal", 卡尔加里: "Calgary", 渥太华: "Ottawa",
    // 英国
    伦敦: "London", 曼彻斯特: "Manchester", 伯明翰: "Birmingham", 爱丁堡: "Edinburgh",
    格拉斯哥: "Glasgow", 利物浦: "Liverpool",
    // 德国
    柏林: "Berlin", 慕尼黑: "Munich", 法兰克福: "Frankfurt", 汉堡: "Hamburg",
    科隆: "Cologne", 斯图加特: "Stuttgart", 杜塞尔多夫: "Dusseldorf",
    // 法国
    巴黎: "Paris", 里昂: "Lyon", 马赛: "Marseille", 尼斯: "Nice", 波尔多: "Bordeaux",
    // 意大利
    罗马: "Rome", 米兰: "Milan", 威尼斯: "Venice", 佛罗伦萨: "Florence", 那不勒斯: "Naples",
    // 西班牙
    马德里: "Madrid", 巴塞罗那: "Barcelona", 塞维利亚: "Seville",
    // 日本
    东京: "Tokyo", 大阪: "Osaka", 京都: "Kyoto", 名古屋: "Nagoya", 横滨: "Yokohama",
    札幌: "Sapporo", 福冈: "Fukuoka", 神户: "Kobe",
    // 韩国
    首尔: "Seoul", 釜山: "Busan",
    // 澳大利亚/新西兰
    悉尼: "Sydney", 墨尔本: "Melbourne", 布里斯班: "Brisbane", 珀斯: "Perth", 阿德莱德: "Adelaide",
    奥克兰: "Auckland", 惠灵顿: "Wellington",
    // 西欧/北欧
    阿姆斯特丹: "Amsterdam", 布鲁塞尔: "Brussels", 苏黎世: "Zurich", 日内瓦: "Geneva",
    维也纳: "Vienna", 斯德哥尔摩: "Stockholm", 奥斯陆: "Oslo", 哥本哈根: "Copenhagen",
    赫尔辛基: "Helsinki", 都柏林: "Dublin", 里斯本: "Lisbon", 雅典: "Athens",
    华沙: "Warsaw", 布拉格: "Prague", 布达佩斯: "Budapest",
    // 东欧/中东/非洲
    莫斯科: "Moscow", 圣彼得堡: "Saint Petersburg", 伊斯坦布尔: "Istanbul",
    迪拜: "Dubai", 阿布扎比: "Abu Dhabi", 特拉维夫: "Tel Aviv", 耶路撒冷: "Jerusalem",
    开罗: "Cairo", 约翰内斯堡: "Johannesburg", 开普敦: "Cape Town",
    // 东南亚/南亚
    新加坡: "Singapore", 曼谷: "Bangkok", 清迈: "Chiang Mai", 吉隆坡: "Kuala Lumpur",
    雅加达: "Jakarta", 巴厘岛: "Bali", 马尼拉: "Manila", 河内: "Hanoi", 胡志明市: "Ho Chi Minh City",
    西贡: "Ho Chi Minh City", 新德里: "New Delhi", 孟买: "Mumbai", 班加罗尔: "Bangalore", 加尔各答: "Kolkata",
    // 拉美
    圣保罗: "Sao Paulo", 里约热内卢: "Rio de Janeiro", 墨西哥城: "Mexico City", 坎昆: "Cancun",
    布宜诺斯艾利斯: "Buenos Aires", 智利圣地亚哥: "Santiago",
};
const CITY_ZH_TO_COUNTRY = {
    芝加哥: "United States", 纽约: "United States", 洛杉矶: "United States", 旧金山: "United States",
    西雅图: "United States", 波士顿: "United States", 华盛顿: "United States", 费城: "United States",
    迈阿密: "United States", 休斯敦: "United States", 休斯顿: "United States", 拉斯维加斯: "United States",
    檀香山: "United States", 夏威夷: "United States", 丹佛: "United States", 亚特兰大: "United States",
    圣地亚哥: "United States", 凤凰城: "United States", 达拉斯: "United States", 奥斯汀: "United States",
    波特兰: "United States", 底特律: "United States", 明尼阿波利斯: "United States", 新奥尔良: "United States",
    盐湖城: "United States", 巴尔的摩: "United States", 匹兹堡: "United States", 夏洛特: "United States",
    多伦多: "Canada", 温哥华: "Canada", 蒙特利尔: "Canada", 卡尔加里: "Canada", 渥太华: "Canada",
    伦敦: "United Kingdom", 曼彻斯特: "United Kingdom", 伯明翰: "United Kingdom", 爱丁堡: "United Kingdom",
    格拉斯哥: "United Kingdom", 利物浦: "United Kingdom",
    柏林: "Germany", 慕尼黑: "Germany", 法兰克福: "Germany", 汉堡: "Germany", 科隆: "Germany",
    斯图加特: "Germany", 杜塞尔多夫: "Germany",
    巴黎: "France", 里昂: "France", 马赛: "France", 尼斯: "France", 波尔多: "France",
    罗马: "Italy", 米兰: "Italy", 威尼斯: "Italy", 佛罗伦萨: "Italy", 那不勒斯: "Italy",
    马德里: "Spain", 巴塞罗那: "Spain", 塞维利亚: "Spain",
    东京: "Japan", 大阪: "Japan", 京都: "Japan", 名古屋: "Japan", 横滨: "Japan",
    札幌: "Japan", 福冈: "Japan", 神户: "Japan",
    首尔: "South Korea", 釜山: "South Korea",
    悉尼: "Australia", 墨尔本: "Australia", 布里斯班: "Australia", 珀斯: "Australia", 阿德莱德: "Australia",
    奥克兰: "New Zealand", 惠灵顿: "New Zealand",
    阿姆斯特丹: "Netherlands", 布鲁塞尔: "Belgium", 苏黎世: "Switzerland", 日内瓦: "Switzerland",
    维也纳: "Austria", 斯德哥尔摩: "Sweden", 奥斯陆: "Norway", 哥本哈根: "Denmark", 赫尔辛基: "Finland",
    都柏林: "Ireland", 里斯本: "Portugal", 雅典: "Greece", 华沙: "Poland", 布拉格: "Czech Republic",
    布达佩斯: "Hungary", 莫斯科: "Russia", 圣彼得堡: "Russia", 伊斯坦布尔: "Turkey",
    迪拜: "United Arab Emirates", 阿布扎比: "United Arab Emirates", 特拉维夫: "Israel", 耶路撒冷: "Israel",
    开罗: "Egypt", 约翰内斯堡: "South Africa", 开普敦: "South Africa",
    新加坡: "Singapore", 曼谷: "Thailand", 清迈: "Thailand", 吉隆坡: "Malaysia", 雅加达: "Indonesia",
    巴厘岛: "Indonesia", 马尼拉: "Philippines", 河内: "Vietnam", 胡志明市: "Vietnam", 西贡: "Vietnam",
    新德里: "India", 孟买: "India", 班加罗尔: "India", 加尔各答: "India",
    圣保罗: "Brazil", 里约热内卢: "Brazil", 墨西哥城: "Mexico", 坎昆: "Mexico",
    布宜诺斯艾利斯: "Argentina", 智利圣地亚哥: "Chile",
};
const FOREIGN_CITIES_ZH = Object.keys(CITY_ZH_TO_EN).sort((a, b) => b.length - a.length).join("|");
const FOREIGN_CITY_RE = new RegExp(FOREIGN_CITIES_ZH);
const FOREIGN_COUNTRY_ZH =
    /(美国|加拿大|英国|英格兰|苏格兰|威尔士|法国|德国|意大利|西班牙|葡萄牙|荷兰|比利时|瑞士|奥地利|瑞典|挪威|丹麦|芬兰|爱尔兰|波兰|捷克|匈牙利|希腊|俄罗斯|土耳其|以色列|阿联酋|沙特|日本|韩国|新加坡|泰国|越南|马来西亚|印尼|印度尼西亚|菲律宾|印度|澳大利亚|新西兰|巴西|阿根廷|智利|墨西哥|埃及|南非|夏威夷)/;
const LANDMARK_ZH_TO_EN = {
    时代广场: "Times Square", 中央公园: "Central Park", 自由女神: "Statue of Liberty",
    帝国大厦: "Empire State Building", 金门大桥: "Golden Gate Bridge", 好莱坞: "Hollywood",
    迪士尼乐园: "Disneyland", 东京塔: "Tokyo Tower", 埃菲尔铁塔: "Eiffel Tower",
    大本钟: "Big Ben", 白宫: "White House", 五角大楼: "Pentagon",
    卢浮宫: "Louvre Museum", 勃兰登堡门: "Brandenburg Gate", 新天鹅堡: "Neuschwanstein Castle",
    斗兽场: "Colosseum", 比萨斜塔: "Leaning Tower of Pisa", 圣家堂: "Sagrada Familia",
    海德公园: "Hyde Park", 剑桥大学: "University of Cambridge", 牛津大学: "University of Oxford",
};
const DOMESTIC_MARKERS =
    /(北京|上海|广州|深圳|香港|台北|澳门|中国|省|市|区|县|路|街|镇|村|外滩|天安门|塔)/;

function isLikelyInternational(query) {
    const q = String(query || "").trim();
    if (/[a-zA-Z]/.test(q)) return true;
    if (FOREIGN_CITY_RE.test(q)) return true;
    if (FOREIGN_COUNTRY_ZH.test(q)) return true;
    return !DOMESTIC_MARKERS.test(q);
}

function translateLandmark(tail) {
    if (!tail) return "";
    if (LANDMARK_ZH_TO_EN[tail]) return LANDMARK_ZH_TO_EN[tail];
    for (const [zh, en] of Object.entries(LANDMARK_ZH_TO_EN)) {
        if (tail.includes(zh)) return tail.replace(zh, en);
    }
    return tail;
}

function normalizeIntlGeocodeQuery(query) {
    const q = String(query || "").trim();
    if (!isLikelyInternational(q)) return q;
    let m = q.match(
        new RegExp("^(" + FOREIGN_CITIES_ZH + ")\\s*(?:的)?\\s*(?:中国城|唐人街|华埠)$")
    );
    if (m) {
        const en = CITY_ZH_TO_EN[m[1]] || m[1];
        return "Chinatown, " + en;
    }
    m = q.match(
        new RegExp("(" + FOREIGN_CITIES_ZH + ").*(?:中国城|唐人街|华埠)|(?:中国城|唐人街|华埠).*(" + FOREIGN_CITIES_ZH + ")")
    );
    if (m) {
        const city = m[1] || m[2];
        const en = CITY_ZH_TO_EN[city] || city;
        return "Chinatown, " + en;
    }
    m = q.match(new RegExp("^(" + FOREIGN_CITIES_ZH + ")(?:的|\\s*)?(.*)$"));
    if (m) {
        const city = m[1];
        const tail = (m[2] || "").trim();
        const enCity = CITY_ZH_TO_EN[city] || city;
        const country = CITY_ZH_TO_COUNTRY[city] || "";
        if (!tail) return country ? `${enCity}, ${country}` : enCity;
        if (/^(中国城|唐人街|华埠)$/.test(tail)) return `Chinatown, ${enCity}`;
        const place = translateLandmark(tail);
        return country ? `${place}, ${enCity}, ${country}` : `${place}, ${enCity}`;
    }
    return q;
}

function filterIntlCandidates(query, cands) {
    if (!isLikelyInternational(query)) return cands;
    return cands.filter((c) => outOfChina(c.lat, c.lng));
}

function normalizeCnAddress(query) {
    return String(query || "").trim().replace(/\s+/g, "");
}

function extractAmapCity(query) {
    const m = String(query || "").match(/([\u4e00-\u9fff]{2,15}?)市/);
    return m ? m[1] : "";
}

const AMAP_LEVEL_RANK = {
    "门址": 100, "门牌号": 100, "单元号": 96, "兴趣点": 92, "POI": 92, "热点商圈": 62,
    "道路交叉路口": 56, "道路": 50, "村庄": 40, "乡镇": 36, "街道": 34,
    "开发区": 30, "区县": 20, "地级市": 12, "省": 6,
};

function amapLocToCand(loc, name, level) {
    if (!loc || !loc.includes(",")) return null;
    const [lngS, latS] = loc.split(",");
    const gcjLat = parseFloat(latS);
    const gcjLng = parseFloat(lngS);
    const wgs = gcj2wgs(gcjLat, gcjLng);
    return { name, lat: wgs[0], lng: wgs[1], gcjLat, gcjLng, sourceLabel: "高德", elevation: null, level: level || "" };
}

async function geocodeAmap(query) {
    const address = normalizeCnAddress(query);
    const city = extractAmapCity(query);
    const out = [];

    let url = `https://restapi.amap.com/v3/geocode/geo?key=${CONFIG.amapKey}&address=${encodeURIComponent(address)}&output=json`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    const data = await httpJson(url);
    if (data.status !== "1") throw new Error(data.info || "高德失败");
    for (const item of data.geocodes || []) {
        const c = amapLocToCand(item.location || "", item.formatted_address || query, item.level || "");
        if (c) out.push(c);
    }

    try {
        let poiUrl = `https://restapi.amap.com/v3/place/text?key=${CONFIG.amapKey}&keywords=${encodeURIComponent(address)}&offset=10&extensions=base&output=json`;
        if (city) poiUrl += `&city=${encodeURIComponent(city)}&citylimit=true`;
        const poi = await httpJson(poiUrl);
        if (poi.status === "1") {
            for (const item of poi.pois || []) {
                const addr = typeof item.address === "string" ? item.address : "";
                const nm = [item.name, addr].filter(Boolean).join(" ") || query;
                const c = amapLocToCand(item.location || "", nm, "POI");
                if (c) out.push(c);
            }
        }
    } catch (e) { /* ignore */ }

    out.sort((a, b) => (AMAP_LEVEL_RANK[b.level] || 45) - (AMAP_LEVEL_RANK[a.level] || 45));
    const seen = {};
    const uniq = [];
    for (const c of out) {
        const k = c.lat.toFixed(5) + "," + c.lng.toFixed(5);
        if (seen[k]) continue;
        seen[k] = 1;
        uniq.push(c);
    }
    return uniq;
}

async function geocodeOpenMeteo(query) {
    const geoQuery = normalizeIntlGeocodeQuery(query);
    const lang = isLikelyInternational(query) ? "en" : "zh";
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geoQuery)}&count=10&language=${lang}`;
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
    const geoQuery = normalizeIntlGeocodeQuery(query);
    const lang = isLikelyInternational(query) ? "en" : "zh";
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geoQuery)}&format=json&limit=10&accept-language=${lang}`;
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

async function resolveCandidates(query) {
    const errors = [];
    const intl = isLikelyInternational(query);
    const chain = intl
        ? [() => geocodeNominatim(query), () => geocodeOpenMeteo(query)]
        : [() => geocodeAmap(query)];
    for (const fn of chain) {
        try {
            const cands = filterIntlCandidates(query, await fn());
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
        const tag = c.level ? `[${c.level}] ` : "";
        a.addAction(`${i + 1}.${tag}${short}`);
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
