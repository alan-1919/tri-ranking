// modal.jsx — AthleteModal: portal-rendered detail view triggered by row click.
// Exposes window.AthleteModal.

const { useEffect } = React;

function AthleteModal({ athlete, onClose }) {
  useEffect(() => {
    if (!athlete) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [athlete, onClose]);

  if (!athlete) return null;

  const race = window.RACES[athlete.race] || { zh: athlete.race, en: athlete.raceEn || athlete.race, region: athlete.country };
  const segs = [
    { key: "swim", labelZh: "游泳",     labelEn: "Swim",     sec: athlete.swimSec, dist: "3.8km",  paceLeg: "swim", color: "#0046A8" },
    { key: "t1",   labelZh: "T1",       labelEn: "T1",       sec: athlete.t1Sec,   dist: null,     paceLeg: null,   color: "#A3B8D6" },
    { key: "bike", labelZh: "自行車",    labelEn: "Bike",     sec: athlete.bikeSec, dist: "180km",  paceLeg: "bike", color: "#001E5C" },
    { key: "t2",   labelZh: "T2",       labelEn: "T2",       sec: athlete.t2Sec,   dist: null,     paceLeg: null,   color: "#A3B8D6" },
    { key: "run",  labelZh: "跑步",      labelEn: "Run",      sec: athlete.runSec,  dist: "42.2km", paceLeg: "run",  color: "#3D6FBF" },
  ];
  const totalSec = athlete.overallSec ?? segs.reduce((s, x) => s + (x.sec ?? 0), 0);

  const modal = (
    <div className="am-backdrop" onClick={onClose}>
      <div className="am-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="am-close" onClick={onClose} aria-label="Close">×</button>

        {/* Header */}
        <div className="am-head">
          <div className="am-rank">
            <span className="am-rank-num">{String(athlete.rank).padStart(2, "0")}</span>
            <span className="am-rank-label">All-time<br/>歷代排名</span>
          </div>
          <window.Portrait athlete={athlete} size="xl" />
          <div className="am-id">
            <div className="am-name-zh">{athlete.name}</div>
            <div className="am-name-en">{athlete.nameEn} <span className="am-nat">· {athlete.country}</span></div>
            {athlete.notes ? <div className="am-notes">{athlete.notes}</div> : null}
            {athlete.bio ? <p className="am-bio">{athlete.bio}</p> : <p className="am-bio am-bio-empty">選手介紹待補 · Bio pending</p>}
          </div>
          <div className="am-total">
            <div className="am-total-label">個人最佳 / Personal Best</div>
            <div className="am-total-time">{window.fmtTime(totalSec)}</div>
            <div className="am-total-meta">
              {race.zh} <span className="am-dot">·</span> {athlete.year}
            </div>
          </div>
        </div>

        {/* Splits chart */}
        <section className="am-section">
          <header className="am-section-head">
            <span className="am-section-zh">分段時間 · Splits</span>
            <span className="am-section-en">Bars are proportional to time</span>
          </header>
          <div className="am-bar-wrap" role="img" aria-label="Splits proportional bar">
            {segs.map((s) => {
              if (!s.sec) return null;
              const pct = (s.sec / totalSec) * 100;
              return (
                <div key={s.key} className="am-bar-seg" style={{ width: `${pct}%`, background: s.color }}>
                  {pct > 5 ? <span className="am-bar-label">{s.labelEn}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="am-splits-grid">
            {segs.map((s) => (
              <div key={s.key} className={`am-split ${s.sec ? "" : "am-split-empty"}`}>
                <div className="am-split-dot" style={{ background: s.color }}></div>
                <div className="am-split-key">
                  <div className="am-split-zh">{s.labelZh}</div>
                  <div className="am-split-en">{s.labelEn}{s.dist ? ` · ${s.dist}` : ""}</div>
                </div>
                <div className="am-split-time">{window.fmtTime(s.sec)}</div>
                <div className="am-split-pace">
                  {s.paceLeg && s.sec ? window.fmtPaceFor(s.paceLeg, s.sec) : ""}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Race / source */}
        <section className="am-section">
          <header className="am-section-head">
            <span className="am-section-zh">賽事資料 · Race</span>
          </header>
          <dl className="am-meta-grid">
            <div><dt>賽事 Race</dt><dd>{race.zh} <span className="am-sub">{race.en}</span></dd></div>
            <div><dt>年份 Year</dt><dd>{athlete.year}</dd></div>
            <div><dt>地區 Region</dt><dd>{race.region}</dd></div>
            <div><dt>當日總名次 Overall pos.</dt><dd>{athlete.overallPos ?? "—"}</dd></div>
            <div><dt>資料來源 Source</dt><dd>
              {athlete.source
                ? <a href={athlete.source} target="_blank" rel="noopener noreferrer">{athlete.sourceLabel || athlete.source}</a>
                : <span className="am-sub">資料來源待補 · pending</span>}
            </dd></div>
          </dl>
        </section>

        <footer className="am-foot">
          <span>所有時間以官方賽事成績為準 · Times per official race results.</span>
          <span>按 Esc 關閉 · Press Esc to close</span>
        </footer>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

window.AthleteModal = AthleteModal;
