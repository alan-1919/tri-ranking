// data.js — fetches rankings.csv at page load, parses it, exposes window.RANKINGS.
//
// Data source: rankings.csv (single source of truth, edit in Excel / Google Sheets)
// Parse strategy: PapaParse (loaded via CDN in index.html before this file)
// Async pattern: window.RANKINGS_READY = Promise<void>  — main.jsx awaits this.

(function () {
  // ────────────────────────────────────────────────────────────────
  // EDIT THESE WHEN YOU SHIP A DATA UPDATE
  // ────────────────────────────────────────────────────────────────
  const META = {
    lastUpdated: "2026.05.30",
    sourceNote:   "全程226公里（游泳3.8km + 自行車180km + 跑步42.2km）",
    sourceNoteEn: "Full distance 226km (3.8km swim + 180km bike + 42.2km run)",
    coverage:     "全球範圍 · 台灣國籍女子選手",
    coverageEn:   "Worldwide · Taiwan-nationality women",
    targetCount:  30,
  };

  // English-name lookup. Add a row here when you add a new athlete to CSV.
  // CSV holds only the Chinese name; this map provides the romanization shown
  // as a sub-line and in modal headers.
  const ATHLETES_EN = {
    "李筱瑜": "Hsiao-Yu Li",
    "陳俐妘": "Li-Yun Chen",
    "郭家齊": "Chia-Chi Kuo",
    "黃怡佳": "Yi-Chia Huang",
    "許靜怡": "Ching-Yi Hsu",
    "洪筱婷": "Hsiao-Ting Hung",
    "郭慧希": "Hui-Hsi Kuo",
    "鍾天晴": "Tien-Ching Chung",
    "楊宜靜": "Yi-Ching Yang",
    "徐慧安": "Hui-An Hsu",
    "林吟霞": "Yin-Hsia Lin",
    "吳依玫": "Yi-Mei Wu",
    "李秀如": "Hsiu-Ju Lee",
    "羅紹萍": "Shao-Ping Lo",
    "黃佩婷": "Pei-Ting Huang",
    "何奕儒": "Yi-Ju Ho",
    "林怡君": "Yi-Chun Lin",
    "陳玉玲": "Yu-Ling Chen",
    "李淳潔": "Chun-Chieh Li",
    "莊雅婷": "Ya-Ting Chuang",
    "梁蘭麗": "Lan-Li Liang",
    "陳知輿": "Chih-Yu Chen",
    "連雪涵": "Hsueh-Han Lien",
    "陳明煥": "Ming-Huan Chen",
    "高玉美": "Yu-Mei Kao",
    "李宜芳": "Yi-Fang Li",
    "陳慧菁": "Hui-Ching Chen",
    "趙瑞娟": "Jui-Chuan Chao",
    "賴柏伶": "Pai-Ling Lai",
    "廖健妤": "Chien-Yu Liao",
    "蔡文雅": "Wen-Ya Tsai",
    "曾郁雅": "Yu-Ya Tseng",
  };

  // Race-code lookup. Add a row when CSV uses a new race code.
  const RACES = {
    "IM Frankfurt": { zh: "IM 法蘭克福",      en: "IRONMAN Frankfurt",         region: "DEU" },
    "CT":           { zh: "Challenge Taiwan", en: "Challenge Taiwan",          region: "TWN" },
    "普悠瑪":        { zh: "普悠瑪超鐵",        en: "Puyuma 226",                region: "TWN" },
    "臺東超鐵":      { zh: "臺東超鐵",          en: "Taitung Triathlon",         region: "TWN" },
    "IM Penghu":    { zh: "IM 台灣 · 澎湖",    en: "IRONMAN Taiwan (Penghu)",   region: "TWN" },
    "IM Korea":     { zh: "IM 韓國",           en: "IRONMAN Korea",             region: "KOR" },
  };

  // ────────────────────────────────────────────────────────────────
  // helpers — time formatting
  // ────────────────────────────────────────────────────────────────
  function toSeconds(str) {
    if (!str) return null;
    const parts = String(str).split(":").map((s) => parseInt(s, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }
  function fromSeconds(s) {
    if (s == null) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
  function toPace(seconds, km) {
    if (seconds == null || !km) return "—";
    const perKm = seconds / km;
    const m = Math.floor(perKm / 60);
    const s = Math.round(perKm % 60);
    return `${m}:${String(s).padStart(2, "0")}/km`;
  }
  function paceFor(leg, seconds) {
    if (seconds == null) return "—";
    if (leg === "swim") {
      const per100 = seconds / 38; // 3.8 km = 38 × 100 m
      const m = Math.floor(per100 / 60);
      const s = Math.round(per100 % 60);
      return `${m}:${String(s).padStart(2, "0")}/100m`;
    }
    if (leg === "bike") {
      const kmh = (180 * 3600) / seconds;
      return `${kmh.toFixed(1)} km/h`;
    }
    if (leg === "run") {
      const perKm = seconds / 42.2;
      const m = Math.floor(perKm / 60);
      const s = Math.round(perKm % 60);
      return `${m}:${String(s).padStart(2, "0")}/km`;
    }
    return "—";
  }

  // Sort helpers
  function bySec(key) {
    return (a, b) => {
      const av = a[key], bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    };
  }
  function byNum(key) { return (a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity); }
  function byStr(key) { return (a, b) => String(a[key] || "").localeCompare(String(b[key] || "")); }

  // ────────────────────────────────────────────────────────────────
  // CSV row → hydrated record
  // ────────────────────────────────────────────────────────────────
  function hydrate(row) {
    const race = String(row.race || "").trim();
    const name = String(row.name || "").trim();
    return {
      rank:        Number(row.rank),
      name,
      nameEn:      ATHLETES_EN[name] || "",
      country:     String(row.country || "TWN").trim(),
      race,
      raceEn:      RACES[race]?.en || race,
      year:        Number(row.year),
      swim:        row.swim || "",
      t1:          row.t1   || "",
      bike:        row.bike || "",
      t2:          row.t2   || "",
      run:         row.run  || "",
      overall:     row.overall || "",
      overallPos:  row.overall_pos ? Number(row.overall_pos) : null,
      notes:       row.notes || "",
      bio:         row.bio   || "",
      source:      row.source || "",
      sourceLabel: row.source_label || "",
      photo:       (row.photo || "").trim(),
      // Numeric (seconds) for sorting / math:
      swimSec:    toSeconds(row.swim),
      t1Sec:      toSeconds(row.t1),
      bikeSec:    toSeconds(row.bike),
      t2Sec:      toSeconds(row.t2),
      runSec:     toSeconds(row.run),
      overallSec: toSeconds(row.overall),
      transSec:   (toSeconds(row.t1) ?? 0) + (toSeconds(row.t2) ?? 0) || null,
    };
  }

  // ────────────────────────────────────────────────────────────────
  // Wire up globals + start fetch
  // ────────────────────────────────────────────────────────────────
  window.RANKINGS = [];
  window.BEST = {};
  window.RACES = RACES;
  window.DIST = { swim: 3.8, bike: 180, run: 42.2 };
  window.fmtTime = fromSeconds;
  window.fmtPace = toPace;
  window.fmtPaceFor = paceFor;
  window.toSeconds = toSeconds;
  window.sortBySec = bySec;
  window.sortByNum = byNum;
  window.sortByStr = byStr;

  // 拿 rankings.csv 的最新 commit 日期，作為「資料更新」顯示
  // 用 GitHub Public API（無需驗證；匿名上限 60/hr per IP，訪客流量夠用）
  // 失敗或拿不到時 fallback 為 META.lastUpdated 寫死值
  async function fetchLastUpdatedFromGitHub() {
    const url = "https://api.github.com/repos/kobby0923-tw/tri-ranking/commits?path=rankings.csv&per_page=1";
    try {
      const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!res.ok) return null;
      const arr = await res.json();
      const iso = arr?.[0]?.commit?.author?.date || arr?.[0]?.commit?.committer?.date;
      if (!iso) return null;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
    } catch {
      return null;
    }
  }

  window.RANKINGS_READY = fetch("rankings.csv", { cache: "no-cache" })
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load rankings.csv: ${res.status}`);
      return res.text();
    })
    .then(async (csv) => {
      const parsed = Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });
      if (parsed.errors.length) {
        console.warn("[data] CSV parse warnings:", parsed.errors);
      }
      const rows = parsed.data
        .map(hydrate)
        .filter((r) => r.name && !isNaN(r.rank))
        .sort((a, b) => a.rank - b.rank);

      window.RANKINGS = rows;
      window.BEST = {};
      ["swimSec", "bikeSec", "runSec", "overallSec"].forEach((k) => {
        const vals = rows.map((r) => r[k]).filter((v) => v != null);
        window.BEST[k] = vals.length ? Math.min(...vals) : null;
      });

      // 先用 META.lastUpdated 作為預設，再用 GitHub 最新 commit 日期覆蓋
      const liveLastUpdated = await fetchLastUpdatedFromGitHub();
      window.RANKINGS_META = {
        ...META,
        lastUpdated: liveLastUpdated || META.lastUpdated,
        recordCount: rows.length,
      };
    })
    .catch((err) => {
      console.error("[data] fatal:", err);
      window.RANKINGS_LOAD_ERROR = err;
      window.RANKINGS_META = { ...META, recordCount: 0 };
    });
})();
