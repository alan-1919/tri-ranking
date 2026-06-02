// main.jsx — production rankings page (Variation B).
// Waits for window.RANKINGS_READY (CSV fetch) before mounting the table.

const { useState, useEffect, useMemo } = React;

// ─── HeroCarousel ─────────────────────────────────────────────────────
// 載入 banners.json → 顯示輪播。
// 行為：
//   - 多張 slide：自動播放（hover 上去暫停）+ 左右箭頭 + 底部 dots
//   - 單張 slide：自動隱藏所有控制
//   - 載入失敗：fallback 顯示舊版女力靜態圖（保留現有體驗）
function HeroCarousel() {
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("banners.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.slides) && j.slides.length > 0) setData(j);
      })
      .catch(() => {});
  }, []);

  const slides = data?.slides || [];
  const config = data?.config || {};
  const autoplay = config.autoplay !== false && slides.length > 1;
  const intervalMs = Math.max(2000, Number(config.intervalMs) || 5000);

  useEffect(() => {
    if (!autoplay || paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), intervalMs);
    return () => clearInterval(t);
  }, [autoplay, paused, slides.length, intervalMs]);

  // Fallback：未載入到 banners.json 時，沿用原本的靜態女力圖
  if (!data) {
    return (
      <section className="hero-banner" aria-label="女力 Female Power">
        <div className="hero-banner-inner">
          <div className="hero-banner-bg" aria-hidden="true"></div>
        </div>
      </section>
    );
  }

  const go = (next) => {
    const n = slides.length;
    setIdx(((next % n) + n) % n);
  };

  return (
    <section
      className="hero-banner hero-carousel"
      aria-label="Banner 輪播"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="hero-banner-inner">
        {slides.map((s, i) => {
          const active = i === idx;
          const inner = (
            <React.Fragment>
              <div
                className="hero-banner-bg"
                role="img"
                aria-label={s.alt || s.title || ""}
                style={{ backgroundImage: `url('${s.image}')` }}
              />
              {(s.title || s.subtitle) && (
                <div className="hero-carousel-caption">
                  {s.title && <div className="hero-carousel-title">{s.title}</div>}
                  {s.subtitle && <div className="hero-carousel-subtitle">{s.subtitle}</div>}
                </div>
              )}
            </React.Fragment>
          );
          const linked = s.link
            ? (
              <a
                className="hero-carousel-slide-link"
                href={s.link}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={active ? 0 : -1}
                aria-hidden={!active}
              >
                {inner}
              </a>
            )
            : inner;
          return (
            <div
              key={s.id || i}
              className={`hero-carousel-slide ${active ? "is-active" : ""}`}
              aria-hidden={!active}
            >
              {linked}
            </div>
          );
        })}

        {slides.length > 1 && (
          <React.Fragment>
            <button
              className="hero-carousel-arrow hero-carousel-prev"
              onClick={() => go(idx - 1)}
              aria-label="上一張"
              type="button"
            >
              ‹
            </button>
            <button
              className="hero-carousel-arrow hero-carousel-next"
              onClick={() => go(idx + 1)}
              aria-label="下一張"
              type="button"
            >
              ›
            </button>
            <div className="hero-carousel-dots" role="tablist">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === idx}
                  aria-label={`第 ${i + 1} 張`}
                  className={`hero-carousel-dot ${i === idx ? "is-active" : ""}`}
                  onClick={() => setIdx(i)}
                />
              ))}
            </div>
          </React.Fragment>
        )}
      </div>
    </section>
  );
}

