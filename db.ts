/*
 * Persistência local do DUDA.
 * Principal: IndexedDB (sobrevive ao fechamento do Safari e funciona offline).
 * Reserva: localStorage, usada só se o IndexedDB estiver indisponível (ex.: navegação privada antiga).
 * Cada gravação é feita registro a registro (put/delete), o que evita sobrescrever dados inteiros
 * e impede duplicações: a chave primária é sempre o id.
 */
import type { Category, Settings, Task } from "./types";

const DB_NAME = "duda";
const DB_VERSION = 1;
type StoreName = "tasks" | "categories" | "meta";

export interface Snapshot {
  tasks: Task[];
  categories: Category[];
  settings: Partial<Settings> | null;
  seeded: boolean;
}

export interface Storage {
  kind: "indexeddb" | "localstorage" | "memoria";
  loadAll(): Promise<Snapshot>;
  putTask(t: Task): Promise<void>;
  putTasks(t: Task[]): Promise<void>;
  deleteTask(id: string): Promise<void>;
  putCategory(c: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  putMeta(key: string, value: unknown): Promise<void>;
  replaceAll(s: { tasks: Task[]; categories: Category[]; settings: Settings }): Promise<void>;
  clearAll(): Promise<void>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transação cancelada"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("tasks")) db.createObjectStore("tasks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("Banco de dados bloqueado por outra aba"));
  });
}

function idbStorage(db: IDBDatabase): Storage {
  // O Safari pode fechar a conexão em segundo plano; reabrimos quando necessário.
  let conn = db;
  conn.onclose = () => { conn = null as unknown as IDBDatabase; };
  async function getConn(): Promise<IDBDatabase> {
    if (!conn) { conn = await openDb(); conn.onclose = () => { conn = null as unknown as IDBDatabase; }; }
    return conn;
  }
  async function write(stores: StoreName[], fn: (tx: IDBTransaction) => void): Promise<void> {
    const c = await getConn();
    const tx = c.transaction(stores, "readwrite");
    fn(tx);
    await done(tx);
  }
  return {
    kind: "indexeddb",
    async loadAll() {
      const c = await getConn();
      const tx = c.transaction(["tasks", "categories", "meta"], "readonly");
      const [tasks, categories, settings, seeded] = await Promise.all([
        req(tx.objectStore("tasks").getAll() as IDBRequest<Task[]>),
        req(tx.objectStore("categories").getAll() as IDBRequest<Category[]>),
        req(tx.objectStore("meta").get("settings") as IDBRequest<Partial<Settings> | undefined>),
        req(tx.objectStore("meta").get("seeded") as IDBRequest<boolean | undefined>)
      ]);
      return { tasks, categories, settings: settings ?? null, seeded: !!seeded };
    },
    putTask: (t) => write(["tasks"], (tx) => tx.objectStore("tasks").put(t)),
    putTasks: (list) => write(["tasks"], (tx) => list.forEach((t) => tx.objectStore("tasks").put(t))),
    deleteTask: (id) => write(["tasks"], (tx) => tx.objectStore("tasks").delete(id)),
    putCategory: (c) => write(["categories"], (tx) => tx.objectStore("categories").put(c)),
    deleteCategory: (id) => write(["categories"], (tx) => tx.objectStore("categories").delete(id)),
    putMeta: (key, value) => write(["meta"], (tx) => tx.objectStore("meta").put(value, key)),
    replaceAll: (s) =>
      write(["tasks", "categories", "meta"], (tx) => {
        tx.objectStore("tasks").clear();
        tx.objectStore("categories").clear();
        s.tasks.forEach((t) => tx.objectStore("tasks").put(t));
        s.categories.forEach((c) => tx.objectStore("categories").put(c));
        tx.objectStore("meta").put(s.settings, "settings");
        tx.objectStore("meta").put(true, "seeded");
      }),
    clearAll: () =>
      write(["tasks", "categories", "meta"], (tx) => {
        tx.objectStore("tasks").clear();
        tx.objectStore("categories").clear();
        tx.objectStore("meta").clear();
      })
  };
}

/** Reserva em localStorage (ou memória, se nem isso existir) com a mesma interface */
function keyValueStorage(): Storage {
  const KEY = "duda:v1";
  let mem: { tasks: Record<string, Task>; categories: Record<string, Category>; meta: Record<string, unknown> } = {
    tasks: {}, categories: {}, meta: {}
  };
  let ls: globalThis.Storage | null = null;
  try {
    ls = window.localStorage;
    ls.setItem("duda:teste", "1");
    ls.removeItem("duda:teste");
    const raw = ls.getItem(KEY);
    if (raw) mem = JSON.parse(raw);
  } catch {
    ls = null;
  }
  const save = async () => {
    if (!ls) return;
    try {
      ls.setItem(KEY, JSON.stringify(mem));
    } catch (e) {
      throw new Error("Sem espaço para salvar no aparelho. Exporte um backup e libere espaço.", { cause: e });
    }
  };
  return {
    kind: ls ? "localstorage" : "memoria",
    async loadAll() {
      return {
        tasks: Object.values(mem.tasks),
        categories: Object.values(mem.categories),
        settings: (mem.meta.settings as Partial<Settings>) ?? null,
        seeded: !!mem.meta.seeded
      };
    },
    async putTask(t) { mem.tasks[t.id] = t; await save(); },
    async putTasks(list) { list.forEach((t) => (mem.tasks[t.id] = t)); await save(); },
    async deleteTask(id) { delete mem.tasks[id]; await save(); },
    async putCategory(c) { mem.categories[c.id] = c; await save(); },
    async deleteCategory(id) { delete mem.categories[id]; await save(); },
    async putMeta(key, value) { mem.meta[key] = value; await save(); },
    async replaceAll(s) {
      mem = { tasks: {}, categories: {}, meta: { settings: s.settings, seeded: true } };
      s.tasks.forEach((t) => (mem.tasks[t.id] = t));
      s.categories.forEach((c) => (mem.categories[c.id] = c));
      await save();
    },
    async clearAll() { mem = { tasks: {}, categories: {}, meta: {} }; await save(); }
  };
}

export async function openStorage(): Promise<Storage> {
  try {
    const db = await openDb();
    return idbStorage(db);
  } catch (e) {
    console.warn("DUDA: usando armazenamento reserva", e);
    return keyValueStorage();
  }
}

/** Pede ao navegador para não apagar os dados automaticamente quando faltar espaço */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* sem suporte */
  }
  return false;
}
