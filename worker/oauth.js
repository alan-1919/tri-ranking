// Cloudflare Worker — GitHub OAuth code → access_token exchange
//
// 為什麼需要 Worker：
//   GitHub OAuth 的 code → token 交換必須帶 client_secret，
//   client_secret 不能放在前端（會洩漏給任何瀏覽器看 source）。
//   所以由 Worker 在 server side 代為交換，token 再回傳給瀏覽器。
//
// 必要的 Worker secrets（在 Cloudflare Dashboard 設定）：
//   GITHUB_CLIENT_ID      — 從 GitHub OAuth App 取得
//   GITHUB_CLIENT_SECRET  — 從 GitHub OAuth App 取得（千萬別 commit）
//
// 部署：見同資料夾 README.md
//

const ALLOWED_ORIGINS = [
  "https://kobby0923-tw.github.io",
  "http://localhost:8000",
  "http://localhost:8765",
  "http://localhost:8766",
  "http://127.0.0.1:8000",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "tri-ranking admin oauth" }, 200, origin);
    }

    if (url.pathname !== "/auth") {
      return jsonResponse({ error: "not_found" }, 404, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400, origin);
    }

    const code = body && body.code;
    if (!code || typeof code !== "string") {
      return jsonResponse({ error: "missing_code" }, 400, origin);
    }

    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return jsonResponse({ error: "worker_misconfigured" }, 500, origin);
    }

    let tokenData;
    try {
      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "tri-ranking-admin-worker",
        },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
        }),
      });
      tokenData = await tokenResp.json();
    } catch (e) {
      return jsonResponse({ error: "github_unreachable", detail: String(e) }, 502, origin);
    }

    if (tokenData.error) {
      return jsonResponse(
        { error: tokenData.error, description: tokenData.error_description },
        400,
        origin
      );
    }

    // 只回傳必要欄位
    return jsonResponse(
      {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      },
      200,
      origin
    );
  },
};
