import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Leaf, Plus, Share, Sparkles, X } from "lucide-react";
import { PinnedTask } from "../components/PinnedTask";
import { TaskItem } from "../components/TaskItem";
import { Empty, ProgressRing } from "../components/ui";
import { greeting, longDate, todayKey, weekdayName } from "../lib/dates";
import { isIos, isStandalone } from "../lib/reminders";
import { useStore } from "../lib/store";
import { compareOccurrences, isOverdue, occurrencesOn, representative } from "../lib/tasks";
import type { Occurrence } from "../lib/types";
import type { Tab } from "../App";

const HIDE_INSTALL = "duda:esconder-instalar";

export function Home({ openTask, newTask, go }: { openTask: (o: Occurrence) => void; newTask: (date?: string | null) => void; go: (t: Tab) => void }) {
  const { tasks, settings } = useStore();
  const today = todayKey();
  const { hello, message } = greeting();
  const firstName = settings.name.trim().split(/\s+/)[0] || "Maria";
  const [showInstall, setShowInstall] = useState(() => {
    try { return isIos() && !isStandalone() && localStorage.getItem(HIDE_INSTALL) !== "1"; } catch { return isIos() && !isStandalone(); }
  });

  const todays = useMemo(() => occurrencesOn(tasks, today).sort((a, b) => compareOccurrences(a, b, "data")), [tasks, today]);
  const overdue = useMemo(
    () => tasks.map((t) => representative(t, today)).filter((o) => isOverdue(o, today)).sort((a, b) => compareOccurrences(a, b, "data")),
    [tasks, today]
  );
  const undated = useMemo(() => tasks.filter((t) => !t.date).map((t) => representative(t, today)).filter((o) => !o.done), [tasks, today]);
  const pending = todays.filter((o) => !o.done);
  const done = todays.filter((o) => o.done);
  const rate = todays.length ? Math.round((done.length / todays.length) * 100) : 0;
  const next = pending.find((o) => o.task.time);

  return (
    <div className="screen">
      <header className="hero">
        <p className="eyebrow">{weekdayName(today)}, {longDate(today)}</p>
        <h1>{hello}, <em>{firstName}</em></h1>
        <p className="hero-msg">{message}</p>
      </header>

      {showInstall && (
        <section className="card install-card">
          <button type="button" className="icon-btn close" aria-label="Dispensar" onClick={() => { setShowInstall(false); try { localStorage.setItem(HIDE_INSTALL, "1"); } catch { /* */ } }}>
            <X size={18} />
          </button>
          <Sparkles size={20} aria-hidden="true" />
          <div>
            <h3>Instale o DUDA no iPhone</h3>
            <p>Toque em <Share size={14} aria-label="Compartilhar" className="inline-icon" /> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>. Assim ele abre como app e pode enviar lembretes.</p>
          </div>
        </section>
      )}

      <section className="card summary">
        <ProgressRing value={rate} label="Concluído hoje" />
        <div className="summary-text">
          <h2>Seu dia</h2>
          {todays.length === 0 ? (
            <p>Nenhuma tarefa para hoje.</p>
          ) : (
            <p>
              <b>{done.length}</b> de <b>{todays.length}</b> concluídas
              {pending.length > 0 ? " · " + pending.length + (pending.length === 1 ? " pendente" : " pendentes") : " · tudo feito!"}
            </p>
          )}
          {next && (
            <p className="next"><CalendarClock size={14} aria-hidden="true" /> Próxima: {next.task.time} · {next.task.title}</p>
          )}
        </div>
      </section>

      <PinnedTask />

      <button type="button" className="quick-add" onClick={() => newTask(today)}>
        <span className="quick-add-icon"><Plus size={20} /></span>
        Adicionar tarefa para hoje
      </button>

      {overdue.length > 0 && (
        <section className="block">
          <h2 className="block-title late">Atrasadas <span>{overdue.length}</span></h2>
          <ul className="task-list">{overdue.slice(0, 5).map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} />)}</ul>
          {overdue.length > 5 && <button type="button" className="link-btn" onClick={() => go("tarefas")}>Ver todas <ChevronRight size={16} /></button>}
        </section>
      )}

      <section className="block">
        <h2 className="block-title">Pendentes hoje <span>{pending.length}</span></h2>
        {pending.length ? (
          <ul className="task-list">{pending.map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} showDate={false} />)}</ul>
        ) : (
          <Empty
            icon={<Leaf size={26} />}
            title={todays.length ? "Tudo concluído" : "Dia livre"}
            text={todays.length ? "Você concluiu tudo o que planejou para hoje." : "Planeje algo para hoje ou aproveite o respiro."}
          />
        )}
      </section>

      {settings.showCompletedOnHome && done.length > 0 && (
        <section className="block">
          <h2 className="block-title">Concluídas hoje <span>{done.length}</span></h2>
          <ul className="task-list">{done.map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} showDate={false} />)}</ul>
        </section>
      )}

      {undated.length > 0 && (
        <section className="block">
          <h2 className="block-title">Sem data <span>{undated.length}</span></h2>
          <ul className="task-list">{undated.slice(0, 4).map((o) => <TaskItem key={o.task.id} occ={o} onOpen={openTask} />)}</ul>
          {undated.length > 4 && <button type="button" className="link-btn" onClick={() => go("tarefas")}>Ver todas <ChevronRight size={16} /></button>}
        </section>
      )}
    </div>
  );
}
