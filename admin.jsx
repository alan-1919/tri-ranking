// admin.jsx — 階段 1：純前端 CSV 編輯器
// - 從 rankings.csv fetch 讀進來
// - 表格 UI 編輯（每格一個 input）
// - 新增/刪除列
// - 下載修改後的 CSV（補時間前導零 + BOM）
//
// 階段 2 才接 GitHub OAuth + 直接 commit。

const { useState, useEffect, useMemo } = React;

const COLUMNS = [
  { key: "rank",          label: "#",            width: 56,  hint: "排名（依總成績升序）" },
  { key: "name",          label: "姓名",          width: 110, hint: "中文姓名" },
  { key: "country",       label: "國",            width: 60,  hint: "ISO 三字代碼，預設 TWN" },
  { key: "race",          label: "賽事",          width: 130, hint: "賽事代號（需在 data.js 對應）" },
  { key: "year",          label: "年",            width: 64,  hint: "西元年" },
  { key: "swim",          label: "Swim",         width: 96,  hint: "HH:MM:SS" },
  { key: "t1",            label: "T1",           width: 96,  hint: "HH:MM:SS（可空）" },
  { key: "bike",          label: "Bike",         width: 96,  hint: "HH:MM:SS" },
  { key: "t2",            label: "T2",           width: 96,  hint: "HH:MM:SS（可空）" },
  { key: "run",           label: "Run",          width: 96,  hint: "HH:MM:SS" },
  { key: "overall",       label: "總成績",        width: 100, hint: "HH:MM:SS（影響排序）" },
  { key: "overall_pos",   label: "當日總排",      width: 80,  hint: "整數（可空）" },
  { key: "notes",         label: "備註標籤",      width: 160, hint: "例：退役 · Retired" },
  { key: "bio",           label: "簡介",          width: 240, hint: "Modal 內顯示的選手簡介" },
  { key: "source",        label: "Source URL",   width: 220, hint: "來源連結" },
  { key: "source_label",  label: "Source 標籤",  width: 110, hint: "例：Bravelog" },
  { key: "photo",         label: "Photo 路徑",   width: 220, hint: "例：images/athletes/li.jpg" },
];

const TIME_COLS = ["swim", "t1", "bike", "t2", "run", "overall"];

// ───── helpers ─────────────────────────────────────────────────
function padTime(s) {
  if (!s || String(s).includes("--")) return s || "";
  const parts = String(s).split(":");
  if (parts.length !== 3) return s;
  try {
    return parts.map((p) => p.padStart(2, "0")).join(":");
  } catch {
    return s;
  }
}

function hmsToSec(s) {
  if (!s || String(s).includes("--")) return null;
  const parts = String(s).split(":");
  if (parts.length !== 3) return null;
  const [h, m, sec] = parts.map((n) => parseInt(n, 10));
  if ([h, m, sec].some(isNaN)) return null;
  return h * 3600 + m * 60 + sec;
}

function buildCSV(rows) {
  // 補時間前導零
  const normalized = rows.map((r) => {
    const out = { ...r };
    TIME_COLS.forEach((c) => {
      out[c] = padTime(out[c] || "");
    });
    return out;
  });

  const esc = (s) => {
    const v = String(s ?? "");
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  };
  const header = COLUMNS.map((c) => c.key).join(",");
  const lines = normalized.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(","));
  return header + "\n" + lines.join("\n") + "\n";
}

