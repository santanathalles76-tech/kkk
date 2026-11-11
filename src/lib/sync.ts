/*
 * Ponto de extensão para sincronização futura (ex.: Supabase).
 * Hoje o DUDA funciona 100% no aparelho, sem cadastro e sem servidor.
 *
 * Para ativar uma sincronização no futuro:
 * 1. Crie um adaptador que implemente `SyncAdapter` (ex.: src/lib/sync-supabase.ts usando @supabase/supabase-js).
 * 2. Use `updatedAt` de cada tarefa e categoria para resolver conflitos (o mais recente vence).
 * 3. Registre o adaptador em `setSyncAdapter` no main.tsx, lendo a URL e a chave de
 *    import.meta.env.VITE_SUPABASE_URL e import.meta.env.VITE_SUPABASE_ANON_KEY.
 * Nenhuma tela precisa mudar: a store chama `notifyChange` após cada gravação local.
 */
import type { Category, Settings, Task } from "./types";

export interface ChangeSet {
  tasks?: Task[];
  deletedTaskIds?: string[];
  categories?: Category[];
  deletedCategoryIds?: string[];
  settings?: Settings;
}

export interface SyncAdapter {
  name: string;
  push(changes: ChangeSet): Promise<void>;
  pull(since: string | null): Promise<ChangeSet>;
}

let adapter: SyncAdapter | null = null;

export function setSyncAdapter(a: SyncAdapter | null): void {
  adapter = a;
}

export function syncEnabled(): boolean {
  return adapter !== null;
}

export function notifyChange(changes: ChangeSet): void {
  if (!adapter) return;
  adapter.push(changes).catch((e) => console.warn("DUDA: falha ao sincronizar", e));
}
