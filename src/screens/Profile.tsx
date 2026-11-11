import { useEffect, useRef, useState } from "react";
import { Bell, CalendarPlus, Database, Download, Palette, Share, Smartphone, Tag, Trash2, Upload } from "lucide-react";
import { Confirm, Segmented } from "../components/ui";
import { todayKey } from "../lib/dates";
import { deliverFile, readFileText } from "../lib/files";
import { askPermission, buildIcs, isIos, isStandalone, notificationState, type NotifState } from "../lib/reminders";
import { CATEGORY_COLORS, useStore } from "../lib/store";
import { disablePush, enablePush, pushActive, pushServer, sendTestPush } from "../lib/push";
import { nextOccurrence } from "../lib/tasks";
import type { AccentName, Settings, ThemeMode } from "../lib/types";

const NOTIF_TEXT: Record<NotifState, string> = {
  permitida: "Ativas. Os lembretes disparam enquanto o DUDA estiver aberto ou ativo em segundo plano.",
  "nao-pedida": "Toque em ativar e permita as notificações.",
  negada: "Bloqueadas. Libere em Ajustes › Notificações › DUDA.",
  "precisa-instalar": "No iPhone, as notificações só funcionam com o DUDA instalado na Tela de Início (iOS 16.4 ou superior).",
  indisponivel: "Este navegador não oferece notificações para apps web."
};

