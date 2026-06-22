const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Range",
};

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

    if (!key || key.endsWith("/")) {
      return new Response("Not found", {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    const object = await env.OSRS_CHUNKS.get(key);

    if (!object) {
      return new Response("Not found", {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    const headers = new Headers(CORS_HEADERS);
    headers.set("Cache-Control", CACHE_CONTROL);
    headers.set("Content-Type", key.endsWith(".bin") ? "application/octet-stream" : "application/octet-stream");
    headers.set("ETag", object.httpEtag);

    return new Response(request.method === "HEAD" ? null : object.body, {
      headers,
    });
  },
};
