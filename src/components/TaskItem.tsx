import { AlarmClock, Check, Repeat } from "lucide-react";
import { friendlyDate, todayKey } from "../lib/dates";
import { useStore } from "../lib/store";
import { isOverdue } from "../lib/tasks";
import { PRIORITY_LABEL, type Occurrence } from "../lib/types";

export function TaskItem({ occ, onOpen, showDate = true }: { occ: Occurrence; onOpen: (o: Occurrence) => void; showDate?: boolean }) {
  const { categories, toggleOccurrence } = useStore();
  const t = occ.task;
  const cat = categories.find((c) => c.id === t.categoryId);
  const late = isOverdue(occ, todayKey());
  const toggle = () => {
    if (!occ.done && "vibrate" in navigator) navigator.vibrate?.(8);
    void toggleOccurrence(t.id, occ.key);
  };
  return (
    <li className={"task" + (occ.done ? " done" : "")}>
      <button
        type="button"
        className={"check prio-" + t.priority}
        role="checkbox"
        aria-checked={occ.done}
        aria-label={(occ.done ? "Desmarcar " : "Concluir ") + t.title}
        onClick={toggle}
      >
        {occ.done && <Check size={15} strokeWidth={3} />}
      </button>
      <button type="button" className="task-main" onClick={() => onOpen(occ)}>
        <span className="task-title">{t.title}</span>
        {t.description && <span className="task-desc">{t.description}</span>}
        <span className="task-meta">
          {showDate && occ.date && <span className={late ? "late" : ""}>{late ? "Atrasada · " : ""}{friendlyDate(occ.date)}</span>}
          {t.time && <span>{t.time}</span>}
          {cat && (
            <span className="cat">
              <i style={{ background: cat.color }} aria-hidden="true" />
              {cat.name}
            </span>
          )}
          <span className={"prio-tag prio-" + t.priority}>{PRIORITY_LABEL[t.priority]}</span>
          {t.recurrence !== "nenhuma" && <Repeat size={13} aria-label="Repete" />}
          {t.reminder !== null && t.time && <AlarmClock size={13} aria-label="Com lembrete" />}
        </span>
      </button>
    </li>
  );
}
