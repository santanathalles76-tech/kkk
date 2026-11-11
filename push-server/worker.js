/*
 * DUDA · servidor de notificações (Cloudflare Workers, plano gratuito)
 *
 * Arquivo único, sem dependências: pode ser colado direto no editor do painel da Cloudflare.
 * Precisa de:
 *   - um banco D1 ligado ao Worker com o nome de variável DB
 *   - um gatilho Cron "* * * * *" (a cada minuto)
 * As chaves de notificação (VAPID) são criadas sozinhas no primeiro acesso e guardadas no D1.
 *
 * Rotas:
 *   GET    /                    status
 *   GET    /vapid-public-key    chave pública para o app assinar as notificações
 *   POST   /subscribe           { deviceId, subscription }
 *   PUT    /reminders           { deviceId, reminders: [{ id, at, title, body }] }  (substitui os pendentes)
 *   POST   /test                { deviceId }  envia uma notificação de teste agora
 *   DELETE /device              { deviceId }  apaga o aparelho e os lembretes
 *
 * Variáveis opcionais (Settings › Variables):
 *   ALLOWED_ORIGIN  endereço do app (ex.: https://duda-maria.netlify.app). Se vazio, aceita qualquer origem.
 *   VAPID_SUBJECT   contato exigido pelos serviços de push (ex.: mailto:seu-email@exemplo.com)
 */

const MAX_REMINDERS = 600;
const LATE_TOLERANCE = 15 * 60 * 1000; // envia lembretes atrasados em até 15 minutos

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      if (!env.DB) return json({ erro: "Banco D1 não ligado ao Worker (variável DB)." }, 500, cors);
      await ensureSchema(env.DB);
      const url = new URL(request.url);
      const route = request.method + " " + url.pathname.replace(/\/+$/, "");

      if (route === "GET " || route === "GET /") {
        const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM devices").first();
        return json({ app: "DUDA", status: "ok", aparelhos: n.n }, 200, cors);
      }
      if (route === "GET /vapid-public-key") {
        const keys = await getVapidKeys(env.DB);
        return json({ publicKey: keys.publicKey }, 200, cors);
      }
      const body = request.method === "GET" ? {} : await request.json().catch(() => ({}));
      const deviceId = typeof body.deviceId === "string" && /^[\w-]{16,64}$/.test(body.deviceId) ? body.deviceId : null;
      if (!deviceId) return json({ erro: "deviceId inválido" }, 400, cors);

      if (route === "POST /subscribe") {
        const s = body.subscription;
        if (!s || typeof s.endpoint !== "string" || !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) {
          return json({ erro: "assinatura inválida" }, 400, cors);
        }
        await env.DB.prepare(
          "INSERT INTO devices (id, endpoint, p256dh, auth, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) " +
          "ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, updated_at = ?5"
        ).bind(deviceId, s.endpoint, s.keys.p256dh, s.keys.auth, Date.now()).run();
        return json({ ok: true }, 200, cors);
      }

      if (route === "PUT /reminders") {
        const list = Array.isArray(body.reminders) ? body.reminders.slice(0, MAX_REMINDERS) : [];
        const now = Date.now();
        const stmts = [env.DB.prepare("DELETE FROM reminders WHERE device_id = ?1 AND sent = 0").bind(deviceId)];
        for (const r of list) {
          if (typeof r.id !== "string" || typeof r.at !== "number" || r.at < now - LATE_TOLERANCE) continue;
          stmts.push(
            env.DB.prepare("INSERT OR IGNORE INTO reminders (device_id, id, at, title, body, sent) VALUES (?1, ?2, ?3, ?4, ?5, 0)")
              .bind(deviceId, r.id.slice(0, 120), Math.round(r.at), String(r.title || "DUDA").slice(0, 140), String(r.body || "").slice(0, 240))
          );
        }
        await env.DB.batch(stmts);
        return json({ ok: true, recebidos: stmts.length - 1 }, 200, cors);
      }

      if (route === "POST /test") {
        const device = await env.DB.prepare("SELECT * FROM devices WHERE id = ?1").bind(deviceId).first();
        if (!device) return json({ erro: "aparelho não cadastrado" }, 404, cors);
        const res = await sendPush(env, device, { title: "DUDA", body: "Notificações ativas. Os lembretes chegam mesmo com o app fechado.", tag: "duda-teste" });
        return json({ ok: res.ok, status: res.status }, res.ok ? 200 : 502, cors);
      }

      if (route === "DELETE /device") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM reminders WHERE device_id = ?1").bind(deviceId),
          env.DB.prepare("DELETE FROM devices WHERE id = ?1").bind(deviceId)
        ]);
        return json({ ok: true }, 200, cors);
      }

      return json({ erro: "rota não encontrada" }, 404, cors);
    } catch (e) {
      return json({ erro: String(e && e.message ? e.message : e) }, 500, cors);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(dispatchDue(env));
  }
};

