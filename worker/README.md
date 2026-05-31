# Cloudflare Worker · GitHub OAuth 代理

這個 Worker 只做一件事：把 GitHub OAuth 回呼來的 `code` 換成 `access_token`。
原因是換 token 時必須帶 **client_secret**，而 client_secret 絕對不能放在前端。

部署完成後你會拿到一個 Worker URL（例：`https://tri-admin-oauth.your-name.workers.dev`），
把這個 URL 填進 `admin.config.js` 的 `worker.url` 就完成接線。

---

## 0. 你需要的帳號

| 服務 | 用途 | 連結 |
| --- | --- | --- |
| Cloudflare（免費方案就夠） | 跑 Worker | <https://dash.cloudflare.com/sign-up> |
| GitHub OAuth App | 提供登入 | （見步驟 1） |

> 兩個都不用付費。Cloudflare Worker 免費方案每天 10 萬次請求，遠遠用不完。

---

## 1. 建立 GitHub OAuth App

1. 開瀏覽器到 <https://github.com/settings/developers> （用 `kobby0923-tw` 帳號登入）
2. 點左邊 **OAuth Apps** → 右上 **New OAuth App**
3. 填寫：

   | 欄位 | 值 |
   | --- | --- |
   | **Application name** | `tri-ranking admin` |
   | **Homepage URL** | `https://kobby0923-tw.github.io/tri-ranking/` |
   | **Application description**（可選） | `後台編輯歷代排行` |
   | **Authorization callback URL** | `https://kobby0923-tw.github.io/tri-ranking/admin.html` |

4. 按 **Register application**
5. 進到 OAuth App 詳細頁，記下兩個值：
   - **Client ID**（公開、可放進 `admin.config.js`）
   - 點 **Generate a new client secret** → 立刻複製這個 **Client secret**（只會出現一次！）

⚠️ Client secret 之後只放在 Cloudflare Worker 的 secret store，**不要 commit 進 repo**。

---

## 2. 部署 Cloudflare Worker

### 方法 A：用網頁 Dashboard（推薦，免裝 CLI）

1. 開 <https://dash.cloudflare.com/> 登入
2. 左側選單 → **Workers & Pages** → **Create**
3. 點 **Create Worker** → 命名例如 `tri-admin-oauth` → **Deploy**
4. 預設 Worker 部署完後，點 **Edit code**
5. 把 `oauth.js` 的內容**整個複製貼上**取代預設範例
6. 右上 **Deploy**
7. 回到 Worker 詳細頁，**Settings → Variables and Secrets** 新增兩筆 **Secret**（不是 plaintext）：

   | Name | Value |
   | --- | --- |
   | `GITHUB_CLIENT_ID` | 步驟 1 拿到的 Client ID |
   | `GITHUB_CLIENT_SECRET` | 步驟 1 拿到的 Client secret |

8. 設定完按 **Save and deploy**
9. 把 Worker URL 記下來（例：`https://tri-admin-oauth.kobby0923-tw.workers.dev`）

### 方法 B：用 Wrangler CLI（如果你熟）

```bash
npm i -g wrangler
wrangler login
cd worker
wrangler init --yes  # 會問要不要產生 wrangler.toml，選 yes
wrangler secret put GITHUB_CLIENT_ID      # 貼上 Client ID
wrangler secret put GITHUB_CLIENT_SECRET  # 貼上 Client secret
wrangler deploy oauth.js --name tri-admin-oauth
```

部署完 Wrangler 會印出 Worker URL。

---

## 3. 驗證 Worker

打開瀏覽器訪問你的 Worker URL（例：`https://tri-admin-oauth.your-name.workers.dev/`），
應該看到：

```json
{"ok":true,"service":"tri-ranking admin oauth"}
```

或在終端機：

```bash
curl https://tri-admin-oauth.your-name.workers.dev/health
```

---

## 4. 把設定填進 admin.config.js

回到專案根目錄打開 `admin.config.js`，填入兩個值：

```js
window.ADMIN_CONFIG = {
  github: {
    clientId: "Iv1.xxxxxxxxxxxxxxxx",          // ← 步驟 1 的 Client ID
    // ...
  },
  worker: {
    url: "https://tri-admin-oauth.xxx.workers.dev",  // ← 步驟 2 的 Worker URL（不含尾斜線）
  },
  // ...
};
```

存檔 → push → 等 GitHub Pages 更新（約 1 分鐘）→ 開 `admin.html` 應該就能用 GitHub 登入了。

---

## 5. 常見問題

| 症狀 | 原因 / 解法 |
| --- | --- |
| 登入後跳回 admin.html，但顯示「換 token 失敗」 | Worker URL 沒填對 / Worker secrets 沒設 / OAuth App callback URL 跟實際網址不一致 |
| CORS error | Worker `ALLOWED_ORIGINS` 沒包含你的網址，把網址加進 `oauth.js` 重新部署 |
| 登入完顯示「無權限」 | 你的 GitHub 帳號不在 `admin.config.js` 的 `allowedUsers` 白名單 |
| 儲存時 403 | OAuth scope 不夠，或你帳號對 repo 沒有寫入權限 |

---

## 6. 安全注意

- `GITHUB_CLIENT_SECRET` 只能存在 Cloudflare Worker secret store
- 任何時候在 repo 內看到 client_secret，請立刻到 GitHub OAuth App 旋轉（Revoke + Generate new）
- Token 在瀏覽器只存 `sessionStorage`，關掉分頁就消失
