const encoder = new TextEncoder();
const siteMarker = "Source : site Mara Pastel";
const maxBodyBytes = 1024 * 1024;
const text = (body, status = 200) => new Response(body, { status });

async function validSignature(bytes, header, appSecret) {
  const hex = /^sha256=([a-f0-9]{64})$/i.exec(header || "")?.[1];
  if (!hex) return false;
  const signature = Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, bytes);
}

function incomingSiteMessages(payload, phoneId) {
  if (payload?.object !== "whatsapp_business_account") return [];
  const records = new Map();

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const account = change.value;
      if (change.field !== "messages" || account?.metadata?.phone_number_id !== phoneId) continue;
      for (const message of account.messages || []) {
        const body = message.text?.body;
        if (message.type !== "text" || typeof body !== "string") continue;
        if (!body.split(/\r?\n/).some((line) => line.trim() === siteMarker)) continue;
        if (typeof message.id !== "string" || !message.id || !/^\d{5,20}$/.test(message.from)) continue;
        const timestamp = new Date(Number(message.timestamp) * 1000);
        if (!Number.isFinite(timestamp.getTime())) continue;
        records.set(message.id, {
          message_id: message.id,
          sender: message.from,
          received_at: timestamp.toISOString(),
          body
        });
      }
    }
  }
  return [...records.values()];
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const query = new URL(request.url).searchParams;
    const verifyToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
    const challenge = query.get("hub.challenge");
    if (verifyToken && query.get("hub.mode") === "subscribe" &&
      query.get("hub.verify_token") === verifyToken && challenge) return text(challenge);
    return text("Forbidden", 403);
  }

  if (request.method !== "POST") return text("Method not allowed", 405);
  const appSecret = Deno.env.get("META_APP_SECRET");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const project = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!appSecret || !phoneId || !project || !serviceRole) return text("Webhook not configured", 503);

  if (Number(request.headers.get("content-length")) > maxBodyBytes) return text("Payload too large", 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBodyBytes) return text("Payload too large", 413);
  if (!await validSignature(bytes, request.headers.get("x-hub-signature-256"), appSecret)) {
    return text("Forbidden", 403);
  }

  let records;
  try {
    records = incomingSiteMessages(JSON.parse(new TextDecoder().decode(bytes)), phoneId);
  } catch {
    return text("Invalid payload", 400);
  }
  if (!records.length) return text("OK");

  try {
    const result = await fetch(`${project}/rest/v1/mara_inbox?on_conflict=message_id`, {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify(records),
      signal: AbortSignal.timeout(8000)
    });
    return result.ok ? text("OK") : text("Storage unavailable", 502);
  } catch {
    return text("Storage unavailable", 502);
  }
});
