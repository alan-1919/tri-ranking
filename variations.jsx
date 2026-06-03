// variations.jsx — three ranking-table layout variations.
// Exposes: window.TableDense, window.TablePodium, window.TableSplitBars.

const { useState, useMemo } = React;

// ---------- shared portrait (avatar) ----------
// Sizes: sm = 36 (table inline), md = 44 (mobile card), lg = 80 (podium), xl = 120 (modal).
// If athlete.photo is set (e.g., "images/athletes/li-2017.jpg") we render the image.
// Otherwise we render the same striped placeholder used in the Modal.
function Portrait({ athlete, size = "sm" }) {
  const [errored, setErrored] = useState(false);
  const hasPhoto = athlete.photo && !errored;
  const patternId = `pp-${athlete.rank}-${size}`;
  return (
    <div className={`portrait portrait-${size}`} aria-hidden="true">
      {hasPhoto ? (
        <img
          src={athlete.photo}
          alt={athlete.name}
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <svg width="100%" height="100%" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="#f4f4f5"/>
              <line x1="0" y1="0" x2="0" y2="6" stroke="#e4e4e7" strokeWidth="2"/>
            </pattern>
          </defs>
          <rect width="60" height="60" fill={`url(#${patternId})`}/>
        </svg>
      )}
    </div>
  );
}
window.Portrait = Portrait;

