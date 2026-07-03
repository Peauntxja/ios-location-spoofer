#!/usr/bin/env python3
import argparse
import json
import math
import os
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "templates" / "ios-location-spoofer.sgmodule"
BASE_CONFIG = ROOT / "config" / "shadowrocket-base.conf"
DEFAULT_OUT = ROOT / "output" / "shadowrocket-module.conf"
SGMODULE_OUT = ROOT / "output" / "ios-location-spoofer.sgmodule"
ARGUMENT_OUT = ROOT / "output" / "argument.txt"


def load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip())


load_dotenv()

PI = math.pi
A = 6378245.0
EE = 0.00669342162296594323


@dataclass
class Candidate:
    name: str
    lat: float
    lng: float
    source: str
    elevation: float | None = None


def ssl_context() -> ssl.SSLContext:
    for path in (
        os.environ.get("SSL_CERT_FILE"),
        "/etc/ssl/cert.pem",
        "/private/etc/ssl/cert.pem",
        "/opt/homebrew/etc/openssl@3/cert.pem",
        "/opt/homebrew/etc/openssl@1.1/cert.pem",
    ):
        if path and os.path.isfile(path):
            try:
                return ssl.create_default_context(cafile=path)
            except ssl.SSLError:
                pass
    return ssl.create_default_context()


def http_json(url: str, timeout: float = 10.0, headers: dict | None = None) -> dict | list:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout, context=ssl_context()) as resp:
        return json.loads(resp.read().decode())


def out_of_china(lat: float, lng: float) -> bool:
    return lng < 72.004 or lng > 137.8347 or lat < 0.8293 or lat > 55.8271


def _t_lat(x: float, y: float) -> float:
    r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    r += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
    r += (20.0 * math.sin(y * PI) + 40.0 * math.sin(y / 3.0 * PI)) * 2.0 / 3.0
    r += (160.0 * math.sin(y / 12.0 * PI) + 320 * math.sin(y * PI / 30.0)) * 2.0 / 3.0
    return r


def _t_lng(x: float, y: float) -> float:
    r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    r += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
    r += (20.0 * math.sin(x * PI) + 40.0 * math.sin(x / 3.0 * PI)) * 2.0 / 3.0
    r += (150.0 * math.sin(x / 12.0 * PI) + 300.0 * math.sin(x / 30.0 * PI)) * 2.0 / 3.0
    return r


def wgs2gcj(lat: float, lng: float) -> tuple[float, float]:
    if out_of_china(lat, lng):
        return lat, lng
    d_lat = _t_lat(lng - 105.0, lat - 35.0)
    d_lng = _t_lng(lng - 105.0, lat - 35.0)
    rad_lat = lat / 180.0 * PI
    m = math.sin(rad_lat)
    m = 1 - EE * m * m
    sm = math.sqrt(m)
    d_lat = (d_lat * 180.0) / ((A * (1 - EE)) / (m * sm) * PI)
    d_lng = (d_lng * 180.0) / (A / sm * math.cos(rad_lat) * PI)
    return lat + d_lat, lng + d_lng


def gcj2wgs(lat: float, lng: float) -> tuple[float, float]:
    if out_of_china(lat, lng):
        return lat, lng
    wlat, wlng = lat, lng
    for _ in range(3):
        g_lat, g_lng = wgs2gcj(wlat, wlng)
        wlat += lat - g_lat
        wlng += lng - g_lng
    return wlat, wlng


def geocode_amap(query: str, key: str) -> list[Candidate]:
    url = "https://restapi.amap.com/v3/geocode/geo?" + urllib.parse.urlencode({
        "key": key, "address": query, "output": "json",
    })
    data = http_json(url)
    if data.get("status") != "1":
        raise RuntimeError(data.get("info") or "amap error")
    out: list[Candidate] = []
    for item in data.get("geocodes") or []:
        loc = item.get("location") or ""
        if "," not in loc:
            continue
        lng_s, lat_s = loc.split(",", 1)
        lat_gcj, lng_gcj = float(lat_s), float(lng_s)
        lat, lng = gcj2wgs(lat_gcj, lng_gcj)
        out.append(Candidate(
            name=item.get("formatted_address") or query,
            lat=lat, lng=lng, source="amap",
        ))
    return out


