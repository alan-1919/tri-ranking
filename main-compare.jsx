// main-compare.jsx — mount the canvas with three artboards.
// Waits for window.RANKINGS_READY before mounting.

const { useState, useEffect } = React;
const { DesignCanvas, DCSection, DCArtboard } = window;

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
          </div>
        </div>
        <div className="page-head-note">
          <span>{meta.sourceNote}</span>
          <span className="dim">· {meta.sourceNoteEn}</span>
        </div>
      </header>

      <DesignCanvas>
        <DCSection
          id="rankings"
          title="排行榜版面比較 · Ranking Layout Variations"
          subtitle="三種呈現方式 — 點擊任一畫板進入聚焦模式，可實際使用排序 / 篩選 / 點列開啟詳情。"
        >
          <DCArtboard id="va-dense"   label="A · 高密度數據表 · Dense Stats"        width={1320} height={1100}>
            <TableDense onPick={setPicked} />
          </DCArtboard>
          <DCArtboard id="vb-podium"  label="B · 頒獎台 + 表格 · Podium"            width={1320} height={1280}>
            <TablePodium onPick={setPicked} />
          </DCArtboard>
          <DCArtboard id="vc-bars"    label="C · 分段比例條 · Split-bar Pacing"      width={1320} height={1180}>
            <TableSplitBars onPick={setPicked} />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

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