// ---------- shared filter/sort hook ----------
function useFilteredRankings() {
  const [query, setQuery] = useState("");
  const [raceFilter, setRaceFilter] = useState("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState("overallSec");
  const [sortDir, setSortDir] = useState("asc");
  const [paceMode, setPaceMode] = useState(false);

  const races = useMemo(() => {
    const s = new Set(window.RANKINGS.map((r) => r.race));
    return ["ALL", ...Array.from(s)];
  }, []);
  const years = useMemo(() => {
    const s = new Set(window.RANKINGS.map((r) => r.year));
    return ["ALL", ...Array.from(s).sort((a, b) => b - a)];
  }, []);

  const filtered = useMemo(() => {
    let arr = window.RANKINGS.slice();
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.nameEn || "").toLowerCase().includes(q)
      );
    }
    if (raceFilter !== "ALL") arr = arr.filter((r) => r.race === raceFilter);
    if (yearFilter !== "ALL") arr = arr.filter((r) => r.year === Number(yearFilter));
    arr.sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [query, raceFilter, yearFilter, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  return {
    query, setQuery,
    raceFilter, setRaceFilter, races,
    yearFilter, setYearFilter, years,
    sortKey, sortDir, handleSort,
    paceMode, setPaceMode,
    filtered,
  };
}

// ---------- shared controls bar ----------
function ControlsBar({ state, dense }) {
  const races = state.races, years = state.years;
  return (
    <div className={`ctl ${dense ? "ctl-dense" : ""}`}>
      <div className="ctl-search">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4"/>
          <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="搜尋選手 · Search athlete"
          value={state.query}
          onChange={(e) => state.setQuery(e.target.value)}
        />
        {state.query && (
          <button className="ctl-clear" onClick={() => state.setQuery("")} aria-label="Clear">×</button>
        )}
      </div>
      <div className="ctl-group">
        <label>賽事 Race</label>
        <select value={state.raceFilter} onChange={(e) => state.setRaceFilter(e.target.value)}>
          {races.map((r) => (
            <option key={r} value={r}>{r === "ALL" ? "全部 / All" : (window.RACES[r]?.zh || r)}</option>
          ))}
        </select>
      </div>
      <div className="ctl-group">
        <label>年份 Year</label>
        <select value={state.yearFilter} onChange={(e) => state.setYearFilter(e.target.value)}>
          {years.map((y) => (
            <option key={y} value={y}>{y === "ALL" ? "全部 / All" : y}</option>
          ))}
        </select>
      </div>
      <div className="ctl-toggle" role="group" aria-label="Time or pace view">
        <button className={!state.paceMode ? "on" : ""} onClick={() => state.setPaceMode(false)}>時間 Time</button>
        <button className={state.paceMode ? "on" : ""} onClick={() => state.setPaceMode(true)}>配速 Pace</button>
      </div>
    </div>
  );
}

// sort-header helper
function SortTh({ keyName, sortKey, sortDir, onSort, children, align = "left", title, className = "" }) {
  const active = sortKey === keyName;
  return (
    <th
      className={`sort-th sort-${align} ${active ? "is-active" : ""} ${className}`.trim()}
      onClick={() => onSort(keyName)}
      title={title || "點擊排序 · click to sort"}
    >
      <span className="sort-th-inner">
        <span className="th-label">{children}</span>
        <span className="sort-arrow">{active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </span>
    </th>
  );
}

// best-cell flag — show subtle marker on personal-best column min
function isBest(row, key) {
  const v = row[key];
  if (v == null) return false;
  return v === window.BEST[key];
}

// pretty cell renderer for a leg
//   leg: "swim" | "bike" | "run" (drives pace formatting), or null for T1/T2 (no pace)
function legCell(row, key, leg, paceMode) {
  const v = row[key];
  if (v == null) return <span className="empty">—</span>;
  if (paceMode && leg) return <span className="num">{window.fmtPaceFor(leg, v)}</span>;
  return <span className="num">{window.fmtTime(v)}</span>;
}

// ====================================================================
// VARIATION A — DENSE STATS TABLE
// ====================================================================
function TableDense({ onPick }) {
  const s = useFilteredRankings();
  return (
    <div className="va-root">
      <header className="va-head">
        <div className="va-eyebrow">VARIATION A · 高密度賽事數據表</div>
        <h2 className="va-title">All-time Top {window.RANKINGS_META.targetCount} · 歷代總排行</h2>
        <p className="va-sub">每位選手以個人最佳成績單筆呈現，可點擊欄頭排序。</p>
      </header>
      <ControlsBar state={s} dense />
      <div className="va-tbl-wrap">
        <table className="va-tbl">
          <thead>
            <tr>
              <SortTh keyName="rank"        sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right">#</SortTh>
              <SortTh keyName="name"        sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort}><span className="th-zh">選手</span><span className="th-en">Athlete</span></SortTh>
              <th className="sort-left"><span className="th-zh">國籍</span><span className="th-en">Nat.</span></th>
              <SortTh keyName="race"        sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort}><span className="th-zh">賽事</span><span className="th-en">Race</span></SortTh>
              <SortTh keyName="year"        sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">年份</span><span className="th-en">Year</span></SortTh>
              <SortTh keyName="swimSec"     sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">游泳</span><span className="th-en">Swim · 3.8km</span></SortTh>
              <SortTh keyName="t1Sec"       sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">T1</span><span className="th-en">Trans-1</span></SortTh>
              <SortTh keyName="bikeSec"     sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">自行車</span><span className="th-en">Bike · 180km</span></SortTh>
              <SortTh keyName="t2Sec"       sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">T2</span><span className="th-en">Trans-2</span></SortTh>
              <SortTh keyName="runSec"      sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">跑步</span><span className="th-en">Run · 42.2km</span></SortTh>
              <SortTh keyName="overallSec"  sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">總成績</span><span className="th-en">Total</span></SortTh>
            </tr>
          </thead>
          <tbody>
            {s.filtered.map((r) => (
              <tr key={r.rank} onClick={() => onPick(r)} className="va-row">
                <td className="num rank-cell">{String(r.rank).padStart(2, "0")}</td>
                <td className="name-cell">
                  <div className="name-zh">{r.name}</div>
                  <div className="name-en">{r.nameEn}</div>
                </td>
                <td><span className="flag-pill">{r.country}</span></td>
                <td className="race-cell">
                  <div className="race-zh">{window.RACES[r.race]?.zh || r.race}</div>
                  <div className="race-en">{window.RACES[r.race]?.en}</div>
                </td>
                <td className="num">{r.year}</td>
                <td className={`num ${isBest(r, "swimSec") ? "best" : ""}`}>{legCell(r, "swimSec", "swim", s.paceMode)}</td>
                <td className="num dim vb-col-trans">{legCell(r, "t1Sec", null, false)}</td>
                <td className={`num ${isBest(r, "bikeSec") ? "best" : ""}`}>{legCell(r, "bikeSec", "bike", s.paceMode)}</td>
                <td className="num dim vb-col-trans">{legCell(r, "t2Sec", null, false)}</td>
                <td className={`num ${isBest(r, "runSec") ? "best" : ""}`}>{legCell(r, "runSec", "run", s.paceMode)}</td>
                <td className={`num total-cell ${isBest(r, "overallSec") ? "best" : ""}`}>{window.fmtTime(r.overallSec)}</td>
              </tr>
            ))}
            {s.filtered.length === 0 && (
              <tr><td colSpan={11} className="empty-row">無符合條件之紀錄 · No matching records</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="va-foot">
        <span>顯示 {s.filtered.length} / {window.RANKINGS.length} 筆 · {s.filtered.length} of {window.RANKINGS.length} shown</span>
        <span>● 標示為該欄全榜最佳 · highlighted = column-best</span>
      </footer>
    </div>
  );
}
window.TableDense = TableDense;

// ====================================================================
// VARIATION B — EDITORIAL PODIUM + TABLE
// ====================================================================
function TablePodium({ onPick, mode = "canvas" }) {
  const s = useFilteredRankings();
  // UI 限制顯示前 N 名（N = META.targetCount）；CSV 可存超過 N 筆，但前端只展示前 N
  const displayLimit = window.RANKINGS_META?.targetCount || 20;
  const visible = s.filtered.slice(0, displayLimit);
  const podium = visible.slice(0, 3);
  const rest = visible.slice(3);
  const isPage = mode === "page";

  return (
    <div className={`vb-root ${isPage ? "vb-page" : ""}`}>
      {!isPage && (
        <header className="vb-head">
          <div className="vb-eyebrow">VARIATION B · 編輯式頒獎台版面</div>
          <h2 className="vb-title">All-time Top {window.RANKINGS_META.targetCount}</h2>
          <p className="vb-sub">前三名以頒獎台凸顯，其餘以舒適表格呈現。</p>
        </header>
      )}

      <ControlsBar state={s} />

      {podium.length === 3 && (
        <div className="vb-podium">
          {podium.map((r, i) => {
            const ords = ["🥇", "🥈", "🥉"];
            const meds = ["#C9A14B", "#9CA3AF", "#A66A3A"];
            return (
              <button key={r.rank} className={`vb-pod vb-pod-${i + 1}`} onClick={() => onPick(r)}>
                <div className="vb-pod-top">
                  <Portrait athlete={r} size="lg" />
                  <div className="vb-pod-top-info">
                    <div className="vb-pod-rank" style={{ color: meds[i] }}>{ords[i]}</div>
                    <div className="vb-pod-name-zh">{r.name}</div>
                    <div className="vb-pod-name-en">{r.nameEn}</div>
                    <div className="vb-pod-time">
                      {window.fmtTime(r.overallSec)}
                      {isBest(r, "overallSec") && <span className="vb-pod-best" title="該欄全榜最佳">●</span>}
                    </div>
                    <div className="vb-pod-meta">
                      <span>{window.RACES[r.race]?.zh || r.race}</span>
                      <span className="dot">·</span>
                      <span>{r.year}</span>
                    </div>
                  </div>
                </div>
                <dl className="vb-pod-splits">
                  <div>
                    <dt>Swim {isBest(r, "swimSec") && <span className="vb-pod-best" title="該欄全榜最佳">●</span>}</dt>
                    <dd>{s.paceMode ? window.fmtPaceFor("swim", r.swimSec) : window.fmtTime(r.swimSec)}</dd>
                  </div>
                  <div>
                    <dt>Bike {isBest(r, "bikeSec") && <span className="vb-pod-best" title="該欄全榜最佳">●</span>}</dt>
                    <dd>{s.paceMode ? window.fmtPaceFor("bike", r.bikeSec) : window.fmtTime(r.bikeSec)}</dd>
                  </div>
                  <div>
                    <dt>Run {isBest(r, "runSec") && <span className="vb-pod-best" title="該欄全榜最佳">●</span>}</dt>
                    <dd>{s.paceMode ? window.fmtPaceFor("run", r.runSec) : window.fmtTime(r.runSec)}</dd>
                  </div>
                </dl>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile card list — hidden on desktop via CSS, shown ≤ 700px */}
      <ul className="vb-cards">
        {rest.map((r) => (
          <li key={r.rank} className="vb-card" onClick={() => onPick(r)}>
            <div className="vb-card-head">
              <div className="vb-card-left">
                <span className="vb-card-rank">{String(r.rank).padStart(2, "0")}</span>
                <Portrait athlete={r} size="md" />
              </div>
              <div className="vb-card-id">
                <div className="vb-card-name">
                  {r.name}
                  <span className="flag-pill sm">{r.country}</span>
                </div>
                {r.nameEn && <div className="vb-card-name-en">{r.nameEn}</div>}
                <div className="vb-card-race">
                  <span>{window.RACES[r.race]?.zh || r.race}</span>
                  <span className="vb-card-race-sep">·</span>
                  <span>{r.year}</span>
                </div>
              </div>
              <div className="vb-card-total">
                <div className={`vb-card-total-time ${isBest(r, "overallSec") ? "best" : ""}`}>
                  {window.fmtTime(r.overallSec)}
                </div>
                <div className="vb-card-total-label">TOTAL</div>
              </div>
            </div>
            <div className="vb-card-splits">
              <div className="vb-card-split">
                <div className="vb-card-split-label">SWIM</div>
                <div className={`vb-card-split-time ${isBest(r, "swimSec") ? "best" : ""}`}>
                  {s.paceMode ? window.fmtPaceFor("swim", r.swimSec) : window.fmtTime(r.swimSec)}
                </div>
              </div>
              <div className="vb-card-split">
                <div className="vb-card-split-label">BIKE</div>
                <div className={`vb-card-split-time ${isBest(r, "bikeSec") ? "best" : ""}`}>
                  {s.paceMode ? window.fmtPaceFor("bike", r.bikeSec) : window.fmtTime(r.bikeSec)}
                </div>
              </div>
              <div className="vb-card-split">
                <div className="vb-card-split-label">RUN</div>
                <div className={`vb-card-split-time ${isBest(r, "runSec") ? "best" : ""}`}>
                  {s.paceMode ? window.fmtPaceFor("run", r.runSec) : window.fmtTime(r.runSec)}
                </div>
              </div>
            </div>
          </li>
        ))}
        {rest.length === 0 && podium.length === 0 && (
          <li className="vb-card vb-card-empty">無符合條件之紀錄 · No matching records</li>
        )}
      </ul>

      <div className="vb-tbl-wrap">
        <table className="vb-tbl">
          <thead>
            <tr>
              <SortTh keyName="rank"       sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right">#</SortTh>
              <SortTh keyName="name"       sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort}><span className="th-zh">選手</span><span className="th-en">Athlete</span></SortTh>
              <SortTh keyName="race"       sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort}><span className="th-zh">賽事</span><span className="th-en">Race · Year</span></SortTh>
              <SortTh keyName="swimSec"    sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">游泳</span><span className="th-en">Swim · 3.8km</span></SortTh>
              <SortTh keyName="t1Sec"      sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right" className="vb-col-trans"><span className="th-zh">T1</span><span className="th-en">Trans-1</span></SortTh>
              <SortTh keyName="bikeSec"    sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">自行車</span><span className="th-en">Bike · 180km</span></SortTh>
              <SortTh keyName="t2Sec"      sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right" className="vb-col-trans"><span className="th-zh">T2</span><span className="th-en">Trans-2</span></SortTh>
              <SortTh keyName="runSec"     sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">跑步</span><span className="th-en">Run · 42.2km</span></SortTh>
              <SortTh keyName="overallSec" sortKey={s.sortKey} sortDir={s.sortDir} onSort={s.handleSort} align="right"><span className="th-zh">總成績</span><span className="th-en">Total</span></SortTh>
            </tr>
          </thead>
          <tbody>
            {rest.map((r) => (
              <tr key={r.rank} onClick={() => onPick(r)}>
                <td className="num rank-cell">{String(r.rank).padStart(2, "0")}</td>
                <td className="name-cell">
                  <div className="name-cell-inner">
                    <Portrait athlete={r} size="sm" />
                    <div className="name-cell-text">
                      <div className="name-zh">{r.name} <span className="flag-pill sm">{r.country}</span></div>
                      <div className="name-en">{r.nameEn}</div>
                    </div>
                  </div>
                </td>
                <td className="race-cell">
                  <div className="race-zh">{window.RACES[r.race]?.zh || r.race} <span className="race-year">{r.year}</span></div>
                  <div className="race-en">{window.RACES[r.race]?.en}</div>
                </td>
                <td className={`num ${isBest(r, "swimSec") ? "best" : ""}`}>{legCell(r, "swimSec", "swim", s.paceMode)}</td>
                <td className="num dim vb-col-trans">{legCell(r, "t1Sec", null, false)}</td>
                <td className={`num ${isBest(r, "bikeSec") ? "best" : ""}`}>{legCell(r, "bikeSec", "bike", s.paceMode)}</td>
                <td className="num dim vb-col-trans">{legCell(r, "t2Sec", null, false)}</td>
                <td className={`num ${isBest(r, "runSec") ? "best" : ""}`}>{legCell(r, "runSec", "run", s.paceMode)}</td>
                <td className={`num total-cell ${isBest(r, "overallSec") ? "best" : ""}`}>{window.fmtTime(r.overallSec)}</td>
              </tr>
            ))}
            {rest.length === 0 && podium.length === 0 && (
              <tr><td colSpan={9} className="empty-row">無符合條件之紀錄 · No matching records</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="vb-foot">
        <span>
          顯示 {visible.length} 名
          {s.filtered.length > displayLimit
            ? ` · 篩選後共 ${s.filtered.length} 筆，未列出後 ${s.filtered.length - displayLimit} 名`
            : ""}
          {" · "}收錄總筆數 {window.RANKINGS.length}
        </span>
        <span>● = 該欄全榜最佳 · column-best</span>
      </footer>
    </div>
  );
}
window.TablePodium = TablePodium;

// ====================================================================
// VARIATION C — SPLIT-BAR PACING VISUALIZATION
// ====================================================================
function TableSplitBars({ onPick }) {
  const s = useFilteredRankings();
  const maxOverall = Math.max(...window.RANKINGS.map((r) => r.overallSec || 0));

  return (
    <div className="vc-root">
      <header className="vc-head">
        <div className="vc-eyebrow">VARIATION C · 分段比例條視覺化</div>
        <h2 className="vc-title">All-time Top {window.RANKINGS_META.targetCount}</h2>
        <p className="vc-sub">每列以比例條呈現游泳 / 自行車 / 跑步的相對時間，便於比較配速策略。</p>
      </header>
      <ControlsBar state={s} dense />

      {/* Column legend */}
      <div className="vc-legend">
        <span><i style={{ background: "#0046A8" }}></i> 游泳 Swim</span>
        <span><i style={{ background: "#A3B8D6" }}></i> T1 / T2</span>
        <span><i style={{ background: "#001E5C" }}></i> 自行車 Bike</span>
        <span><i style={{ background: "#3D6FBF" }}></i> 跑步 Run</span>
        <span className="vc-legend-spacer"></span>
        <span className="vc-legend-axis">
          總長度比例對應最慢上榜成績 · bar length scaled to slowest top-{window.RANKINGS.length}
        </span>
      </div>

      {/* Header strip */}
      <div className="vc-row vc-row-head">
        <div className="vc-h-rank">#</div>
        <div className="vc-h-name">選手 / Athlete</div>
        <div className="vc-h-race">賽事 / Race · Year</div>
        <div className="vc-h-bar">分段比例 / Splits</div>
        <div className="vc-h-total">總成績 / Total</div>
      </div>

      <ol className="vc-list">
        {s.filtered.map((r) => {
          const total = r.overallSec || 0;
          const widthPct = (total / maxOverall) * 100;
          const segs = [
            { sec: r.swimSec, color: "#0046A8" },
            { sec: r.t1Sec,   color: "#A3B8D6" },
            { sec: r.bikeSec, color: "#001E5C" },
            { sec: r.t2Sec,   color: "#A3B8D6" },
            { sec: r.runSec,  color: "#3D6FBF" },
          ];
          return (
            <li key={r.rank} className="vc-row" onClick={() => onPick(r)}>
              <div className="vc-h-rank num">{String(r.rank).padStart(2, "0")}</div>
              <div className="vc-h-name">
                <div className="name-zh">{r.name}</div>
                <div className="name-en">{r.nameEn} <span className="flag-pill sm">{r.country}</span></div>
              </div>
              <div className="vc-h-race">
                <div className="race-zh">{window.RACES[r.race]?.zh || r.race}</div>
                <div className="race-en">{r.year} · {window.RACES[r.race]?.en}</div>
              </div>
              <div className="vc-h-bar">
                <div className="vc-bar-track">
                  <div className="vc-bar-fill" style={{ width: `${widthPct}%` }}>
                    {segs.map((seg, i) => {
                      if (!seg.sec) return null;
                      const pct = (seg.sec / total) * 100;
                      return <div key={i} className="vc-bar-seg" style={{ width: `${pct}%`, background: seg.color }}></div>;
                    })}
                  </div>
                </div>
                <div className="vc-bar-times">
                  <span className={isBest(r, "swimSec") ? "best" : ""}>S {window.fmtTime(r.swimSec)}</span>
                  <span className={isBest(r, "bikeSec") ? "best" : ""}>B {window.fmtTime(r.bikeSec)}</span>
                  <span className={isBest(r, "runSec") ? "best" : ""}>R {window.fmtTime(r.runSec)}</span>
                </div>
              </div>
              <div className={`vc-h-total num ${isBest(r, "overallSec") ? "best" : ""}`}>
                {window.fmtTime(r.overallSec)}
              </div>
            </li>
          );
        })}
        {s.filtered.length === 0 && (
          <li className="empty-row">無符合條件之紀錄 · No matching records</li>
        )}
      </ol>
      <footer className="vc-foot">
        <span>顯示 {s.filtered.length} / {window.RANKINGS.length} 筆</span>
        <span>● = 該欄全榜最佳 · column-best</span>
      </footer>
    </div>
  );
}
window.TableSplitBars = TableSplitBars;
