// admin.jsx — 階段 1：純前端 CSV 編輯器
// - 從 rankings.csv fetch 讀進來
// - 表格 UI 編輯（每格一個 input）
// - 新增/刪除列
// - 下載修改後的 CSV（補時間前導零 + BOM）
//
// 階段 2 才接 GitHub OAuth + 直接 commit。

const { useState, useEffect, useMemo, useRef } = React;

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

// ─── 通用 GitHub Contents API helper（讀 SHA + PUT 任何檔案） ────────
// 一個檔案的 PUT 流程：
//   1) GET /contents/<path>?ref=<branch> → 拿 sha（檔案不存在會 404 → 回 null）
//   2) PUT /contents/<path>，body 帶 { message, content(base64), sha?, branch }
//      sha 有給代表「更新現有檔」、沒給代表「新增檔案」
async function getFileSha(token, path) {
  const { owner, repo, branch } = CFG.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
  });
  if (resp.status === 404) return null; // 檔案不存在 → 之後 PUT 不帶 sha 即可
  if (!resp.ok) throw new Error(`讀 ${path} SHA 失敗 HTTP ${resp.status}`);
  return resp.json();
}

async function putFile(token, path, contentString, commitMessage, sha) {
  const { owner, repo, branch } = CFG.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: commitMessage,
    content: utf8ToBase64(contentString),
    branch,
  };
  if (sha) body.sha = sha;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || `PUT ${path} 失敗 HTTP ${resp.status}`);
  return data;
}

// CSV 專用 wrapper（保留語意 + 不破壞既有呼叫）
async function getCsvSha(token) {
  const { csvPath } = CFG.github;
  const meta = await getFileSha(token, csvPath);
  if (!meta) throw new Error(`找不到 ${csvPath}（可能尚未 commit 到 repo）`);
  return meta;
}
async function putCsv(token, sha, csvWithBom, commitMessage) {
  return putFile(token, CFG.github.csvPath, csvWithBom, commitMessage, sha);
}

function nowTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── 圖片上傳（給 BannerThumb 用） ─────────────────────────
// 限制：GitHub Contents API 對 PUT 檔案 < 1 MB 最穩，> 5 MB 直接擋掉
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_ACCEPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function bytesToBase64(bytes) {
  // 分塊處理避免 String.fromCharCode 超過引數上限
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function sanitizeFilename(name) {
  const base = String(name || "").split("/").pop().split("\\").pop();
  // 只留 word + 點 + 連字號；空白與 CJK 全轉底線；最多砍開頭結尾的底線
  return base.replace(/[^\w.\-]+/g, "_").replace(/^_+|_+$/g, "") || "image";
}

async function uploadBannerImage(token, file) {
  if (!file) throw new Error("沒有檔案");
  if (!UPLOAD_ACCEPT_TYPES.includes(file.type)) {
    throw new Error(`不支援的檔案類型 ${file.type || "(未知)"}；請用 PNG / JPG / WebP / GIF`);
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`檔案 ${mb} MB 超過上限 5 MB；請先壓縮再上傳`);
  }

  const safe = sanitizeFilename(file.name);
  let path = `images/banners/${safe}`;

  // 若同名已存在 → 自動加時間 suffix 避免覆蓋
  const existing = await getFileSha(token, path);
  if (existing) {
    const dotIdx = safe.lastIndexOf(".");
    const base = dotIdx > 0 ? safe.slice(0, dotIdx) : safe;
    const ext = dotIdx > 0 ? safe.slice(dotIdx) : "";
    const ts = Date.now().toString(36);
    path = `images/banners/${base}-${ts}${ext}`;
  }

  const buf = await file.arrayBuffer();
  const base64 = bytesToBase64(new Uint8Array(buf));

  const { owner, repo, branch } = CFG.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: `後台上傳 banner 圖：${path}`,
      content: base64,
      branch,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.message || `上傳失敗 HTTP ${resp.status}`);
  return path;
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
  // tab 切換
  const [activeTab, setActiveTab] = useState("rankings"); // rankings | banners

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

      <nav className="adm-tabs" role="tablist">
        <button
          className={`adm-tab ${activeTab === "rankings" ? "is-active" : ""}`}
          onClick={() => setActiveTab("rankings")}
          role="tab"
          aria-selected={activeTab === "rankings"}
        >
          排行榜
        </button>
        <button
          className={`adm-tab ${activeTab === "banners" ? "is-active" : ""}`}
          onClick={() => setActiveTab("banners")}
          role="tab"
          aria-selected={activeTab === "banners"}
        >
          Banner 管理
        </button>
      </nav>

      {activeTab === "banners" && (
        <BannerEditor auth={auth} />
      )}

      {activeTab === "rankings" && (
      <React.Fragment>
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
      )}
    </React.Fragment>
  );
}