function downloadCSV(rows) {
  const csv = buildCSV(rows);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rankings.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ───── auth helpers ───────────────────────────────────────────
const CFG = (typeof window !== "undefined" && window.ADMIN_CONFIG) || null;
const SESSION_KEY = "tri_admin_gh_token";
const STATE_KEY = "tri_admin_oauth_state";

function cfgReady() {
  if (!CFG) return false;
  if (!CFG.github?.clientId || CFG.github.clientId.startsWith("TODO")) return false;
  if (!CFG.worker?.url || CFG.worker.url.startsWith("TODO")) return false;
  return true;
}

function randomState() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildLoginUrl() {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CFG.github.clientId,
    redirect_uri: window.location.origin + window.location.pathname,
    scope: CFG.github.scope || "public_repo",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const resp = await fetch(`${CFG.worker.url.replace(/\/$/, "")}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    throw new Error(data.description || data.error || `HTTP ${resp.status}`);
  }
  return data.access_token;
}

async function fetchGitHubUser(token) {
  const resp = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) throw new Error(`GitHub /user 失敗 HTTP ${resp.status}`);
  return resp.json();
}

// UTF-8 字串 ↔ base64（btoa 只吃 latin-1，所以要先過 TextEncoder）
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

async function getCsvSha(token) {
  const { owner, repo, csvPath, branch } = CFG.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${csvPath}?ref=${branch}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (!resp.ok) throw new Error(`讀 CSV SHA 失敗 HTTP ${resp.status}`);
  return resp.json();
}

async function putCsv(token, sha, csvWithBom, commitMessage) {
  const { owner, repo, csvPath, branch } = CFG.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${csvPath}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: commitMessage,
      content: utf8ToBase64(csvWithBom),
      sha,
      branch,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || `PUT 失敗 HTTP ${resp.status}`);
  return data;
}

function nowTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ───── components ─────────────────────────────────────────────
function Cell({ row, col, value, onChange }) {
  return (
    <input
      className={`adm-cell adm-cell-${col.key}`}
      type="text"
      value={value || ""}
      title={col.hint}
      onChange={(e) => onChange(col.key, e.target.value)}
    />
  );
}

function AuthPill({ auth, onLogin, onLogout }) {
  if (auth.phase === "init" || auth.phase === "authing") {
    return <div className="adm-auth-pill adm-auth-loading">⏳ 認證中…</div>;
  }
  if (auth.phase === "authed") {
    return (
      <div className="adm-auth-pill adm-auth-ok">
        {auth.user.avatar_url && (
          <img className="adm-avatar" src={auth.user.avatar_url} alt="" />
        )}
        <span className="adm-auth-name">@{auth.user.login}</span>
        <button className="adm-auth-logout" onClick={onLogout} title="登出">登出</button>
      </div>
    );
  }
  if (auth.phase === "unauthorized") {
    return (
      <div className="adm-auth-pill adm-auth-err">
        <span>無權限：@{auth.user?.login}</span>
        <button className="adm-auth-logout" onClick={onLogout}>登出</button>
      </div>
    );
  }
  if (auth.phase === "error") {
    return (
      <div className="adm-auth-pill adm-auth-err">
        <span title={auth.error}>登入失敗</span>
        <button className="adm-auth-logout" onClick={onLogin}>重試</button>
      </div>
    );
  }
  // anon
  return (
    <button className="adm-btn adm-btn-primary adm-login-btn" onClick={onLogin}>
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      用 GitHub 登入
    </button>
  );
}

function SaveBanner({ save, onDismiss }) {
  if (save.phase === "idle" && !save.message) return null;
  const cls =
    save.phase === "success" ? "adm-save-ok" :
    save.phase === "error" ? "adm-save-err" :
    save.phase === "saving" ? "adm-save-busy" :
    "adm-save-info";
  return (
    <div className={`adm-save-banner ${cls}`}>
      <span>
        {save.phase === "success" && "✓ 已儲存："}
        {save.phase === "error" && "✕ 儲存失敗："}
        {save.phase === "saving" && "⏳ "}
        {save.message}
        {save.url && (
          <a className="adm-save-link" href={save.url} target="_blank" rel="noopener noreferrer">
            查看 commit ↗
          </a>
        )}
      </span>
      {save.phase !== "saving" && (
        <button className="adm-save-dismiss" onClick={onDismiss} title="關閉">×</button>
      )}
    </div>
  );
}

function Row({ row, idx, onChange, onDelete, drag }) {
  const isDragging = drag.draggingIdx === idx;
  const isOver = drag.dragOverIdx === idx && drag.draggingIdx !== null && drag.draggingIdx !== idx;
  const cls = [
    isDragging ? "adm-row-dragging" : "",
    isOver ? "adm-row-drag-over" : "",
  ].filter(Boolean).join(" ");
  return (
    <tr
      className={cls}
      onDragOver={(e) => drag.onDragOver(e, idx)}
      onDragLeave={() => drag.onDragLeave(idx)}
      onDrop={(e) => drag.onDrop(e, idx)}
    >
      <td className="adm-action-cell adm-drag-cell">
        <span
          className="adm-drag-handle"
          title="拖曳重新排序"
          draggable
          onDragStart={(e) => drag.onDragStart(e, idx)}
          onDragEnd={drag.onDragEnd}
        >
          ⋮⋮
        </span>
      </td>
      <td className="adm-action-cell">
        <button
          className="adm-delete-btn"
          onClick={() => onDelete(idx)}
          title="刪除這一列"
        >
          ✕
        </button>
      </td>
      {COLUMNS.map((col) => (
        <td key={col.key} className={`adm-td adm-td-${col.key}`}>
          <Cell row={row} col={col} value={row[col.key]} onChange={(k, v) => onChange(idx, k, v)} />
        </td>
      ))}
    </tr>
  );
}

function App() {
  const [rows, setRows] = useState([]);
  const [originalCsv, setOriginalCsv] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  // 搜尋與篩選
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [raceFilter, setRaceFilter] = useState("ALL");
  const [countryFilter, setCountryFilter] = useState("ALL");
  // 認證
  const [auth, setAuth] = useState({ phase: "init", user: null, error: null });
  //   phase: init / anon / authing / authed / unauthorized / error
  // 儲存
  const [save, setSave] = useState({ phase: "idle", message: null });
  //   phase: idle / saving / success / error
  // 拖曳排序
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // 載入 CSV
  useEffect(() => {
    fetch("rankings.csv", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        setOriginalCsv(text);
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });
        setRows(parsed.data || []);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  }, []);

  // 啟動認證流程：先檢查 ?code 回呼，再檢查 sessionStorage 是否已有 token
  useEffect(() => {
    if (!cfgReady()) {
      setAuth({ phase: "anon", user: null, error: null });
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const stateParam = params.get("state");
    const savedState = sessionStorage.getItem(STATE_KEY);

    async function bootWithCode() {
      // CSRF state 驗證
      if (!savedState || savedState !== stateParam) {
        setAuth({ phase: "error", user: null, error: "OAuth state 不一致（疑似 CSRF），請重新登入" });
        return;
      }
      sessionStorage.removeItem(STATE_KEY);
      setAuth({ phase: "authing", user: null, error: null });
      try {
        const token = await exchangeCodeForToken(code);
        sessionStorage.setItem(SESSION_KEY, token);
        const user = await fetchGitHubUser(token);
        if (!CFG.allowedUsers.includes(user.login)) {
          sessionStorage.removeItem(SESSION_KEY);
          setAuth({ phase: "unauthorized", user, error: `帳號 ${user.login} 不在白名單` });
        } else {
          setAuth({ phase: "authed", user, error: null });
        }
      } catch (e) {
        sessionStorage.removeItem(SESSION_KEY);
        setAuth({ phase: "error", user: null, error: e.message });
      } finally {
        // 清掉 URL 上的 ?code 避免重整時重打
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    async function bootWithSavedToken(token) {
      setAuth({ phase: "authing", user: null, error: null });
      try {
        const user = await fetchGitHubUser(token);
        if (!CFG.allowedUsers.includes(user.login)) {
          sessionStorage.removeItem(SESSION_KEY);
          setAuth({ phase: "unauthorized", user, error: `帳號 ${user.login} 不在白名單` });
        } else {
          setAuth({ phase: "authed", user, error: null });
        }
      } catch (e) {
        sessionStorage.removeItem(SESSION_KEY);
        setAuth({ phase: "anon", user: null, error: null });
      }
    }

    if (code) {
      bootWithCode();
    } else {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) bootWithSavedToken(saved);
      else setAuth({ phase: "anon", user: null, error: null });
    }
  }, []);

  const dirty = useMemo(() => {
    if (status !== "ready") return false;
    return buildCSV(rows) !== originalCsv.replace(/^﻿/, "");
  }, [rows, originalCsv, status]);

  const totalWidth = useMemo(
    () => COLUMNS.reduce((s, c) => s + c.width, 0) + 56 + 36, // + delete col + drag col
    []
  );

  // 唯一年份、賽事、國籍清單（用於篩選 dropdown）
  const uniqueYears = useMemo(() => {
    const s = new Set(rows.map((r) => r.year).filter(Boolean));
    return ["ALL", ...Array.from(s).sort((a, b) => Number(b) - Number(a))];
  }, [rows]);
  const uniqueRaces = useMemo(() => {
    const s = new Set(rows.map((r) => r.race).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const uniqueCountries = useMemo(() => {
    const s = new Set(rows.map((r) => r.country).filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);

  // 套用搜尋與篩選後的「顯示用 rows」；保留原 index 給 onChange / onDelete 用
  const displayedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .map((r, idx) => ({ row: r, idx })) // 保留原 index
      .filter(({ row }) => {
        if (yearFilter !== "ALL" && row.year !== yearFilter) return false;
        if (raceFilter !== "ALL" && row.race !== raceFilter) return false;
        if (countryFilter !== "ALL" && row.country !== countryFilter) return false;
        if (q) {
          // 搜尋：姓名 / 賽事 / 備註 / bio
          const haystack = [row.name, row.race, row.notes, row.bio, row.country]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
  }, [rows, query, yearFilter, raceFilter, countryFilter]);

  const hasActiveFilter =
    query.trim() || yearFilter !== "ALL" || raceFilter !== "ALL" || countryFilter !== "ALL";

  function clearFilters() {
    setQuery("");
    setYearFilter("ALL");
    setRaceFilter("ALL");
    setCountryFilter("ALL");
  }

  function handleChange(idx, key, value) {
    setRows((prev) => {
      const next = prev.slice();
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function handleDelete(idx) {
    const name = rows[idx]?.name || "(空)";
    if (!window.confirm(`確定刪除第 ${idx + 1} 列「${name}」？`)) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleAdd() {
    const empty = {};
    COLUMNS.forEach((c) => (empty[c.key] = ""));
    empty.rank = String(rows.length + 1);
    empty.country = "TWN";
    setRows((prev) => [...prev, empty]);
  }

  function handleReorderByTime() {
    // 依 overall 升序重排，並重編 rank
    const sorted = rows
      .slice()
      .sort((a, b) => (hmsToSec(a.overall) || 9e9) - (hmsToSec(b.overall) || 9e9));
    sorted.forEach((r, i) => {
      r.rank = String(i + 1);
    });
    setRows(sorted);
  }

  // 拖曳排序 ─ 拖曳的是 ⋮⋮ 把手，drop 到目標列就插到那列的位置（上方為主）
  function dragOnStart(e, idx) {
    setDraggingIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx)); // Firefox 需要 setData 才會啟動拖曳
  }
  function dragOnOver(e, idx) {
    if (draggingIdx === null) return;
    e.preventDefault(); // 必要：允許 drop
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }
  function dragOnLeave(idx) {
    if (dragOverIdx === idx) setDragOverIdx(null);
  }
  function dragOnEnd() {
    setDraggingIdx(null);
    setDragOverIdx(null);
  }
  function dragOnDrop(e, targetIdx) {
    e.preventDefault();
    if (draggingIdx === null || draggingIdx === targetIdx) {
      dragOnEnd();
      return;
    }
    setRows((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(draggingIdx, 1);
      next.splice(targetIdx, 0, moved);
      // 自動重編 rank 為 1..N
      next.forEach((r, i) => { r.rank = String(i + 1); });
      return next;
    });
    dragOnEnd();
  }
  const dragApi = {
    draggingIdx,
    dragOverIdx,
    onDragStart: dragOnStart,
    onDragOver: dragOnOver,
    onDragLeave: dragOnLeave,
    onDragEnd: dragOnEnd,
    onDrop: dragOnDrop,
  };

  function handleReset() {
    if (!window.confirm("確定捨棄所有未儲存的修改？")) return;
    const parsed = Papa.parse(originalCsv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    setRows(parsed.data || []);
  }

  function handleLogin() {
    if (!cfgReady()) {
      window.alert("尚未設定 OAuth：請先填好 admin.config.js 與部署 Worker（見 worker/README.md）");
      return;
    }
    window.location.href = buildLoginUrl();
  }

  function handleLogout() {
    sessionStorage.removeItem(SESSION_KEY);
    setAuth({ phase: "anon", user: null, error: null });
    setSave({ phase: "idle", message: null });
  }

  async function handleSave() {
    if (auth.phase !== "authed") return;
    if (!dirty) {
      setSave({ phase: "idle", message: "沒有變更可儲存" });
      return;
    }
    if (!window.confirm(`即將提交 commit 到 ${CFG.github.owner}/${CFG.github.repo}@${CFG.github.branch}，確定？`)) return;

    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      setAuth({ phase: "anon", user: null, error: null });
      setSave({ phase: "error", message: "session 過期，請重新登入" });
      return;
    }

    setSave({ phase: "saving", message: "讀取目前版本…" });
    try {
      const meta = await getCsvSha(token);
      // build CSV with BOM
      const csvWithBom = "﻿" + buildCSV(rows);
      const commitMessage = `後台更新：${nowTimestamp()} by ${auth.user.login}`;
      setSave({ phase: "saving", message: "送出 commit…" });
      const result = await putCsv(token, meta.sha, csvWithBom, commitMessage);
      // 成功後刷新 originalCsv（清掉 dirty 狀態）
      setOriginalCsv(csvWithBom);
      const sha7 = (result.commit?.sha || "").slice(0, 7);
      const htmlUrl = result.commit?.html_url;
      setSave({
        phase: "success",
        message: `已 commit ${sha7}`,
        url: htmlUrl,
      });
    } catch (e) {
      setSave({ phase: "error", message: e.message });
    }
  }

  // ── render ─────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="adm-status">
        <div className="adm-status-zh">資料載入中…</div>
        <div className="adm-status-en">Loading rankings.csv…</div>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="adm-status adm-status-error">
        <div className="adm-status-zh">無法載入 rankings.csv</div>
        <pre className="adm-status-trace">{String(error)}</pre>
        <div className="adm-status-hint">
          請用本機 HTTP 伺服器開啟（在 tri-ranking 資料夾跑：<code>python3 -m http.server 8000</code>），然後瀏覽 <code>http://localhost:8000/admin.html</code>
        </div>
      </div>
    );
  }

  return (
    <React.Fragment>
      <header className="adm-head">
        <div className="adm-head-left">
          <h1 className="adm-title">後台編輯 · Admin</h1>
          <div className="adm-subtitle">台灣女子 226 公里歷代排行</div>
        </div>
        <div className="adm-head-right">
          <AuthPill auth={auth} onLogin={handleLogin} onLogout={handleLogout} />
        </div>
      </header>

      <div className="adm-toolbar">
        <div className="adm-toolbar-left">
          <button className="adm-btn" onClick={handleAdd}>＋ 新增一列</button>
          <button className="adm-btn" onClick={handleReorderByTime}>↕ 依總成績重新排序</button>
          <button className="adm-btn adm-btn-secondary" onClick={handleReset} disabled={!dirty}>
            捨棄修改
          </button>
        </div>
        <div className="adm-toolbar-right">
          <span className={`adm-dirty ${dirty ? "is-dirty" : ""}`}>
            {dirty ? `● 未儲存的修改` : `○ 未修改`}
          </span>
          <button className="adm-btn" onClick={() => downloadCSV(rows)} title="下載修改後的 CSV 檔（不寫入 GitHub）">
            ⬇ 下載 CSV
          </button>
          <button
            className="adm-btn adm-btn-primary"
            onClick={handleSave}
            disabled={auth.phase !== "authed" || !dirty || save.phase === "saving"}
            title={
              auth.phase !== "authed"
                ? "登入後才能直接儲存到 GitHub"
                : !dirty
                ? "沒有可儲存的變更"
                : "提交 commit 到 GitHub"
            }
          >
            {save.phase === "saving" ? "⏳ 儲存中…" : "✓ 儲存到 GitHub"}
          </button>
        </div>
      </div>

      <SaveBanner save={save} onDismiss={() => setSave({ phase: "idle", message: null })} />

      <div className="adm-filter-bar">
        <div className="adm-filter-search">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.4"/>
            <line x1="9.2" y1="9.2" x2="12.5" y2="12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="搜尋姓名 / 賽事 / 國籍 / 備註 / 簡介"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="adm-filter-clear" onClick={() => setQuery("")} title="清除">
              ×
            </button>
          )}
        </div>
        <div className="adm-filter-group">
          <label>年份</label>
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            {uniqueYears.map((y) => (
              <option key={y} value={y}>{y === "ALL" ? "全部" : y}</option>
            ))}
          </select>
        </div>
        <div className="adm-filter-group">
          <label>賽事</label>
          <select value={raceFilter} onChange={(e) => setRaceFilter(e.target.value)}>
            {uniqueRaces.map((r) => (
              <option key={r} value={r}>{r === "ALL" ? "全部" : r}</option>
            ))}
          </select>
        </div>
        <div className="adm-filter-group">
          <label>國</label>
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)}>
            {uniqueCountries.map((c) => (
              <option key={c} value={c}>{c === "ALL" ? "全部" : c}</option>
            ))}
          </select>
        </div>
        {hasActiveFilter && (
          <button className="adm-btn adm-btn-secondary" onClick={clearFilters}>
            清除所有篩選
          </button>
        )}
        <div className="adm-filter-count">
          {hasActiveFilter
            ? `顯示 ${displayedRows.length} / 全部 ${rows.length} 筆`
            : `共 ${rows.length} 筆`}
        </div>
      </div>

      <div className="adm-table-scroll">
        <table className="adm-table" style={{ minWidth: `${totalWidth}px` }}>
          <thead>
            <tr>
              <th className="adm-th adm-th-drag" title="拖曳排序">　</th>
              <th className="adm-th adm-th-action">　</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`adm-th adm-th-${c.key}`} style={{ minWidth: `${c.width}px` }}>
                  <div className="adm-th-label">{c.label}</div>
                  <div className="adm-th-key">{c.key}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(({ row, idx }) => (
              <Row
                key={idx}
                row={row}
                idx={idx}
                onChange={handleChange}
                onDelete={handleDelete}
                drag={dragApi}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="adm-empty">
                  尚無資料 — 點上方「＋ 新增一列」開始
                </td>
              </tr>
            )}
            {rows.length > 0 && displayedRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="adm-empty">
                  沒有符合條件的資料 — <button className="adm-link-btn" onClick={clearFilters}>清除篩選</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="adm-foot">
        <div>
          {hasActiveFilter
            ? `顯示 ${displayedRows.length} / 全部 ${rows.length} 列`
            : `共 ${rows.length} 列`}
        </div>
        <div className="adm-foot-hint">
          {cfgReady()
            ? "✓ 階段 2：登入 GitHub 後可直接一鍵 commit。下載 CSV 仍保留作為備援。"
            : "⚠ 階段 2 未完成：請見 worker/README.md 設定 OAuth + Worker 後填好 admin.config.js"}
        </div>
      </footer>
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("admin-root"));
root.render(<App />);
