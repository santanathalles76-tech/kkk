import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Flame, TrendingUp } from "lucide-react";
import { ProgressRing, Segmented } from "../components/ui";
import { addDays, addMonths, fromKey, longDate, monthTitle, shortDate, todayKey, weekdayShort } from "../lib/dates";
import { computeStats, periodRange, streak, weeklyHistory, type Period } from "../lib/stats";
import { useStore } from "../lib/store";
import { PRIORITY_LABEL } from "../lib/types";

export function Progress() {
  const { tasks, settings } = useStore();
  const today = todayKey();
  const [period, setPeriod] = useState<Period>("semana");
  const [anchor, setAnchor] = useState(today);
  const [start, end] = periodRange(period, anchor, settings.weekStartsOn);
  const s = useMemo(() => computeStats(tasks, start, end), [tasks, start, end]);
  const st = useMemo(() => streak(tasks), [tasks]);
  const history = useMemo(() => weeklyHistory(tasks, 8, settings.weekStartsOn), [tasks, settings.weekStartsOn]);
  const totalDone = useMemo(() => tasks.reduce((n, t) => n + Object.keys(t.completions).length, 0), [tasks]);

  const shift = (dir: 1 | -1) => setAnchor((a) => (period === "mes" ? addMonths(a, dir) : addDays(a, period === "semana" ? 7 * dir : dir)));
  const label = period === "dia" ? longDate(start) : period === "semana" ? shortDate(start) + " – " + shortDate(end) : monthTitle(start);
  const canNext = end < today;
  const maxPlanned = Math.max(1, ...s.days.map((d) => d.planned));

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Progresso</h1>
        <p className="sub">Seu ritmo, sem pressa</p>
      </header>

      <Segmented<Period> label="Período" value={period} onChange={(p) => { setPeriod(p); setAnchor(today); }} options={[{ value: "dia", label: "Dia" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mês" }]} />

      <div className="cal-nav">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label="Período anterior"><ChevronLeft size={22} /></button>
        <h2>{label}</h2>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label="Próximo período" disabled={!canNext}><ChevronRight size={22} /></button>
      </div>

      <section className="card summary">
        <ProgressRing value={s.rate} size={88} label="Conclusão do período" />
        <div className="summary-text">
          <h2>Conclusão</h2>
          <p><b>{s.done}</b> de <b>{s.planned}</b> tarefas planejadas</p>
          {s.undatedDone > 0 && <p className="muted small">+ {s.undatedDone} sem data concluídas no período</p>}
        </div>
      </section>

      <div className="stat-grid">
        <div className="stat"><Flame size={18} aria-hidden="true" /><b>{st}</b><span>{st === 1 ? "dia completo seguido" : "dias completos seguidos"}</span></div>
        <div className="stat"><TrendingUp size={18} aria-hidden="true" /><b>{totalDone}</b><span>concluídas desde o início</span></div>
      </div>

      {period !== "dia" && (
        <section className="card">
          <h3 className="card-title">Tarefas por dia</h3>
          {s.planned === 0 ? <p className="muted small">Sem tarefas planejadas neste período.</p> : (
            <div className={"bars" + (period === "mes" ? " dense" : "")} role="img" aria-label={"Tarefas concluídas por dia, " + label}>
              {s.days.map((d) => (
                <div key={d.date} className={"bar" + (d.date === today ? " today" : "")} title={shortDate(d.date) + ": " + d.done + "/" + d.planned}>
                  <div className="bar-track" style={{ height: (d.planned / maxPlanned) * 100 + "%" }}>
                    <div className="bar-fill" style={{ height: d.planned ? (d.done / d.planned) * 100 + "%" : 0 }} />
                  </div>
                  <span>{period === "semana" ? weekdayShort(fromKey(d.date).getDay()).slice(0, 1) : fromKey(d.date).getDate() % 5 === 1 ? fromKey(d.date).getDate() : ""}</span>
                </div>
              ))}
            </div>
          )}
          <p className="legend"><i className="lg-fill" /> concluídas <i className="lg-track" /> planejadas</p>
        </section>
      )}

      <section className="card">
        <h3 className="card-title">Por prioridade</h3>
        {(["alta", "media", "baixa"] as const).map((p) => {
          const v = s.byPriority[p];
          const pct = v.planned ? Math.round((v.done / v.planned) * 100) : 0;
          return (
            <div key={p} className="meter">
              <span className={"prio-tag prio-" + p}>{PRIORITY_LABEL[p]}</span>
              <div className="meter-track"><div className={"meter-fill prio-bg-" + p} style={{ width: pct + "%" }} /></div>
              <b>{v.done}/{v.planned}</b>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3 className="card-title">Histórico das últimas 8 semanas</h3>
        <div className="history" role="img" aria-label="Taxa de conclusão semanal">
          {history.map((h) => (
            <div key={h.start} className="hist">
              <div className="hist-track"><div className="hist-fill" style={{ height: (h.planned ? h.rate : 0) + "%" }} /></div>
              <b>{h.planned ? h.rate + "%" : "–"}</b>
              <span>{shortDate(h.start)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
