import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Home as HomeIcon, ListChecks, Plus, TrendingUp, User } from "lucide-react";
import { TaskSheet, type SheetTarget } from "./components/TaskSheet";
import { Logo, Toasts } from "./components/ui";
import { pushActive, syncReminders } from "./lib/push";
import { scheduleReminders } from "./lib/reminders";
import { useStore } from "./lib/store";
import type { Occurrence } from "./lib/types";
import { Agenda } from "./screens/Agenda";
import { Home } from "./screens/Home";
import { Profile } from "./screens/Profile";
import { Progress } from "./screens/Progress";
import { Tasks } from "./screens/Tasks";

export type Tab = "inicio" | "tarefas" | "agenda" | "progresso" | "perfil";
const TABS: { id: Tab; label: string; icon: typeof HomeIcon }[] = [
  { id: "inicio", label: "Início", icon: HomeIcon },
  { id: "tarefas", label: "Tarefas", icon: ListChecks },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "progresso", label: "Progresso", icon: TrendingUp },
  { id: "perfil", label: "Perfil", icon: User }
];

function tabFromHash(): Tab {
  const h = location.hash.replace(/^#\/?/, "") as Tab;
  return TABS.some((t) => t.id === h) ? h : "inicio";
}

export default function App() {
  const { ready, settings, tasks } = useStore();
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [, setTick] = useState(0);

  // Navegação pelo endereço (#/agenda etc.): permite voltar com o gesto do iPhone
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = useCallback((t: Tab) => {
    if (t !== tabFromHash()) location.hash = "/" + t;
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);

  // Tema e cor de destaque
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = settings.theme === "escuro" || (settings.theme === "auto" && mq.matches);
      root.dataset.theme = dark ? "escuro" : "claro";
      root.dataset.accent = settings.accent;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1F2B23" : "#F7F5EC");
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [settings.theme, settings.accent]);

  // Lembretes (enquanto o app está aberto) e virada de dia
  // Com as notificações do servidor ativas, ele avisa (mesmo com o app fechado) e os avisos locais ficam desligados,
  // para não chegar tudo em dobro.
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => { syncReminders(tasks).catch((e) => console.warn("DUDA: lembretes não sincronizados", e)); }, 1200);
    const onOnline = () => { syncReminders(tasks).catch(() => {}); };
    window.addEventListener("online", onOnline);
    return () => { clearTimeout(t); window.removeEventListener("online", onOnline); };
  }, [tasks, ready]);

  useEffect(() => {
    const local = () => (pushActive() ? () => {} : scheduleReminders(tasks));
    let clear = local();
    const refresh = () => {
      clear();
      clear = local();
      if (document.visibilityState === "visible") syncReminders(tasks).catch(() => {});
      setTick((n) => n + 1); // recalcula "hoje" ao voltar para o app
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    const timer = window.setInterval(refresh, 30 * 60000);
    return () => { clear(); document.removeEventListener("visibilitychange", onVis); clearInterval(timer); };
  }, [tasks, settings.notifications]);

  const openTask = useCallback((o: Occurrence) => setSheet({ occ: o }), []);
  const newTask = useCallback((date?: string | null) => setSheet({ date }), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  if (!ready) {
    return (
      <div className="splash" aria-busy="true">
        <Logo size={72} />
        <p>DUDA</p>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="content">
        {tab === "inicio" && <Home openTask={openTask} newTask={newTask} go={go} />}
        {tab === "tarefas" && <Tasks openTask={openTask} newTask={() => newTask()} />}
        {tab === "agenda" && <Agenda openTask={openTask} newTask={newTask} />}
        {tab === "progresso" && <Progress />}
        {tab === "perfil" && <Profile />}
      </main>

      {(tab === "tarefas" || tab === "agenda" || tab === "inicio") && (
        <button type="button" className="fab" aria-label="Nova tarefa" onClick={() => newTask()}>
          <Plus size={26} />
        </button>
      )}

      <nav className="tabbar" aria-label="Navegação principal">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => go(id)}>
            <Icon size={22} strokeWidth={tab === id ? 2.2 : 1.7} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <TaskSheet target={sheet} onClose={closeSheet} />
      <Toasts />
    </div>
  );
}
