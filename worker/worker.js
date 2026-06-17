// Spend Tracker chat proxy — holds the Anthropic key server-side (Worker secret
// CLAUDE_API_KEY). The public dashboard's chat widget POSTs {question, context};
// we call Claude Haiku and return the answer. Key is NEVER exposed to the client.
const MODEL = "claude-haiku-4-5-20251001";

function cors(origin, allowed) {
  const ok = origin && (origin === allowed || origin.endsWith(".github.io"));
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "*";
    const headers = cors(origin, allowed);
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "POST") return new Response("POST only", { status: 405, headers });
    // Lock to the dashboard's origin so a leaked URL can't burn the API budget.
    const okOrigin = origin && (origin === allowed || origin.endsWith(".github.io"));
    if (!okOrigin) return json({ error: "forbidden origin" }, 403, headers);
    if (!env.CLAUDE_API_KEY) return json({ error: "not configured" }, 500, headers);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, headers); }
    const question = (body.question || "").toString().slice(0, 2000);
    const context = (body.context || "").toString().slice(0, 24000);
    if (!question) return json({ error: "no question" }, 400, headers);

    const system = `You are the assistant for "Race Spend Tracker," a 2026 U.S. campaign ad-spending dashboard for a political firm. Answer questions about the spending data concisely and factually, using ONLY the data provided below. If the answer isn't in the data, say so. Amounts are ad spend; "Dem side"/"Rep side" are party totals per race; spenders are PACs/campaigns. Be brief and direct.\n\nDATA:\n${context}`;

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL, max_tokens: 700, system,
          messages: [{ role: "user", content: question }],
        }),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: data.error?.message || "upstream error" }, 502, headers);
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
      return json({ answer: text || "(no answer)" }, 200, headers);
    } catch (e) {
      return json({ error: "request failed" }, 502, headers);
    }
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
