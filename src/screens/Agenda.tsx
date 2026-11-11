import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { TaskItem } from "../components/TaskItem";
import { Empty, Segmented } from "../components/ui";
import {
  addDays, addMonths, endOfMonth, friendlyDate, fromKey, longDate, monthTitle, rangeKeys, shortDate,
  startOfMonth, startOfWeek, todayKey, weekdayName, weekdayShort
} from "../lib/dates";
import { useStore } from "../lib/store";
import { compareOccurrences, occurrencesBetween } from "../lib/tasks";
import type { Occurrence, Settings } from "../lib/types";

type View = Settings["defaultView"];

export function Agenda({ openTask, newTask }: { openTask: (o: Occurrence) => void; newTask: (date?: string | null) => void }) {
  const { tasks, settings } = useStore();
  const today = todayKey();
  const [view, setView] = useState<View>(settings.defaultView);
  const [sel, setSel] = useState(today);
  const ws = settings.weekStartsOn;

  const [start, end] = useMemo((): [string, string] => {
    if (view === "mes") return [startOfWeek(startOfMonth(sel), ws), addDays(startOfWeek(endOfMonth(sel), ws), 6)];
    if (view === "semana") { const s = startOfWeek(sel, ws); return [s, addDays(s, 6)]; }
    return [sel, sel];
  }, [view, sel, ws]);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const o of occurrencesBetween(tasks, start, end)) {
      const l = map.get(o.date!) ?? [];
      l.push(o);
      map.set(o.date!, l);
    }
    for (const l of map.values()) l.sort((a, b) => compareOccurrences(a, b, "data"));
    return map;
  }, [tasks, start, end]);

  const shift = (dir: 1 | -1) => setSel((s) => (view === "mes" ? addMonths(s, dir) : addDays(s, view === "semana" ? 7 * dir : dir)));
  const title = view === "mes" ? monthTitle(sel) : view === "semana" ? shortDate(start) + " – " + shortDate(end) : friendlyDate(sel) === shortDate(sel) ? longDate(sel) : friendlyDate(sel) + ", " + longDate(sel);
  const selList = byDay.get(sel) ?? [];
  const weekHeads = Array.from({ length: 7 }, (_, i) => weekdayShort((i + ws) % 7));

  return (
    <div className="screen">
      <header className="screen-head row">
        <div>
          <h1>Agenda</h1>
          <p className="sub">{view === "dia" ? weekdayName(sel) : "Planejamento"}</p>
        </div>
        {sel !== today && <button type="button" className="btn btn-small btn-soft" onClick={() => setSel(today)}>Hoje</button>}
      </header>

      <Segmented<View> label="Visualização" value={view} onChange={setView} options={[{ value: "mes", label: "Mês" }, { value: "semana", label: "Semana" }, { value: "dia", label: "Dia" }]} />

      <div className="cal-nav">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Anterior"><ChevronLeft size={22} /></button>
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Próximo"><ChevronRight size={22} /></button>
      </div>

      {view === "mes" && (
        <section className="card month">
          <div className="month-grid heads" aria-hidden="true">{weekHeads.map((d) => <span key={d}>{d}</span>)}</div>
          <div className="month-grid" role="grid" aria-label={monthTitle(sel)}>
            {rangeKeys(start, end).map((k) => {
              const list = byDay.get(k) ?? [];
              const pending = list.filter((o) => !o.done).length;
              const out = k.slice(0, 7) !== sel.slice(0, 7);
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  aria-selected={k === sel}
                  aria-label={longDate(k) + (list.length ? ", " + list.length + " tarefas" : "")}
                  className={"day" + (out ? " out" : "") + (k === today ? " today" : "") + (k === sel ? " sel" : "")}
                  onClick={() => setSel(k)}
                  onDoubleClick={() => { setSel(k); setView("dia"); }}
                >
                  <span className="num">{fromKey(k).getDate()}</span>
                  {list.length > 0 && <span className={"marks" + (pending ? "" : " all-done")}>{list.length > 3 ? list.length : "•".repeat(list.length)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {view === "semana" && (
        <div className="week">
          {rangeKeys(start, end).map((k) => {
            const list = byDay.get(k) ?? [];
            return (
              <section key={k} className={"week-day" + (k === today ? " today" : "")}>
                <header>
                  <button type="button" className="week-day-title" onClick={() => { setSel(k); setView("dia"); }}>
                    <b>{weekdayShort(fromKey(k).getDay())}</b> {shortDate(k)}
                  </button>
                  <button type="button" className="icon-btn" aria-label={"Adicionar em " + longDate(k)} onClick={() => newTask(k)}><Plus size={18} /></button>
                </header>
                {list.length ? (
                  <ul className="task-list compact">{list.map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} showDate={false} />)}</ul>
                ) : (
                  <p className="muted small">Livre</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {view !== "semana" && (
        <section className="block">
          <h2 className="block-title">
            {view === "mes" ? friendlyDate(sel) === shortDate(sel) ? longDate(sel) : friendlyDate(sel) + " · " + longDate(sel) : "Compromissos"}
            <span>{selList.length}</span>
          </h2>
          {view === "dia" ? <DayTimeline list={selList} openTask={openTask} /> : selList.length ? (
            <ul className="task-list">{selList.map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} showDate={false} />)}</ul>
          ) : null}
          {!selList.length && (
            <Empty icon={<CalendarDays size={26} />} title="Nada planejado" text="Toque em adicionar para organizar este dia."
              action={<button type="button" className="btn btn-primary" onClick={() => newTask(sel)}>Adicionar neste dia</button>} />
          )}
        </section>
      )}
    </div>
  );
}

function DayTimeline({ list, openTask }: { list: Occurrence[]; openTask: (o: Occurrence) => void }) {
  if (!list.length) return null;
  const timed = list.filter((o) => o.task.time);
  const free = list.filter((o) => !o.task.time);
  return (
    <div className="timeline">
      {timed.map((o) => (
        <div key={o.task.id + o.key} className="tl-row">
          <span className="tl-time">{o.task.time}</span>
          <ul className="task-list"><TaskItem occ={o} onOpen={openTask} showDate={false} /></ul>
        </div>
      ))}
      {free.length > 0 && (
        <div className="tl-row">
          <span className="tl-time muted">Sem horário</span>
          <ul className="task-list">{free.map((o) => <TaskItem key={o.task.id + o.key} occ={o} onOpen={openTask} showDate={false} />)}</ul>
        </div>
      )}
    </div>
  );
}