// ──────────────────────────────────────────────────────────────────
// BannerEditor — 編輯 banners.json
// 跟 rankings 共用同一個登入 token 與 GitHub API helper。
// ──────────────────────────────────────────────────────────────────
function genSlideId() {
  return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function defaultBanners() {
  return { config: { autoplay: true, intervalMs: 5000 }, slides: [] };
}

// ─── BannerThumb：縮圖區塊，可拖檔 / 點擊上傳 ──────────────────
function BannerThumb({ slide, auth, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);

  async function handleFile(file) {
    if (!file) return;
    setError(null);
    if (auth.phase !== "authed") {
      setError("請先用 GitHub 登入");
      return;
    }
    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) { setError("Session 過期，請重新登入"); return; }

    setUploading(true);
    try {
      const path = await uploadBannerImage(token, file);
      onUploaded(path);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  function onDragEnter(e) {
    if (!e.dataTransfer.types?.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function onDragOver(e) {
    if (!e.dataTransfer.types?.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }
  function onDragLeave(e) {
    e.stopPropagation();
    setDragOver(false);
  }
  function onDrop(e) {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }
  function onClick() {
    if (uploading) return;
    inputRef.current?.click();
  }
  function onFilePicked(e) {
    handleFile(e.target.files?.[0]);
    e.target.value = ""; // 重置；同檔再選一次也能觸發 change
  }

  const cls = [
    "adm-banner-thumb",
    "adm-banner-thumb-drop",
    uploading ? "is-uploading" : "",
    dragOver ? "is-drag-over" : "",
    !slide.image ? "is-empty" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="adm-banner-thumb-wrap">
      <div
        className={cls}
        onClick={onClick}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        title={uploading ? "上傳中" : "點擊或拖檔上傳圖片"}
      >
        {slide.image
          ? <img src={slide.image} alt="" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
          : <span className="adm-banner-thumb-empty">拖檔 / 點擊<br/>上傳圖片</span>}

        <div className="adm-banner-thumb-overlay">
          {uploading ? "⏳ 上傳中…" : "↑ 換圖"}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT_TYPES.join(",")}
          hidden
          onChange={onFilePicked}
        />
      </div>
      {error && <div className="adm-banner-thumb-error" title={error}>{error}</div>}
    </div>
  );
}

function BannerEditor({ auth }) {
  const [data, setData] = useState(null);
  const [originalJson, setOriginalJson] = useState("");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [save, setSave] = useState({ phase: "idle", message: null });
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);

  // 載入 banners.json（不存在 → 視為空配置，下次儲存會建立檔案）
  useEffect(() => {
    fetch("banners.json", { cache: "no-cache" })
      .then((r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (text == null) {
          setData(defaultBanners());
          setOriginalJson("");
          setStatus("ready");
          return;
        }
        setOriginalJson(text);
        try {
          const j = JSON.parse(text);
          // 補預設值，避免 null
          if (!j.config) j.config = { autoplay: true, intervalMs: 5000 };
          if (!Array.isArray(j.slides)) j.slides = [];
          // 補 id
          j.slides.forEach((s) => { if (!s.id) s.id = genSlideId(); });
          setData(j);
        } catch (e) {
          setError(`banners.json 解析失敗：${e.message}`);
          setData(defaultBanners());
        }
        setStatus("ready");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  }, []);

  // 標準化輸出格式（排序欄位、移除 undefined、整齊縮排）
  const buildJson = (d) => {
    const config = {
      autoplay: !!d.config?.autoplay,
      intervalMs: Math.max(2000, Number(d.config?.intervalMs) || 5000),
    };
    const slides = (d.slides || []).map((s) => ({
      id: s.id || genSlideId(),
      image: s.image || "",
      title: s.title || "",
      subtitle: s.subtitle || "",
      alt: s.alt || "",
      link: s.link || "",
    }));
    return JSON.stringify({ config, slides }, null, 2) + "\n";
  };

  const dirty = useMemo(() => {
    if (!data) return false;
    // originalJson 為空字串代表檔案原本不存在，有新增任何內容就算 dirty
    if (!originalJson) return (data.slides || []).length > 0;
    return buildJson(data) !== originalJson;
  }, [data, originalJson]);

  // ── 編輯 handlers ─────────────────────────────────────────────
  function updateConfig(key, value) {
    setData((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  }
  function updateSlide(idx, key, value) {
    setData((prev) => {
      const next = { ...prev, slides: prev.slides.slice() };
      next.slides[idx] = { ...next.slides[idx], [key]: value };
      return next;
    });
  }
  function addSlide() {
    setData((prev) => ({
      ...prev,
      slides: [
        ...prev.slides,
        { id: genSlideId(), image: "", title: "", subtitle: "", alt: "", link: "" },
      ],
    }));
  }
  function deleteSlide(idx) {
    const s = data.slides[idx];
    const label = s.title || s.image || `第 ${idx + 1} 張`;
    if (!window.confirm(`刪除 banner「${label}」？`)) return;
    setData((prev) => ({ ...prev, slides: prev.slides.filter((_, i) => i !== idx) }));
  }
  function handleReset() {
    if (!window.confirm("捨棄所有未儲存的修改？")) return;
    if (!originalJson) {
      setData(defaultBanners());
    } else {
      try {
        const j = JSON.parse(originalJson);
        if (!j.config) j.config = { autoplay: true, intervalMs: 5000 };
        if (!Array.isArray(j.slides)) j.slides = [];
        j.slides.forEach((s) => { if (!s.id) s.id = genSlideId(); });
        setData(j);
      } catch {
        setData(defaultBanners());
      }
    }
  }

  // ── 拖曳 ─────────────────────────────────────────────────────
  function onDragStart(e, idx) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }
  function onDragOver(e, idx) {
    if (dragIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  }
  function onDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }
  function onDrop(e, targetIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { onDragEnd(); return; }
    setData((prev) => {
      const arr = prev.slides.slice();
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(targetIdx, 0, moved);
      return { ...prev, slides: arr };
    });
    onDragEnd();
  }

  // ── 儲存 ─────────────────────────────────────────────────────
  async function handleSave() {
    if (auth.phase !== "authed") return;
    if (!dirty) {
      setSave({ phase: "idle", message: "沒有變更可儲存" });
      return;
    }
    if (!window.confirm(`即將提交 banners.json 到 ${CFG.github.owner}/${CFG.github.repo}@${CFG.github.branch}，確定？`)) return;

    const token = sessionStorage.getItem(SESSION_KEY);
    if (!token) {
      setSave({ phase: "error", message: "session 過期，請重新登入" });
      return;
    }

    setSave({ phase: "saving", message: "讀取目前版本…" });
    try {
      const meta = await getFileSha(token, "banners.json"); // 不存在會回 null
      const newJson = buildJson(data);
      const message = `後台更新 banners.json：${nowTimestamp()} by ${auth.user.login}`;
      setSave({ phase: "saving", message: "送出 commit…" });
      const result = await putFile(token, "banners.json", newJson, message, meta?.sha);
      setOriginalJson(newJson);
      const sha7 = (result.commit?.sha || "").slice(0, 7);
      const htmlUrl = result.commit?.html_url;
      setSave({ phase: "success", message: `已 commit ${sha7}`, url: htmlUrl });
    } catch (e) {
      setSave({ phase: "error", message: e.message });
    }
  }

  // ── 渲染 ─────────────────────────────────────────────────────
  if (status === "loading") {
    return <div className="adm-status"><div className="adm-status-zh">載入 banners.json…</div></div>;
  }
  if (status === "error") {
    return (
      <div className="adm-status adm-status-error">
        <div className="adm-status-zh">無法載入 banners.json</div>
        <pre className="adm-status-trace">{String(error)}</pre>
      </div>
    );
  }

  const slides = data.slides || [];

  return (
    <React.Fragment>
      <div className="adm-toolbar">
        <div className="adm-toolbar-left">
          <button className="adm-btn" onClick={addSlide}>＋ 新增 Banner</button>
          <button className="adm-btn adm-btn-secondary" onClick={handleReset} disabled={!dirty}>
            捨棄修改
          </button>
        </div>
        <div className="adm-toolbar-right">
          <span className={`adm-dirty ${dirty ? "is-dirty" : ""}`}>
            {dirty ? `● 未儲存的修改` : `○ 未修改`}
          </span>
          <button
            className="adm-btn adm-btn-primary"
            onClick={handleSave}
            disabled={auth.phase !== "authed" || !dirty || save.phase === "saving"}
            title={auth.phase !== "authed" ? "登入後才能儲存" : (!dirty ? "沒有變更" : "提交 commit")}
          >
            {save.phase === "saving" ? "⏳ 儲存中…" : "✓ 儲存到 GitHub"}
          </button>
        </div>
      </div>

      <SaveBanner save={save} onDismiss={() => setSave({ phase: "idle", message: null })} />

      {error && (
        <div className="adm-banner-warn">⚠ {error}</div>
      )}

      <div className="adm-banner-config">
        <label className="adm-banner-cfg-item">
          <input
            type="checkbox"
            checked={!!data.config?.autoplay}
            onChange={(e) => updateConfig("autoplay", e.target.checked)}
          />
          自動播放
        </label>
        <label className="adm-banner-cfg-item">
          切換間隔（ms）
          <input
            type="number"
            min={2000}
            max={20000}
            step={500}
            value={data.config?.intervalMs ?? 5000}
            onChange={(e) => updateConfig("intervalMs", Number(e.target.value))}
          />
          <span className="adm-banner-cfg-hint">
            ≈ {((Number(data.config?.intervalMs) || 5000) / 1000).toFixed(1)} 秒
          </span>
        </label>
      </div>

      {slides.length === 0 ? (
        <div className="adm-empty" style={{ padding: "60px 20px" }}>
          尚無 Banner — 點上方「＋ 新增 Banner」開始
        </div>
      ) : (
        <ul className="adm-banner-list">
          {slides.map((s, i) => {
            const isDrag = dragIdx === i;
            const isOver = dragOverIdx === i && dragIdx !== null && dragIdx !== i;
            return (
              <li
                key={s.id || i}
                className={`adm-banner-item ${isDrag ? "is-dragging" : ""} ${isOver ? "is-drag-over" : ""}`}
                onDragOver={(e) => onDragOver(e, i)}
                onDrop={(e) => onDrop(e, i)}
              >
                <span
                  className="adm-banner-drag"
                  title="拖曳排序"
                  draggable
                  onDragStart={(e) => onDragStart(e, i)}
                  onDragEnd={onDragEnd}
                >⋮⋮</span>

                <BannerThumb
                  slide={s}
                  auth={auth}
                  onUploaded={(path) => updateSlide(i, "image", path)}
                />

                <div className="adm-banner-fields">
                  <label className="adm-banner-field adm-banner-field-image">
                    <span>圖片路徑</span>
                    <input
                      type="text"
                      value={s.image}
                      placeholder="images/banners/xxx.png"
                      onChange={(e) => updateSlide(i, "image", e.target.value)}
                    />
                  </label>
                  <label className="adm-banner-field">
                    <span>標題</span>
                    <input
                      type="text"
                      value={s.title}
                      placeholder="（留空 = 不顯示文字）"
                      onChange={(e) => updateSlide(i, "title", e.target.value)}
                    />
                  </label>
                  <label className="adm-banner-field">
                    <span>副標題</span>
                    <input
                      type="text"
                      value={s.subtitle}
                      placeholder="（可空）"
                      onChange={(e) => updateSlide(i, "subtitle", e.target.value)}
                    />
                  </label>
                  <label className="adm-banner-field">
                    <span>連結（可空）</span>
                    <input
                      type="text"
                      value={s.link}
                      placeholder="https://..."
                      onChange={(e) => updateSlide(i, "link", e.target.value)}
                    />
                  </label>
                  <label className="adm-banner-field">
                    <span>Alt 文字</span>
                    <input
                      type="text"
                      value={s.alt}
                      placeholder="（無障礙描述，可空）"
                      onChange={(e) => updateSlide(i, "alt", e.target.value)}
                    />
                  </label>
                </div>

                <button
                  className="adm-delete-btn adm-banner-del"
                  onClick={() => deleteSlide(i)}
                  title="刪除這張 banner"
                >✕</button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="adm-foot">
        <div>共 {slides.length} 張 banner</div>
        <div className="adm-foot-hint">
          階段 B：可直接編輯文字、新增、刪除、拖曳排序。階段 C 會加上「拖檔上傳圖片」。
        </div>
      </footer>
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById("admin-root"));
root.render(<App />);
