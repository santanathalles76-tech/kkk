import { useMemo, useState } from "react";
import { ListChecks, Search, SlidersHorizontal, X } from "lucide-react";
import { PinnedTask } from "../components/PinnedTask";
import { TaskItem } from "../components/TaskItem";
import { Empty, Segmented } from "../components/ui";
import { addDays, startOfWeek, todayKey } from "../lib/dates";
import { useStore } from "../lib/store";
import { compareOccurrences, isOverdue, normalize, representative, type SortMode } from "../lib/tasks";
import type { Occurrence, Priority } from "../lib/types";

type StatusFilter = "pendentes" | "concluidas" | "todas";
type WhenFilter = "qualquer" | "hoje" | "semana" | "atrasadas" | "sem-data";

const FILTERS_KEY = "duda:filtros";

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); } catch { return {}; }
}

export function Tasks({ openTask, newTask }: { openTask: (o: Occurrence) => void; newTask: () => void }) {
  const { tasks, categories, settings } = useStore();
  const saved = loadFilters();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(saved.status ?? "pendentes");
  const [sort, setSort] = useState<SortMode>(saved.sort ?? "data");
  const [prio, setPrio] = useState<Priority | "todas">("todas");
  const [cat, setCat] = useState<string>("todas");
  const [when, setWhen] = useState<WhenFilter>("qualquer");
  const [panel, setPanel] = useState(false);

  const persist = (patch: object) => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ status, sort, ...patch })); } catch { /* */ }
  };

  const today = todayKey();
  const list = useMemo(() => {
    const q = normalize(query.trim());
    const wStart = startOfWeek(today, settings.weekStartsOn);
    const wEnd = addDays(wStart, 6);
    return tasks
      .map((t) => representative(t, today))
      .filter((o) => {
        const t = o.task;
        if (status === "pendentes" && o.done) return false;
        if (status === "concluidas" && !o.done) return false;
        if (prio !== "todas" && t.priority !== prio) return false;
        if (cat === "sem" && t.categoryId) return false;
        if (cat !== "todas" && cat !== "sem" && t.categoryId !== cat) return false;
        if (when === "hoje" && o.date !== today) return false;
        if (when === "semana" && (!o.date || o.date < wStart || o.date > wEnd)) return false;
        if (when === "atrasadas" && !isOverdue(o, today)) return false;
        if (when === "sem-data" && o.date) return false;
        if (q && !normalize(t.title + " " + t.description).includes(q)) return false;
        return true;
      })
      .sort((a, b) => compareOccurrences(a, b, sort));
  }, [tasks, query, status, sort, prio, cat, when, today, settings.weekStartsOn]);

  const activeFilters = (prio !== "todas" ? 1 : 0) + (cat !== "todas" ? 1 : 0) + (when !== "qualquer" ? 1 : 0);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Tarefas</h1>
        <p className="sub">{tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"} no total</p>
      </header>

      <div className="search">
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar tarefas" aria-label="Pesquisar tarefas" enterKeyHint="search" />
        {query && <button type="button" className="icon-btn" aria-label="Limpar pesquisa" onClick={() => setQuery("")}><X size={16} /></button>}
        <button type="button" className={"icon-btn filter-btn" + (activeFilters ? " on" : "")} aria-label="Filtros" aria-expanded={panel} onClick={() => setPanel((p) => !p)}>
          <SlidersHorizontal size={18} />
          {activeFilters > 0 && <span className="dot-count">{activeFilters}</span>}
        </button>
      </div>

      <Segmented<StatusFilter>
        label="Situação"
        value={status}
        onChange={(v) => { setStatus(v); persist({ status: v }); }}
        options={[{ value: "pendentes", label: "Pendentes" }, { value: "concluidas", label: "Concluídas" }, { value: "todas", label: "Todas" }]}
      />

      {panel && (
        <section className="card filters">
          <div className="field">
            <span>Ordenar por</span>
            <Segmented<SortMode> label="Ordenar por" value={sort} onChange={(v) => { setSort(v); persist({ sort: v }); }} options={[{ value: "data", label: "Data" }, { value: "prioridade", label: "Prioridade" }]} />
          </div>
          <div className="field">
            <span>Quando</span>
            <div className="chips">
              {([["qualquer", "Qualquer data"], ["hoje", "Hoje"], ["semana", "Esta semana"], ["atrasadas", "Atrasadas"], ["sem-data", "Sem data"]] as [WhenFilter, string][]).map(([v, l]) => (
                <button key={v} type="button" className={"chip" + (when === v ? " on" : "")} onClick={() => setWhen(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Prioridade</span>
            <div className="chips">
              {([["todas", "Todas"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]] as [Priority | "todas", string][]).map(([v, l]) => (
                <button key={v} type="button" className={"chip" + (prio === v ? " on" : "")} onClick={() => setPrio(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Categoria</span>
            <div className="chips">
              <button type="button" className={"chip" + (cat === "todas" ? " on" : "")} onClick={() => setCat("todas")}>Todas</button>
              {categories.map((c) => (
                <button key={c.id} type="button" className={"chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}>
                  <i style={{ background: c.color }} aria-hidden="true" />{c.name}
                </button>
              ))}
              <button type="button" className={"chip" + (cat === "sem" ? " on" : "")} onClick={() => setCat("sem")}>Sem categoria</button>
            </div>
          </div>
          {activeFilters > 0 && (
            <button type="button" className="link-btn" onClick={() => { setPrio("todas"); setCat("todas"); setWhen("qualquer"); }}>Limpar filtros</button>
          )}
        </section>
      )}

      {status !== "concluidas" && <PinnedTask />}

      {list.length ? (
        <ul className="task-list">{list.map((o) => <TaskItem key={o.task.id} occ={o} onOpen={openTask} />)}</ul>
      ) : (
        <Empty
          icon={<ListChecks size={26} />}
          title={tasks.length ? "Nada encontrado" : "Comece sua lista"}
          text={tasks.length ? "Ajuste a pesquisa ou os filtros." : "Crie sua primeira tarefa e o DUDA cuida da organização."}
          action={!tasks.length ? <button type="button" className="btn btn-primary" onClick={newTask}>Criar tarefa</button> : undefined}
        />
      )}
      {list.some((o) => o.task.recurrence !== "nenhuma") && (
        <p className="hint center">Tarefas que se repetem aparecem pela próxima ocorrência pendente.</p>
      )}
    </div>
  );
}
