import { useEffect, useState } from "react";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { addDays, friendlyDate, todayKey } from "../lib/dates";
import { deliverFile } from "../lib/files";
import { buildIcs } from "../lib/reminders";
import { CATEGORY_COLORS, useStore, type TaskInput } from "../lib/store";
import { RECURRENCE_LABEL, type Occurrence, type Priority, type Recurrence } from "../lib/types";
import { Confirm, Segmented, Sheet } from "./ui";

export interface SheetTarget {
  occ?: Occurrence;
  date?: string | null;
}

const REMINDERS: { value: string; label: string }[] = [
  { value: "", label: "Sem lembrete" },
  { value: "0", label: "Na hora" },
  { value: "5", label: "5 min antes" },
  { value: "15", label: "15 min antes" },
  { value: "30", label: "30 min antes" },
  { value: "60", label: "1 hora antes" },
  { value: "1440", label: "1 dia antes" }
];

function blank(date: string | null, reminder: number | null): TaskInput {
  return { title: "", description: "", date, time: null, priority: "media", categoryId: null, recurrence: "nenhuma", until: null, reminder };
}

export function TaskSheet({ target, onClose }: { target: SheetTarget | null; onClose: () => void }) {
  const store = useStore();
  const { categories, settings } = store;
  const editing = target?.occ?.task ?? null;
  const [form, setForm] = useState<TaskInput>(blank(todayKey(), settings.defaultReminder));
  const [error, setError] = useState("");
  const [newCat, setNewCat] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setError("");
    setNewCat(null);
    setConfirmDelete(false);
    if (target.occ) {
      const { id: _id, completions: _c, skipped: _s, createdAt: _a, updatedAt: _u, ...rest } = target.occ.task;
      setForm(rest);
    } else {
      setForm(blank(target.date === undefined ? todayKey() : target.date, settings.defaultReminder));
    }
  }, [target, settings.defaultReminder]);

  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const occ = target?.occ;
  const isSeries = !!editing && editing.recurrence !== "nenhuma";

  async function save() {
    if (saving) return;
    const title = form.title.trim();
    if (!title) { setError("Dê um título para a tarefa."); return; }
    if (form.until && form.date && form.until < form.date) { setError("A repetição precisa terminar depois da data inicial."); return; }
    setSaving(true);
    try {
      const data: TaskInput = {
        ...form,
        title,
        description: form.description.trim(),
        recurrence: form.date ? form.recurrence : "nenhuma",
        until: form.date && form.recurrence !== "nenhuma" ? form.until : null
      };
      if (editing) {
        await store.updateTask(editing.id, data);
        store.toast("Tarefa atualizada");
      } else {
        const t = await store.addTask(data);
        if (t) store.toast("Tarefa criada");
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function createCategory() {
    if (newCat === null) return;
    const c = await store.addCategory(newCat, CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
    if (c) { set("categoryId", c.id); setNewCat(null); }
  }

  async function move(to: string) {
    if (!editing || !occ) return;
    await store.moveOccurrence(editing.id, occ.date, to);
    store.toast("Movida para " + friendlyDate(to).toLowerCase());
    onClose();
  }

  async function exportToCalendar() {
    if (!editing) return;
    const r = await deliverFile("duda-" + editing.title.slice(0, 30).replace(/[^\p{L}\p{N}]+/gu, "-") + ".ics", buildIcs([editing]), "text/calendar");
    if (r !== "cancelado") store.toast("Abra o arquivo para adicionar ao Calendário");
  }

  const today = todayKey();

  return (
    <>
      <Sheet
        open={!!target}
        title={editing ? "Editar tarefa" : "Nova tarefa"}
        onClose={onClose}
        footer={
          <>
            {editing && (
              <button type="button" className="btn btn-ghost danger-text" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={18} /> Excluir
              </button>
            )}
            <button type="button" className="btn btn-primary grow" onClick={save} disabled={saving}>
              {editing ? "Salvar alterações" : "Criar tarefa"}
            </button>
          </>
        }
      >
        <form className="form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label className="field">
            <span>Título</span>
            <input
              value={form.title}
              onChange={(e) => { set("title", e.target.value); setError(""); }}
              placeholder="O que precisa ser feito?"
              maxLength={140}
              enterKeyHint="done"
              autoFocus={!editing}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <label className="field">
            <span>Descrição</span>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Detalhes, links, observações" rows={3} maxLength={2000} />
          </label>

          <div className="field">
            <span>Prioridade</span>
            <Segmented<Priority>
              label="Prioridade"
              value={form.priority}
              onChange={(v) => set("priority", v)}
              options={[{ value: "alta", label: "Alta" }, { value: "media", label: "Média" }, { value: "baixa", label: "Baixa" }]}
            />
          </div>

          <div className="row2">
            <label className="field">
              <span>Data</span>
              <input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value || null)} />
            </label>
            <label className="field">
              <span>Horário</span>
              <input type="time" value={form.time ?? ""} onChange={(e) => set("time", e.target.value || null)} disabled={!form.date} />
            </label>
          </div>
          <div className="chips" aria-label="Atalhos de data">
            <button type="button" className={"chip" + (form.date === today ? " on" : "")} onClick={() => set("date", today)}>Hoje</button>
            <button type="button" className={"chip" + (form.date === addDays(today, 1) ? " on" : "")} onClick={() => set("date", addDays(today, 1))}>Amanhã</button>
            <button type="button" className={"chip" + (form.date === addDays(today, 7) ? " on" : "")} onClick={() => set("date", addDays(today, 7))}>Em 1 semana</button>
            <button type="button" className={"chip" + (form.date === null ? " on" : "")} onClick={() => { set("date", null); set("time", null); }}>Sem data</button>
          </div>

          {form.date && (
            <div className="row2">
              <label className="field">
                <span>Repetir</span>
                <select value={form.recurrence} onChange={(e) => set("recurrence", e.target.value as Recurrence)}>
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
                </select>
              </label>
              {form.recurrence !== "nenhuma" ? (
                <label className="field">
                  <span>Até (opcional)</span>
                  <input type="date" value={form.until ?? ""} min={form.date} onChange={(e) => set("until", e.target.value || null)} />
                </label>
              ) : (
                <label className="field">
                  <span>Lembrete</span>
                  <select value={form.reminder === null ? "" : String(form.reminder)} onChange={(e) => set("reminder", e.target.value === "" ? null : Number(e.target.value))} disabled={!form.time}>
                    {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          {form.date && form.recurrence !== "nenhuma" && (
            <label className="field">
              <span>Lembrete</span>
              <select value={form.reminder === null ? "" : String(form.reminder)} onChange={(e) => set("reminder", e.target.value === "" ? null : Number(e.target.value))} disabled={!form.time}>
                {REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}
          {form.date && !form.time && <p className="hint">Defina um horário para ativar o lembrete.</p>}

          <div className="field">
            <span>Categoria</span>
            <div className="chips">
              <button type="button" className={"chip" + (form.categoryId === null ? " on" : "")} onClick={() => set("categoryId", null)}>Nenhuma</button>
              {categories.map((c) => (
                <button key={c.id} type="button" className={"chip" + (form.categoryId === c.id ? " on" : "")} onClick={() => set("categoryId", c.id)}>
                  <i style={{ background: c.color }} aria-hidden="true" />{c.name}
                </button>
              ))}
              {newCat === null ? (
                <button type="button" className="chip chip-add" onClick={() => setNewCat("")}><Plus size={14} /> Nova</button>
              ) : (
                <span className="chip-input">
                  <input
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    placeholder="Nome da categoria"
                    maxLength={30}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createCategory(); } }}
                  />
                  <button type="button" className="btn btn-small btn-primary" onClick={createCategory}>Criar</button>
                </span>
              )}
            </div>
          </div>

          {editing && occ?.date && (
            <div className="field">
              <span>{isSeries ? "Mover só esta ocorrência" : "Alterar data rapidamente"}</span>
              <div className="chips">
                {occ.date !== today && <button type="button" className="chip" onClick={() => move(today)}>Para hoje</button>}
                <button type="button" className="chip" onClick={() => move(addDays(occ.date!, 1))}>+1 dia</button>
                <button type="button" className="chip" onClick={() => move(addDays(occ.date!, 7))}>+1 semana</button>
              </div>
            </div>
          )}

          {editing && editing.date && (
            <button type="button" className="btn btn-soft" onClick={exportToCalendar}>
              <CalendarPlus size={18} /> Adicionar ao Calendário do iPhone
            </button>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Sheet>

      <Confirm
        open={confirmDelete}
        title={isSeries ? "Excluir tarefa recorrente" : "Excluir tarefa"}
        text={isSeries ? "Você pode remover só esta ocorrência ou a série inteira." : "Esta tarefa será excluída. Você poderá desfazer logo em seguida."}
        confirmLabel={isSeries ? "Excluir a série" : "Excluir"}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (editing) await store.deleteTask(editing.id);
          setConfirmDelete(false);
          onClose();
        }}
        extra={
          isSeries && occ?.date ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={async () => {
                if (editing && occ?.date) await store.skipOccurrence(editing.id, occ.date);
                setConfirmDelete(false);
                onClose();
              }}
            >
              Só esta ocorrência
            </button>
          ) : undefined
        }
      />
    </>
  );
}
