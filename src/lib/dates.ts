/* Datas sempre no fuso local, no formato AAAA-MM-DD, para evitar o deslocamento de UTC */

export function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

export function toKey(d: Date): string {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

export function startOfWeek(key: string, weekStartsOn: 0 | 1): string {
  const d = fromKey(key);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function startOfMonth(key: string): string {
  return key.slice(0, 8) + "01";
}

export function endOfMonth(key: string): string {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function rangeKeys(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function weekdayShort(i: number): string {
  return WEEKDAYS_SHORT[i];
}

export function weekdayName(key: string): string {
  return WEEKDAYS[fromKey(key).getDay()];
}

export function monthTitle(key: string): string {
  const d = fromKey(key);
  const m = MONTHS[d.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1) + " de " + d.getFullYear();
}

export function shortDate(key: string): string {
  const d = fromKey(key);
  return d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
}

export function longDate(key: string): string {
  const d = fromKey(key);
  return d.getDate() + " de " + MONTHS[d.getMonth()];
}

/** "Hoje", "Amanhã", "Ontem" ou a data curta */
export function friendlyDate(key: string): string {
  const t = todayKey();
  const diff = diffDays(t, key);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  return shortDate(key) + (key.slice(0, 4) !== t.slice(0, 4) ? " " + key.slice(0, 4) : "");
}

export function greeting(d = new Date()): { hello: string; message: string } {
  const h = d.getHours();
  if (h >= 5 && h < 12) return { hello: "Bom dia", message: "Um passo de cada vez. O dia está só começando." };
  if (h >= 12 && h < 18) return { hello: "Boa tarde", message: "Respire fundo e siga no seu ritmo." };
  if (h >= 18 && h < 24) return { hello: "Boa noite", message: "Hora de fechar o dia com leveza." };
  return { hello: "Boa madrugada", message: "Descansar também faz parte do plano." };
}

export function nowTime(): string {
  const d = new Date();
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}