export function Profile() {
  const store = useStore();
  const { settings, categories, tasks, updateSettings, toast } = store;
  const [name, setName] = useState(settings.name);
  const [notif, setNotif] = useState<NotifState>(notificationState());
  const [importData, setImportData] = useState<unknown>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [deleteCat, setDeleteCat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [server, setServer] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(pushActive());
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushServer().then(setServer).catch(() => setServer("")); }, []);

  async function activatePush() {
    if (busy) return;
    setBusy(true);
    try {
      await enablePush(tasks);
      setPushOn(true);
      setNotif(notificationState());
      await updateSettings({ notifications: true });
      toast("Pronto! Os lembretes chegam mesmo com o DUDA fechado.");
    } catch (e) {
      setNotif(notificationState());
      toast(e instanceof Error ? e.message : "Não foi possível ativar.", "erro");
    } finally {
      setBusy(false);
    }
  }

  async function deactivatePush() {
    setBusy(true);
    await disablePush();
    setPushOn(false);
    setBusy(false);
    toast("Notificações do servidor desativadas");
  }

  async function testPush() {
    setBusy(true);
    try {
      await sendTestPush();
      toast("Teste enviado. Pode bloquear a tela para conferir.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha no teste.", "erro");
    } finally {
      setBusy(false);
    }
  }

  async function enableNotifications() {
    const s = await askPermission();
    setNotif(s);
    if (s === "permitida") {
      await updateSettings({ notifications: true });
      toast("Notificações ativadas");
    } else if (s === "negada") toast("Permissão negada. Libere nos Ajustes do iPhone.", "erro");
  }

  async function testNotification() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts = { body: "Seus lembretes estão funcionando.", icon: "/icons/icon-192.png", tag: "duda-teste" };
      if (reg) await reg.showNotification("DUDA", opts);
      else new Notification("DUDA", opts);
    } catch {
      toast("Não foi possível exibir a notificação neste aparelho.", "erro");
    }
  }

  async function exportBackup() {
    const data = JSON.stringify(store.exportBackup(), null, 2);
    const r = await deliverFile("duda-backup-" + todayKey() + ".json", data, "application/json");
    if (r !== "cancelado") toast("Backup gerado. Guarde em Arquivos ou no iCloud Drive.");
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = JSON.parse(await readFileText(file));
      if (data?.app !== "DUDA") throw new Error();
      setImportData(data);
    } catch {
      toast("Arquivo inválido. Escolha um backup .json do DUDA.", "erro");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runImport(mode: "mesclar" | "substituir") {
    try {
      const r = await store.importBackup(importData, mode);
      toast(r.tasks + " tarefas importadas");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao importar.", "erro");
    }
    setImportData(null);
  }

  async function exportCalendar() {
    const today = todayKey();
    const list = tasks.filter((t) => t.date && nextOccurrence(t, today));
    if (!list.length) { toast("Nenhuma tarefa futura com data para exportar."); return; }
    const r = await deliverFile("duda-agenda.ics", buildIcs(list), "text/calendar");
    if (r !== "cancelado") toast(list.length + " tarefas prontas para o Calendário");
  }

  const set = (patch: Partial<Settings>) => void updateSettings(patch);

  return (
    <div className="screen">
      <header className="profile-head">
        <div className="avatar" aria-hidden="true">D</div>
        <h1>{settings.name || "Maria Eduarda"}</h1>
        <p className="sub">{tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"} · {categories.length} categorias</p>
      </header>

      <section className="card settings">
        <h3 className="card-title"><Palette size={18} aria-hidden="true" /> Personalização</h3>
        <label className="field">
          <span>Seu nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { const v = name.trim() || "Maria Eduarda"; setName(v); if (v !== settings.name) set({ name: v }); }}
            maxLength={40}
            autoComplete="name"
          />
        </label>
        <div className="field">
          <span>Aparência</span>
          <Segmented<ThemeMode> label="Aparência" value={settings.theme} onChange={(v) => set({ theme: v })} options={[{ value: "auto", label: "Automática" }, { value: "claro", label: "Clara" }, { value: "escuro", label: "Escura" }]} />
        </div>
        <div className="field">
          <span>Cor de destaque</span>
          <div className="swatches" role="radiogroup" aria-label="Cor de destaque">
            {([["salvia", "Sálvia", "#718C73"], ["rosa", "Rosa", "#C88F82"], ["dourado", "Dourado", "#C49A56"]] as [AccentName, string, string][]).map(([v, l, c]) => (
              <button key={v} type="button" role="radio" aria-checked={settings.accent === v} className={"swatch" + (settings.accent === v ? " on" : "")} onClick={() => set({ accent: v })}>
                <i style={{ background: c }} aria-hidden="true" />{l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card settings">
        <h3 className="card-title"><Smartphone size={18} aria-hidden="true" /> Preferências</h3>
        <div className="field">
          <span>A semana começa no</span>
          <Segmented<"0" | "1"> label="Início da semana" value={String(settings.weekStartsOn) as "0" | "1"} onChange={(v) => set({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: "0", label: "Domingo" }, { value: "1", label: "Segunda" }]} />
        </div>
        <div className="field">
          <span>Agenda abre em</span>
          <Segmented<Settings["defaultView"]> label="Visualização padrão" value={settings.defaultView} onChange={(v) => set({ defaultView: v })} options={[{ value: "mes", label: "Mês" }, { value: "semana", label: "Semana" }, { value: "dia", label: "Dia" }]} />
        </div>
        <label className="switch-row">
          <span>Mostrar concluídas na página inicial</span>
          <input type="checkbox" role="switch" checked={settings.showCompletedOnHome} onChange={(e) => set({ showCompletedOnHome: e.target.checked })} />
        </label>
      </section>

      <section className="card settings">
        <h3 className="card-title"><Bell size={18} aria-hidden="true" /> Lembretes</h3>
        {server ? (
          pushOn ? (
            <>
              <p className="push-status on">Ativas, inclusive com o DUDA fechado e a tela bloqueada.</p>
              <div className="btn-row">
                <button type="button" className="btn btn-soft" onClick={testPush} disabled={busy}>Enviar teste</button>
                <button type="button" className="btn btn-ghost" onClick={deactivatePush} disabled={busy}>Desativar</button>
              </div>
            </>
          ) : notif === "precisa-instalar" || notif === "indisponivel" || notif === "negada" ? (
            <p className="muted small">{NOTIF_TEXT[notif]}</p>
          ) : (
            <>
              <p className="muted small">Receba os lembretes no horário, mesmo com o app fechado.</p>
              <button type="button" className="btn btn-primary" onClick={activatePush} disabled={busy}>{busy ? "Ativando…" : "Ativar notificações"}</button>
            </>
          )
        ) : (
          <>
            <p className="muted small">{NOTIF_TEXT[notif]}</p>
            {notif === "nao-pedida" && <button type="button" className="btn btn-primary" onClick={enableNotifications}>Ativar notificações</button>}
            {notif === "permitida" && <button type="button" className="btn btn-soft" onClick={testNotification}>Enviar notificação de teste</button>}
          </>
        )}
        <label className="field">
          <span>Lembrete padrão das novas tarefas</span>
          <select value={settings.defaultReminder === null ? "" : String(settings.defaultReminder)} onChange={(e) => set({ defaultReminder: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Sem lembrete</option>
            <option value="0">Na hora</option>
            <option value="5">5 min antes</option>
            <option value="15">15 min antes</option>
            <option value="30">30 min antes</option>
            <option value="60">1 hora antes</option>
          </select>
        </label>
        <div className="note">
          <b>{pushOn ? "Reserva sem internet" : "Lembrete garantido com o app fechado"}</b>
          <p>{pushOn ? "Se o celular estiver sem internet na hora do aviso, o Calendário do iPhone continua avisando." : "Exporte suas tarefas para o Calendário: ele avisa no horário mesmo com o DUDA fechado."}</p>
          <button type="button" className="btn btn-soft" onClick={exportCalendar}><CalendarPlus size={18} /> Exportar tarefas futuras para o Calendário</button>
        </div>
      </section>

      <section className="card settings">
        <h3 className="card-title"><Tag size={18} aria-hidden="true" /> Categorias</h3>
        <ul className="cat-list">
          {categories.map((c) => (
            <li key={c.id}>
              <label className="color-pick" style={{ background: c.color }}>
                <span className="sr-only">Cor de {c.name}</span>
                <select value={c.color} onChange={(e) => void store.updateCategory(c.id, { color: e.target.value })} aria-label={"Cor de " + c.name}>
                  {CATEGORY_COLORS.map((col) => <option key={col} value={col}>{col}</option>)}
                </select>
              </label>
              <input
                defaultValue={c.name}
                maxLength={30}
                aria-label="Nome da categoria"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void store.updateCategory(c.id, { name: v }); else e.target.value = c.name; }}
              />
              <span className="muted small">{tasks.filter((t) => t.categoryId === c.id).length}</span>
              <button type="button" className="icon-btn" aria-label={"Excluir " + c.name} onClick={() => setDeleteCat(c.id)}><Trash2 size={17} /></button>
            </li>
          ))}
        </ul>
        <AddCategory />
      </section>

      <section className="card settings">
        <h3 className="card-title"><Database size={18} aria-hidden="true" /> Dados e backup</h3>
        <p className="muted small">
          Tudo fica salvo neste aparelho{store.storageKind === "indexeddb" ? " (banco local)" : store.storageKind === "localstorage" ? " (armazenamento reserva)" : " apenas nesta sessão"}
          {store.persisted ? ", protegido contra limpeza automática." : "."} Faça um backup de vez em quando.
        </p>
        <div className="btn-row">
          <button type="button" className="btn btn-soft" onClick={exportBackup}><Download size={18} /> Exportar backup</button>
          <button type="button" className="btn btn-soft" onClick={() => fileRef.current?.click()}><Upload size={18} /> Importar backup</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onPickFile(e.target.files?.[0])} />
        <button type="button" className="btn btn-ghost danger-text" onClick={() => setConfirmClear(true)}><Trash2 size={18} /> Apagar todos os dados</button>
      </section>

      {!isStandalone() && (
        <section className="card settings">
          <h3 className="card-title"><Share size={18} aria-hidden="true" /> Instalar no iPhone</h3>
          <ol className="steps">
            <li>Abra este endereço no <b>Safari</b>.</li>
            <li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li>
            <li>Escolha <b>Adicionar à Tela de Início</b> e confirme o nome <b>DUDA</b>.</li>
            <li>Abra pelo ícone D na Tela de Início.</li>
          </ol>
          {!isIos() && <p className="muted small">Em outros aparelhos, use a opção “Instalar app” do navegador.</p>}
        </section>
      )}

      <p className="footer-note">DUDA 1.0 · feito para Maria Eduarda</p>

      <Confirm
        open={importData !== null}
        title="Importar backup"
        text="Mesclar junta o backup com o que já está aqui, sem duplicar. Substituir apaga os dados atuais e usa só o backup."
        confirmLabel="Mesclar"
        onConfirm={() => runImport("mesclar")}
        onCancel={() => setImportData(null)}
        extra={<button type="button" className="btn btn-danger" onClick={() => runImport("substituir")}>Substituir</button>}
      />
      <Confirm
        open={confirmClear}
        title="Apagar todos os dados?"
        text="Todas as tarefas e categorias serão removidas deste aparelho. Exporte um backup antes se quiser guardar."
        confirmLabel="Apagar tudo"
        danger
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => { await store.clearAll(); setConfirmClear(false); toast("Dados apagados"); }}
      />
      <Confirm
        open={deleteCat !== null}
        title="Excluir categoria?"
        text="As tarefas desta categoria continuam salvas, apenas ficam sem categoria."
        confirmLabel="Excluir"
        danger
        onCancel={() => setDeleteCat(null)}
        onConfirm={async () => { if (deleteCat) await store.deleteCategory(deleteCat); setDeleteCat(null); }}
      />
    </div>
  );
}

function AddCategory() {
  const { addCategory, categories } = useStore();
  const [value, setValue] = useState("");
  return (
    <form className="add-cat" onSubmit={async (e) => { e.preventDefault(); if (await addCategory(value, CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length])) setValue(""); }}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nova categoria" maxLength={30} aria-label="Nova categoria" />
      <button type="submit" className="btn btn-small btn-primary" disabled={!value.trim()}>Adicionar</button>
    </form>
  );
}