function StatsBanner({ onPickRecord }) {
  const stats = useMemo(() => {
    const rows = window.RANKINGS;
    const validRows = rows.filter((r) => r.overallSec != null);
    const holder = rows.find((r) => r.overallSec === window.BEST.overallSec) || null;
    const avgSec = validRows.length
      ? Math.round(validRows.reduce((s, r) => s + r.overallSec, 0) / validRows.length)
      : null;
    const years = rows.map((r) => r.year).filter(Boolean);
    const yMin = years.length ? Math.min(...years) : null;
    const yMax = years.length ? Math.max(...years) : null;
    const uniqueRaces = [...new Set(rows.map((r) => r.race))];
    const byRegion = uniqueRaces.reduce((acc, race) => {
      const region = window.RACES[race]?.region || "TWN";
      acc[region === "TWN" ? "twn" : "intl"] += 1;
      return acc;
    }, { twn: 0, intl: 0 });
    return { holder, avgSec, yMin, yMax, raceCount: uniqueRaces.length, byRegion };
  }, []);

  const holderRace = stats.holder
    ? (window.RACES[stats.holder.race]?.zh || stats.holder.race)
    : "—";

  return (
    <section className="page-banner">
      <button
        className="page-banner-cell page-banner-cell-clickable"
        onClick={() => stats.holder && onPickRecord(stats.holder)}
        title="點擊查看選手詳情"
      >
        <div className="page-banner-label">歷代最速 · All-Time Best</div>
        <div className="page-banner-value page-banner-value-accent">
          {window.fmtTime(window.BEST.overallSec)}
        </div>
        <div className="page-banner-sub">
          {stats.holder ? `${stats.holder.name} · ${stats.holder.year} ${holderRace}` : "—"}
        </div>
      </button>
      <div className="page-banner-cell">
        <div className="page-banner-label">平均完賽 · Average Finish</div>
        <div className="page-banner-value">{window.fmtTime(stats.avgSec)}</div>
        <div className="page-banner-sub">{window.RANKINGS.length} 筆紀錄平均</div>
      </div>
      <div className="page-banner-cell">
        <div className="page-banner-label">跨越年份 · Years Covered</div>
        <div className="page-banner-value">
          {stats.yMin}<span className="page-banner-dash">–</span>{stats.yMax}
        </div>
        <div className="page-banner-sub">橫跨 {stats.yMax - stats.yMin + 1} 年</div>
      </div>
      <div className="page-banner-cell">
        <div className="page-banner-label">收錄賽事 · Races</div>
        <div className="page-banner-value">
          {stats.raceCount}<span className="page-banner-unit">場</span>
        </div>
        <div className="page-banner-sub">
          本土 {stats.byRegion.twn} · 海外 {stats.byRegion.intl}
        </div>
      </div>
    </section>
  );
}

function App() {
  const [picked, setPicked] = useState(null);
  const meta = window.RANKINGS_META;

  return (
    <React.Fragment>
      <header className="page-head">
        <div className="page-head-row">
          <div className="page-head-id">
            <div className="page-head-mark" aria-hidden="true">
              <svg viewBox="50 20 104 175" width="28" height="46">
                <path
                  d="M125,24 L131,24 L138,27 L141,31 L145,31 L148,34 L146,39 L142,43 L142,46 L144,49 L145,55 L145,61 L141,64 L141,68 L136,73 L136,77 L137,84 L134,88 L133,96 L131,104 L129,114 L126,122 L124,129 L120,135 L114,142 L111,149 L107,153 L106,161 L106,171 L105,178 L105,183 L99,187 L92,189 L93,184 L91,180 L88,177 L82,171 L75,166 L68,161 L64,155 L63,150 L63,145 L60,141 L60,135 L54,128 L56,125 L58,119 L60,111 L60,105 L62,97 L65,92 L70,82 L77,72 L83,64 L90,55 L93,50 L99,44 L103,36 L108,31 L116,29 Z"
                  fill="none"
                  stroke="#0046A8"
                  strokeWidth="10"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="page-head-titles">
              <h1>台灣女子 226 公里超級鐵人三項 · 歷史排行榜</h1>
              <div className="page-head-en">Taiwan Women&apos;s 226km Full Distance Triathlon · All-Time Ranking</div>
            </div>
          </div>
          <div className="page-head-meta">
            <div><span>資料更新</span><strong>{meta.lastUpdated}</strong></div>
          </div>
        </div>
        <div className="page-head-note">
          <span>{meta.sourceNote}</span>
          <span className="dim">· {meta.sourceNoteEn}</span>
        </div>
      </header>

      <HeroCarousel />



      <main className="page-body">
        <TablePodium onPick={setPicked} mode="page" />
      </main>

      <footer className="page-foot">
        <div>
          <span>© 2026 · 台灣女子 226 公里歷代排行 · Maintained as an open dataset.</span>
        </div>
      </footer>

      <AthleteModal athlete={picked} onClose={() => setPicked(null)} />
    </React.Fragment>
  );
}

function Boot() {
  const [status, setStatus] = useState("loading");
  const [err, setErr] = useState(null);

  useEffect(() => {
    window.RANKINGS_READY
      .then(() => {
        if (window.RANKINGS_LOAD_ERROR) {
          setErr(window.RANKINGS_LOAD_ERROR);
          setStatus("error");
        } else {
          setStatus("ready");
        }
      })
      .catch((e) => { setErr(e); setStatus("error"); });
  }, []);

  if (status === "loading") {
    return (
      <div className="boot-state">
        <div className="boot-state-zh">資料載入中…</div>
        <div className="boot-state-en">Loading rankings.csv…</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="boot-state boot-state-error">
        <div className="boot-state-zh">無法載入 rankings.csv</div>
        <div className="boot-state-en">Failed to load rankings.csv</div>
        <pre className="boot-state-trace">{String(err && err.message || err)}</pre>
        <div className="boot-state-hint">
          若你用 file:// 直接開啟，請改用本機 HTTP 伺服器：<br/>
          <code>python3 -m http.server 8000</code>
        </div>
      </div>
    );
  }
  return <App />;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Boot />);