FOREIGN_CITIES_ZH = (
    "芝加哥|纽约|洛杉矶|旧金山|西雅图|波士顿|华盛顿|费城|迈阿密|休斯敦|休斯顿|拉斯维加斯|"
    "檀香山|夏威夷|丹佛|亚特兰大|圣地亚哥|多伦多|温哥华|蒙特利尔|伦敦|巴黎|柏林|东京|大阪|京都|"
    "首尔|悉尼|墨尔本|新加坡|曼谷|迪拜"
)
CITY_ZH_TO_EN = {
    "芝加哥": "Chicago", "纽约": "New York", "洛杉矶": "Los Angeles", "旧金山": "San Francisco",
    "西雅图": "Seattle", "波士顿": "Boston", "华盛顿": "Washington", "费城": "Philadelphia",
    "迈阿密": "Miami", "休斯敦": "Houston", "休斯顿": "Houston", "拉斯维加斯": "Las Vegas",
    "檀香山": "Honolulu", "夏威夷": "Honolulu", "丹佛": "Denver", "亚特兰大": "Atlanta",
    "圣地亚哥": "San Diego", "多伦多": "Toronto", "温哥华": "Vancouver", "蒙特利尔": "Montreal",
    "伦敦": "London", "巴黎": "Paris", "柏林": "Berlin", "东京": "Tokyo", "大阪": "Osaka",
    "京都": "Kyoto", "首尔": "Seoul", "悉尼": "Sydney", "墨尔本": "Melbourne",
    "新加坡": "Singapore", "曼谷": "Bangkok", "迪拜": "Dubai",
}
DOMESTIC_MARKERS = re.compile(
    r"(北京|上海|广州|深圳|香港|台北|澳门|中国|省|市|区|县|路|街|镇|村|外滩|天安门|塔)"
)


def is_likely_international(query: str) -> bool:
    q = query.strip()
    if re.search(r"[a-zA-Z]", q):
        return True
    if re.search(FOREIGN_CITIES_ZH, q):
        return True
    return not DOMESTIC_MARKERS.search(q)


def normalize_intl_geocode_query(query: str) -> str:
    q = query.strip()
    if not is_likely_international(q):
        return q
    m = re.match(rf"^({FOREIGN_CITIES_ZH})\s*(?:的)?\s*(?:中国城|唐人街|华埠)$", q)
    if m:
        en = CITY_ZH_TO_EN.get(m.group(1), m.group(1))
        return f"Chinatown, {en}"
    return q


def geocode_openmeteo(query: str, *, language: str | None = None) -> list[Candidate]:
    geo_query = normalize_intl_geocode_query(query)
    lang = language or ("en" if is_likely_international(query) else "zh")
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode({
        "name": geo_query, "count": 10, "language": lang,
    })
    data = http_json(url)
    out: list[Candidate] = []
    for item in data.get("results") or []:
        elev = item.get("elevation")
        out.append(Candidate(
            name=", ".join(filter(None, [
                item.get("name"),
                item.get("admin1"),
                item.get("country"),
            ])),
            lat=float(item["latitude"]),
            lng=float(item["longitude"]),
            source="openmeteo",
            elevation=float(elev) if elev is not None else None,
        ))
    return out


def geocode_nominatim(query: str) -> list[Candidate]:
    geo_query = normalize_intl_geocode_query(query)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": geo_query, "format": "json", "limit": 10, "accept-language": "zh",
    })
    data = http_json(url, headers={"User-Agent": "ios-location-spoofer/1.0 (Peauntxja)"})
    out: list[Candidate] = []
    for item in data:
        out.append(Candidate(
            name=item.get("display_name") or query,
            lat=float(item["lat"]),
            lng=float(item["lon"]),
            source="nominatim",
        ))
    return out


def fetch_elevation(lat: float, lng: float) -> float | None:
    url = "https://api.open-meteo.com/v1/elevation?" + urllib.parse.urlencode({
        "latitude": lat, "longitude": lng,
    })
    try:
        data = http_json(url, timeout=10.0)
        vals = data.get("elevation") or []
        if vals and vals[0] is not None:
            return float(vals[0])
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, IndexError):
        pass
    return None


