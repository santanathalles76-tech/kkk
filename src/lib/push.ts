/*
 * Notificações com o app fechado (Web Push) usando o servidor gratuito da Cloudflare (pasta push-server/).
 *
 * O endereço do servidor vem, nesta ordem:
 *   0. se o app estiver publicado no mesmo Worker do servidor, /api do próprio endereço (automático)
 *   1. do arquivo /duda-config.json  { "pushServer": "https://duda-push.SEU-USUARIO.workers.dev" }
 *      (pode ser editado dentro da pasta dist, sem recompilar)
 *   2. da variável de build VITE_PUSH_SERVER_URL
 * Sem endereço configurado, o DUDA continua com os lembretes locais (app aberto) e o Calendário.
 *
 * Só os lembretes saem do aparelho: horário, título e um resumo curto. As tarefas continuam no iPhone.
 */
import { addDays, todayKey } from "./dates";
import { occurrencesBetween } from "./tasks";
import type { Task } from "./types";

const DEVICE_KEY = "duda:push-device";
const SERVER_CACHE = "duda:push-server";
const HASH_KEY = "duda:push-hash";
const ACTIVE_KEY = "duda:push-ativo";
const DAYS_AHEAD = 30;

let serverPromise: Promise<string> | null = null;

export function pushServer(): Promise<string> {
  if (!serverPromise) {
    serverPromise = (async () => {
      let url = "";
      try {
        const r = await fetch("/duda-config.json", { cache: "no-store" });
        if (r.ok) url = String((await r.json()).pushServer || "");
      } catch {
        try { url = localStorage.getItem(SERVER_CACHE) || ""; } catch { /* */ }
      }
      if (!url) url = (import.meta.env.VITE_PUSH_SERVER_URL as string | undefined) || "";
      if (!url) {
        // App publicado no mesmo Worker do servidor (Cloudflare): usa /api do próprio endereço
        try {
          const r = await fetch("/api/", { cache: "no-store" });
          const data = r.ok && (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
          if (data && data.app === "DUDA") url = location.origin + "/api";
        } catch { /* offline: usa o último endereço conhecido */ }
      }
      if (!url) { try { url = localStorage.getItem(SERVER_CACHE) || ""; } catch { /* */ } }
      url = url.trim().replace(/\/+$/, "");
      try { localStorage.setItem(SERVER_CACHE, url); } catch { /* */ }
      return url;
    })();
  }
  return serverPromise;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^\w-]/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "sem-armazenamento-" + Date.now();
  }
}

export function pushActive(): boolean {
  try { return localStorage.getItem(ACTIVE_KEY) === "1"; } catch { return false; }
}

function setActive(v: boolean) {
  try {
    if (v) localStorage.setItem(ACTIVE_KEY, "1");
    else { localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem(HASH_KEY); }
  } catch { /* */ }
}

function keyToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function api(path: string, method: string, body?: unknown) {
  const base = await pushServer();
  if (!base) throw new Error("Servidor de notificações não configurado.");
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.erro || "Servidor respondeu " + r.status);
  return data;
}

/** Deve ser chamada a partir de um toque da usuária (exigência do iPhone). */
export async function enablePush(tasks: Task[]): Promise<void> {
  if (!pushSupported()) throw new Error("Instale o DUDA na Tela de Início (iOS 16.4 ou superior) para ativar.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão negada. Libere em Ajustes › Notificações › DUDA.");
  const { publicKey } = await api("/vapid-public-key", "GET");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const wanted = keyToBytes(publicKey);
  if (sub) {
    const current = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (!current || current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  await api("/subscribe", "POST", { deviceId: deviceId(), subscription: sub.toJSON() });
  setActive(true);
  await syncReminders(tasks, true);
}

export async function disablePush(): Promise<void> {
  try { await api("/device", "DELETE", { deviceId: deviceId() }); } catch { /* servidor fora do ar: segue */ }
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch { /* */ }
  setActive(false);
}

export async function sendTestPush(): Promise<void> {
  await api("/test", "POST", { deviceId: deviceId() });
}

function at(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

export function buildReminders(tasks: Task[], now = Date.now()) {
  const today = todayKey();
  const out: { id: string; at: number; title: string; body: string }[] = [];
  for (const o of occurrencesBetween(tasks, addDays(today, -1), addDays(today, DAYS_AHEAD))) {
    const t = o.task;
    if (o.done || t.reminder === null || !t.time || !o.date) continue;
    const when = at(o.date, t.time) - t.reminder * 60000;
    if (when < now - 10 * 60000) continue;
    const lead = t.reminder === 0 ? "Agora" : t.reminder >= 1440 ? "Amanhã" : t.reminder >= 60 ? "Em " + t.reminder / 60 + " h" : "Em " + t.reminder + " min";
    out.push({
      id: t.id + "@" + o.date + "@" + t.time + "@" + t.reminder,
      at: when,
      title: t.title,
      body: lead + " · " + t.time + (t.description ? " · " + t.description.slice(0, 80) : "")
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, 600);
}

/** Envia ao servidor a lista dos próximos lembretes, só quando ela mudou. */
export async function syncReminders(tasks: Task[], force = false): Promise<void> {
  if (!pushActive() || !navigator.onLine) return;
  const list = buildReminders(tasks);
  const hash = JSON.stringify(list.map((r) => [r.id, r.title, r.body]));
  try {
    if (!force && localStorage.getItem(HASH_KEY) === hash) return;
  } catch { /* */ }
  await api("/reminders", "PUT", { deviceId: deviceId(), reminders: list });
  try { localStorage.setItem(HASH_KEY, hash); } catch { /* */ }
}
