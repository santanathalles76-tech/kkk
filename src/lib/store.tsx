import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openStorage, requestPersistence, type Storage } from "./db";
import { notifyChange } from "./sync";
import { sanitizeTask, uid } from "./tasks";
import { DEFAULT_SETTINGS, type BackupFile, type Category, type Settings, type Task } from "./types";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "erro";
  action?: { label: string; run: () => void };
}

export type TaskInput = Omit<Task, "id" | "completions" | "skipped" | "createdAt" | "updatedAt">;

interface Store {
  ready: boolean;
  storageKind: Storage["kind"] | null;
  persisted: boolean;
  tasks: Task[];
  categories: Category[];
  settings: Settings;
  toasts: Toast[];
  toast(text: string, tone?: Toast["tone"], action?: Toast["action"]): void;
  dismissToast(id: number): void;
  addTask(input: TaskInput): Promise<Task | null>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;
  skipOccurrence(id: string, date: string): Promise<void>;
  toggleOccurrence(id: string, key: string): Promise<void>;
  moveOccurrence(id: string, from: string | null, to: string): Promise<void>;
  addCategory(name: string, color: string): Promise<Category | null>;
  updateCategory(id: string, patch: Partial<Category>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  exportBackup(): BackupFile;
  importBackup(data: unknown, mode: "mesclar" | "substituir"): Promise<{ tasks: number; categories: number }>;
  clearAll(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export const CATEGORY_COLORS = ["#718C73", "#405B48", "#C88F82", "#C49A56", "#879184", "#8FA9A0", "#B07A8C", "#7D8FB3"];

function defaultCategories(): Category[] {
  const now = new Date().toISOString();
  return [
    { name: "Pessoal", color: "#718C73" },
    { name: "Estudos", color: "#C49A56" },
    { name: "Trabalho", color: "#405B48" },
    { name: "Saúde", color: "#C88F82" }
  ].map((c) => ({ id: uid(), ...c, createdAt: now, updatedAt: now }));
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/quota|espaço/i.test(msg)) return "Sem espaço no aparelho para salvar. Exporte um backup e libere espaço.";
  return "Não foi possível salvar. Tente novamente.";
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [ready, setReady] = useState(false);
  const [persisted, setPersisted] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const catsRef = useRef(categories);
  catsRef.current = categories;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const toastSeq = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback(
    (text: string, tone: Toast["tone"] = "info", action?: Toast["action"]) => {
      const id = ++toastSeq.current;
      setToasts((l) => [...l.slice(-2), { id, text, tone, action }]);
      window.setTimeout(() => dismissToast(id), action ? 6000 : 3200);
    },
    [dismissToast]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await openStorage();
        const snap = await s.loadAll();
        if (!alive) return;
        let cats = snap.categories;
        if (!snap.seeded && cats.length === 0) {
          cats = defaultCategories();
          await s.replaceAll({ tasks: snap.tasks, categories: cats, settings: { ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) } });
        }
        const clean = snap.tasks.map(sanitizeTask).filter((t): t is Task => t !== null);
        setStorage(s);
        setTasks(clean);
        setCategories(cats.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        setSettings({ ...DEFAULT_SETTINGS, ...(snap.settings ?? {}) });
        if (s.kind === "memoria") toast("Este navegador não permite salvar dados. Use o Safari fora da navegação privada.", "erro");
      } catch (e) {
        console.error(e);
        toast("Não foi possível abrir seus dados neste aparelho.", "erro");
      } finally {
        if (alive) setReady(true);
      }
      setPersisted(await requestPersistence());
    })();
    return () => { alive = false; };
  }, [toast]);

  /** Aplica a mudança na tela já, grava, e desfaz se a gravação falhar */
  const commitTasks = useCallback(
    async (next: Task[], persist: (s: Storage) => Promise<void>) => {
      const prev = tasksRef.current;
      setTasks(next);
      tasksRef.current = next;
      if (!storage) return true;
      try {
        await persist(storage);
        return true;
      } catch (e) {
        console.error(e);
        setTasks(prev);
        tasksRef.current = prev;
        toast(errorText(e), "erro");
        return false;
      }
    },
    [storage, toast]
  );

  const addTask = useCallback(
    async (input: TaskInput) => {
      const now = new Date().toISOString();
      const task: Task = { ...input, title: input.title.trim(), id: uid(), completions: {}, skipped: [], createdAt: now, updatedAt: now };
      const ok = await commitTasks([...tasksRef.current, task], (s) => s.putTask(task));
      if (ok) notifyChange({ tasks: [task] });
      return ok ? task : null;
    },
    [commitTasks]
  );

  const updateTask = useCallback(
    async (id: string, patch: Partial<Task>) => {
      const cur = tasksRef.current.find((t) => t.id === id);
      if (!cur) return;
      const task: Task = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
      if (task.recurrence === "nenhuma" || !task.date) task.until = null;
      const ok = await commitTasks(tasksRef.current.map((t) => (t.id === id ? task : t)), (s) => s.putTask(task));
      if (ok) notifyChange({ tasks: [task] });
    },
    [commitTasks]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const cur = tasksRef.current.find((t) => t.id === id);
      if (!cur) return;
      const ok = await commitTasks(tasksRef.current.filter((t) => t.id !== id), (s) => s.deleteTask(id));
      if (!ok) return;
      notifyChange({ deletedTaskIds: [id] });
      toast("Tarefa excluída", "info", {
        label: "Desfazer",
        run: () => {
          if (tasksRef.current.some((t) => t.id === id)) return;
          void commitTasks([...tasksRef.current, cur], (s) => s.putTask(cur));
        }
      });
    },
    [commitTasks, toast]
  );

  const skipOccurrence = useCallback(
    async (id: string, date: string) => {
      const cur = tasksRef.current.find((t) => t.id === id);
      if (!cur || cur.skipped.includes(date)) return;
      const completions = { ...cur.completions };
      delete completions[date];
      await updateTask(id, { skipped: [...cur.skipped, date], completions });
      toast("Ocorrência removida", "info", {
        label: "Desfazer",
        run: () => {
          const t = tasksRef.current.find((x) => x.id === id);
          if (t) void updateTask(id, { skipped: t.skipped.filter((d) => d !== date), completions: cur.completions });
        }
      });
    },
    [toast, updateTask]
  );

  const toggleOccurrence = useCallback(
    async (id: string, key: string) => {
      const cur = tasksRef.current.find((t) => t.id === id);
      if (!cur) return;
      const completions = { ...cur.completions };
      if (completions[key]) delete completions[key];
      else completions[key] = new Date().toISOString();
      await updateTask(id, { completions });
    },
    [updateTask]
  );

  /** Muda a data de uma tarefa. Em séries, move só a ocorrência escolhida (vira uma tarefa avulsa). */
  const moveOccurrence = useCallback(
    async (id: string, from: string | null, to: string) => {
      const cur = tasksRef.current.find((t) => t.id === id);
      if (!cur || from === to) return;
      if (cur.recurrence === "nenhuma" || !from) {
        await updateTask(id, { date: to });
        return;
      }
      const now = new Date().toISOString();
      const done = cur.completions[from];
      const single: Task = {
        ...cur, id: uid(), date: to, recurrence: "nenhuma", until: null, skipped: [],
        completions: done ? { [to]: done } : {}, createdAt: now, updatedAt: now
      };
      const completions = { ...cur.completions };
      delete completions[from];
      const series: Task = { ...cur, skipped: [...cur.skipped, from], completions, updatedAt: now };
      const next = tasksRef.current.map((t) => (t.id === id ? series : t)).concat(single);
      const ok = await commitTasks(next, (s) => s.putTasks([series, single]));
      if (ok) notifyChange({ tasks: [series, single] });
    },
    [commitTasks, updateTask]
  );

  const addCategory = useCallback(
    async (name: string, color: string) => {
      const clean = name.trim().slice(0, 30);
      if (!clean) return null;
      if (catsRef.current.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
        toast("Já existe uma categoria com esse nome.", "erro");
        return null;
      }
      const now = new Date().toISOString();
      const cat: Category = { id: uid(), name: clean, color, createdAt: now, updatedAt: now };
      setCategories((l) => [...l, cat]);
      try {
        await storage?.putCategory(cat);
        notifyChange({ categories: [cat] });
        return cat;
      } catch (e) {
        setCategories((l) => l.filter((c) => c.id !== cat.id));
        toast(errorText(e), "erro");
        return null;
      }
    },
    [storage, toast]
  );

  const updateCategory = useCallback(
    async (id: string, patch: Partial<Category>) => {
      const cur = catsRef.current.find((c) => c.id === id);
      if (!cur) return;
      const cat: Category = { ...cur, ...patch, id, updatedAt: new Date().toISOString() };
      setCategories((l) => l.map((c) => (c.id === id ? cat : c)));
      try {
        await storage?.putCategory(cat);
      } catch (e) {
        setCategories((l) => l.map((c) => (c.id === id ? cur : c)));
        toast(errorText(e), "erro");
      }
    },
    [storage, toast]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const affected = tasksRef.current.filter((t) => t.categoryId === id).map((t) => ({ ...t, categoryId: null, updatedAt: new Date().toISOString() }));
      const prevCats = catsRef.current;
      setCategories((l) => l.filter((c) => c.id !== id));
      try {
        await storage?.deleteCategory(id);
        if (affected.length) {
          await commitTasks(tasksRef.current.map((t) => affected.find((a) => a.id === t.id) ?? t), (s) => s.putTasks(affected));
        }
        notifyChange({ deletedCategoryIds: [id], tasks: affected });
      } catch (e) {
        setCategories(prevCats);
        toast(errorText(e), "erro");
      }
    },
    [commitTasks, storage, toast]
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...patch };
      setSettings(next);
      try {
        await storage?.putMeta("settings", next);
        notifyChange({ settings: next });
      } catch (e) {
        setSettings(prev);
        toast(errorText(e), "erro");
      }
    },
    [storage, toast]
  );

  const exportBackup = useCallback(
    (): BackupFile => ({
      app: "DUDA",
      version: 1,
      exportedAt: new Date().toISOString(),
      tasks: tasksRef.current,
      categories: catsRef.current,
      settings: settingsRef.current
    }),
    []
  );

  const importBackup = useCallback(
    async (data: unknown, mode: "mesclar" | "substituir") => {
      if (!data || typeof data !== "object" || (data as BackupFile).app !== "DUDA" || !Array.isArray((data as BackupFile).tasks)) {
        throw new Error("Este arquivo não é um backup do DUDA.");
      }
      const b = data as BackupFile;
      const incomingTasks = b.tasks.map(sanitizeTask).filter((t): t is Task => t !== null);
      const incomingCats = (Array.isArray(b.categories) ? b.categories : []).filter(
        (c): c is Category => !!c && typeof c.id === "string" && typeof c.name === "string"
      );
      let nextTasks: Task[];
      let nextCats: Category[];
      if (mode === "substituir") {
        nextTasks = incomingTasks;
        nextCats = incomingCats;
      } else {
        // Mesclar: mesma id = mantém a versão mais recente (sem duplicar)
        const map = new Map(tasksRef.current.map((t) => [t.id, t]));
        for (const t of incomingTasks) {
          const cur = map.get(t.id);
          if (!cur || t.updatedAt > cur.updatedAt) map.set(t.id, t);
        }
        nextTasks = [...map.values()];
        const cmap = new Map(catsRef.current.map((c) => [c.id, c]));
        for (const c of incomingCats) if (!cmap.has(c.id)) cmap.set(c.id, c);
        nextCats = [...cmap.values()];
      }
      const nextSettings = { ...DEFAULT_SETTINGS, ...(mode === "substituir" && b.settings ? b.settings : settingsRef.current) };
      if (storage) await storage.replaceAll({ tasks: nextTasks, categories: nextCats, settings: nextSettings });
      setTasks(nextTasks);
      setCategories(nextCats);
      setSettings(nextSettings);
      return { tasks: incomingTasks.length, categories: incomingCats.length };
    },
    [storage]
  );

  const clearAll = useCallback(async () => {
    const cats = defaultCategories();
    const keep = { ...DEFAULT_SETTINGS, name: settingsRef.current.name };
    if (storage) await storage.replaceAll({ tasks: [], categories: cats, settings: keep });
    setTasks([]);
    setCategories(cats);
    setSettings(keep);
  }, [storage]);

  const value = useMemo<Store>(
    () => ({
      ready, storageKind: storage?.kind ?? null, persisted, tasks, categories, settings, toasts,
      toast, dismissToast, addTask, updateTask, deleteTask, skipOccurrence, toggleOccurrence, moveOccurrence,
      addCategory, updateCategory, deleteCategory, updateSettings, exportBackup, importBackup, clearAll
    }),
    [ready, storage, persisted, tasks, categories, settings, toasts, toast, dismissToast, addTask, updateTask, deleteTask,
      skipOccurrence, toggleOccurrence, moveOccurrence, addCategory, updateCategory, deleteCategory, updateSettings,
      exportBackup, importBackup, clearAll]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fora do StoreProvider");
  return s;
}