/** Envia os lembretes que venceram. Exportada para testes. */
export async function dispatchDue(env, now = Date.now()) {
  await ensureSchema(env.DB);
  const due = await env.DB.prepare(
    "SELECT r.device_id, r.id, r.title, r.body, d.endpoint, d.p256dh, d.auth FROM reminders r " +
    "JOIN devices d ON d.id = r.device_id WHERE r.sent = 0 AND r.at <= ?1 AND r.at > ?2 ORDER BY r.at LIMIT 40"
  ).bind(now, now - LATE_TOLERANCE).all();
  let sent = 0;
  const gone = new Set();
  for (const r of due.results || []) {
    if (gone.has(r.device_id)) continue;
    const res = await sendPush(env, r, { title: r.title, body: r.body, tag: r.id });
    if (res.status === 404 || res.status === 410) gone.add(r.device_id);
    await env.DB.prepare("UPDATE reminders SET sent = ?1 WHERE device_id = ?2 AND id = ?3").bind(res.ok ? 1 : 2, r.device_id, r.id).run();
    if (res.ok) sent++;
  }
  const cleanup = [env.DB.prepare("DELETE FROM reminders WHERE at < ?1").bind(now - 3 * 86400000)];
  for (const id of gone) {
    cleanup.push(env.DB.prepare("DELETE FROM reminders WHERE device_id = ?1").bind(id));
    cleanup.push(env.DB.prepare("DELETE FROM devices WHERE id = ?1").bind(id));
  }
  await env.DB.batch(cleanup);
  return { sent, gone: gone.size };
}

/* ---------------- infraestrutura ---------------- */

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS reminders (device_id TEXT NOT NULL, id TEXT NOT NULL, at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (device_id, id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent, at)")
  ]);
  schemaReady = true;
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "").trim();
  return {
    "Access-Control-Allow-Origin": allowed ? (origin === allowed ? origin : allowed) : "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

/* ---------------- Web Push (RFC 8291 + VAPID RFC 8292) ---------------- */

const enc = new TextEncoder();

export function b64u(bytes) {
  let s = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64u(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

async function getVapidKeys(db) {
  const row = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (row) return JSON.parse(row.v);
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const keys = {
    publicKey: b64u(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey)
  };
  // INSERT OR IGNORE + releitura: se dois acessos simultâneos criarem chaves, vale a primeira gravada
  await db.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?1)").bind(JSON.stringify(keys)).run();
  const saved = await db.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  return JSON.parse(saved.v);
}

export async function vapidJwt(endpoint, privateJwk, subject, now = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64u(enc.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + payload));
  return header + "." + payload + "." + b64u(sig);
}

/** Criptografa a mensagem para o aparelho (aes128gcm) */
export async function encryptPayload(p256dh, authSecret, plaintext) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const prkKey = await hmac(auth, ecdhSecret);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const padded = concat(enc.encode(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, padded));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

async function sendPush(env, target, message) {
  const keys = await getVapidKeys(env.DB);
  const subject = (env.VAPID_SUBJECT || "").trim() || (env.ALLOWED_ORIGIN || "").trim() || "mailto:duda@example.com";
  const jwt = await vapidJwt(target.endpoint, keys.privateJwk, subject);
  const body = await encryptPayload(target.p256dh, target.auth, JSON.stringify(message));
  try {
    const res = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        Authorization: "vapid t=" + jwt + ", k=" + keys.publicKey,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "3600",
        Urgency: "high"
      },
      body
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } catch (e) {
    return { ok: false, status: 0 };
  }
}