def resolve_candidates(query: str, provider: str, amap_key: str | None) -> list[Candidate]:
    chain: list[str]
    if provider == "auto":
        chain = (
            ["openmeteo", "nominatim", "amap"]
            if is_likely_international(query)
            else ["amap", "openmeteo", "nominatim"]
        )
    else:
        chain = [provider]

    errors: list[str] = []
    for name in chain:
        if name == "amap":
            if not amap_key:
                errors.append("amap: 未设置 AMAP_KEY")
                continue
            try:
                cands = geocode_amap(query, amap_key)
                if cands:
                    return cands
                errors.append("amap: 无结果")
            except Exception as e:
                errors.append(f"amap: {e}")
            continue
        if name == "openmeteo":
            try:
                cands = geocode_openmeteo(query)
                if cands:
                    return cands
                errors.append("openmeteo: 无结果")
            except Exception as e:
                errors.append(f"openmeteo: {e}")
            continue
        if name == "nominatim":
            try:
                cands = geocode_nominatim(query)
                if cands:
                    return cands
                errors.append("nominatim: 无结果")
            except Exception as e:
                errors.append(f"nominatim: {e}")

    raise SystemExit("Geocoding 失败:\n  " + "\n  ".join(errors))


def pick_candidate(cands: list[Candidate]) -> Candidate:
    if len(cands) == 1:
        return cands[0]
    print("找到多个候选：")
    for i, c in enumerate(cands, 1):
        print(f"  [{i}] ({c.source}) {c.name}  {c.lat:.6f}, {c.lng:.6f}")
    while True:
        raw = input("选择编号 [1]: ").strip() or "1"
        if raw.isdigit() and 1 <= int(raw) <= len(cands):
            return cands[int(raw) - 1]
        print("无效编号，请重试")


def build_argument(lat: float, lng: float, altitude: int, h_acc: int, v_acc: int) -> str:
    return (
        f"mode=response&latitude={lat:.6f}&longitude={lng:.6f}"
        f"&horizontalAccuracy={h_acc}&verticalAccuracy={v_acc}"
        f"&altitude={altitude}&debug=false"
    )


def render_sgmodule(argument: str) -> str:
    text = TEMPLATE.read_text(encoding="utf-8")
    return re.sub(
        r"argument=[^\n]+",
        f"argument={argument}",
        text,
        count=1,
    )


def render_full_config(argument: str, base_path: Path) -> str:
    text = base_path.read_text(encoding="utf-8")
    return re.sub(
        r"argument=[^\n]+",
        f"argument={argument}",
        text,
        count=1,
    )


def main() -> None:
    p = argparse.ArgumentParser(description="地名 → Shadowrocket 定位配置生成器")
    p.add_argument("place", help="地名或详细地址")
    p.add_argument("-o", "--output", type=Path, default=DEFAULT_OUT, help="输出完整 Shadowrocket 配置路径")
    p.add_argument("--base", type=Path, default=BASE_CONFIG, help="完整配置模板（只改 argument=）")
    p.add_argument("--provider", choices=["auto", "amap", "openmeteo", "nominatim"], default="auto")
    p.add_argument("--h-acc", type=int, default=10, help="horizontalAccuracy")
    p.add_argument("--v-acc", type=int, default=20, help="verticalAccuracy")
    args = p.parse_args()

    amap_key = os.environ.get("AMAP_KEY")
    cands = resolve_candidates(args.place, args.provider, amap_key)
    chosen = pick_candidate(cands)

    elev = chosen.elevation
    elev_warn = False
    if elev is None:
        elev = fetch_elevation(chosen.lat, chosen.lng)
    if elev is None:
        elev = 0
        elev_warn = True

    altitude = round(elev)
    argument = build_argument(chosen.lat, chosen.lng, altitude, args.h_acc, args.v_acc)

    source_note = chosen.source
    if chosen.source == "amap":
        source_note += " (GCJ-02 已转 WGS-84)"

    print(f"来源: {source_note}")
    print(f"地点: {chosen.name}")
    print(f"纬度: {chosen.lat:.6f}  经度: {chosen.lng:.6f}  海拔: {altitude}m")
    if elev_warn:
        print("警告: 海拔查询失败，已使用 0")
    print(argument)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not args.base.is_file():
        raise SystemExit(f"找不到配置模板: {args.base}\n请从 Shadowrocket 导出完整模块配置，保存为该文件")

    full_config = render_full_config(argument, args.base)
    args.output.write_text(full_config, encoding="utf-8")
    ARGUMENT_OUT.write_text(argument + "\n", encoding="utf-8")
    if TEMPLATE.is_file():
        SGMODULE_OUT.write_text(render_sgmodule(argument), encoding="utf-8")
    print(f"\n已生成: {args.output}")
    print(f"已生成: {ARGUMENT_OUT}")
    if TEMPLATE.is_file():
        print(f"已生成: {SGMODULE_OUT}")


if __name__ == "__main__":
    main()
