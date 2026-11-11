import { Heart } from "lucide-react";

/** Tarefa fixa e permanente: não fica no banco de dados, então não pode ser editada, excluída nem apagada por backup ou limpeza. */
export function PinnedTask() {
  return (
    <div className="pinned" role="note" aria-label="Tarefa permanente: amar o Thalles">
      <span className="pinned-icon" aria-hidden="true"><Heart size={18} fill="currentColor" /></span>
      <span className="pinned-text">
        <b>AMAR O THALLES</b>
        <small>Tarefa permanente · todos os dias</small>
      </span>
    </div>
  );
}
