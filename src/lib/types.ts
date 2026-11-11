export type Priority = "alta" | "media" | "baixa";
export type Recurrence = "nenhuma" | "diaria" | "dias-uteis" | "semanal" | "mensal";

export interface Category {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Uma tarefa é guardada uma única vez, mesmo quando se repete.
 * As ocorrências de tarefas recorrentes são calculadas a partir de `date` e `recurrence`,
 * e a conclusão de cada ocorrência fica registrada em `completions` (chave = data da ocorrência).
 * Isso evita duplicar registros e mantém o histórico de produtividade fiel.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  /** Data (AAAA-MM-DD) ou null para tarefa sem data */
  date: string | null;
  /** Horário (HH:MM) ou null */
  time: string | null;
  priority: Priority;
  categoryId: string | null;
  recurrence: Recurrence;
  /** Último dia da repetição (AAAA-MM-DD), opcional */
  until: string | null;
  /** Minutos de antecedência para o lembrete; null = sem lembrete */
  reminder: number | null;
  /** chave da ocorrência -> data/hora ISO da conclusão. Tarefas sem data usam a chave "unica". */
  completions: Record<string, string>;
  /** Datas de ocorrências removidas individualmente de uma série */
  skipped: string[];
  createdAt: string;
  updatedAt: string;
}

export type ThemeMode = "auto" | "claro" | "escuro";
export type AccentName = "salvia" | "rosa" | "dourado";

export interface Settings {
  name: string;
  theme: ThemeMode;
  accent: AccentName;
  weekStartsOn: 0 | 1;
  showCompletedOnHome: boolean;
  notifications: boolean;
  defaultReminder: number | null;
  defaultView: "mes" | "semana" | "dia";
}

/** Uma ocorrência concreta de tarefa em uma data */
export interface Occurrence {
  task: Task;
  key: string;
  date: string | null;
  done: boolean;
  completedAt: string | null;
}

export interface BackupFile {
  app: "DUDA";
  version: 1;
  exportedAt: string;
  tasks: Task[];
  categories: Category[];
  settings: Settings;
}

export const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
export const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };
export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  nenhuma: "Não se repete",
  diaria: "Todos os dias",
  "dias-uteis": "Dias úteis",
  semanal: "Toda semana",
  mensal: "Todo mês"
};

export const DEFAULT_SETTINGS: Settings = {
  name: "Maria Eduarda",
  theme: "auto",
  accent: "salvia",
  weekStartsOn: 0,
  showCompletedOnHome: true,
  notifications: false,
  defaultReminder: 15,
  defaultView: "mes"
};
