// admin.config.js — 後台公開設定
//
// 這個檔案會被 commit 進 repo，**只放公開資訊**（client_id、Worker URL、白名單）。
// client_secret 不在這裡——它存在 Cloudflare Worker 的 secret store。
//
// 部署流程見 worker/README.md。
//

window.ADMIN_CONFIG = {
  github: {
    // 從 GitHub OAuth App 取得（settings → developers → OAuth Apps）
    clientId: "Ov23liKb5Gt6wSTFJa1E",

    // 要寫入的 repo
    owner: "kobby0923-tw",
    repo: "tri-ranking",
    branch: "main",

    // 預設要編輯的檔案
    csvPath: "rankings.csv",

    // OAuth scope；用 `public_repo` 已足夠 commit public repo
    scope: "public_repo",
  },

  worker: {
    // Cloudflare Worker base URL，不含尾斜線
    url: "https://tri-admin-oauth.kobby0923.workers.dev",
  },

  // 白名單：只有這些 GitHub 帳號登入後能編輯
  allowedUsers: ["alan-1919", "kobby0923-tw"],
};
