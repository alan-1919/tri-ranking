// main.jsx — production rankings page (Variation B).
// Waits for window.RANKINGS_READY (CSV fetch) before mounting the table.

const { useState, useEffect, useMemo } = React;

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
              <svg viewBox="0 0 24 24" width="24" height="24">
                <circle cx="12" cy="12" r="11" fill="none" stroke="#0046A8" strokeWidth="1.5"/>
                <path d="M3 12 L21 12 M12 3 L12 21" stroke="#0046A8" strokeWidth="1.2"/>
                <circle cx="12" cy="12" r="3.5" fill="#0046A8"/>
              </svg>
            </div>
            <div className="page-head-titles">
              <h1>台灣女子 226 公里長距離鐵人三項 · 歷代前 20 傑</h1>
              <div className="page-head-en">Taiwan Women&apos;s 226km Long-Course Triathlon · All-Time Top 20</div>
            </div>
          </div>
          <div className="page-head-meta">
            <div><span>資料更新</span><strong>{meta.lastUpdated}</strong></div>
            <div><span>收錄紀錄</span><strong>{meta.recordCount} / {meta.targetCount}</strong></div>
            <div><span>收錄範圍</span><strong>{meta.coverage}</strong></div>
            <div className="page-head-links">
              <a href="about.html">方法說明 · Methodology →</a>
            </div>
          </div>
        </div>
        <div className="page-head-note">
          <span>{meta.sourceNote}</span>
          <span className="dim">· {meta.sourceNoteEn}</span>
        </div>
      </header>

      <main className="page-body">
        <StatsBanner onPickRecord={setPicked} />
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
