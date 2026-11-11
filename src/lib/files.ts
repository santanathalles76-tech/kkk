/** Entrega um arquivo à usuária. No iPhone, prefere a folha de compartilhamento (salvar em Arquivos, AirDrop etc.). */
export async function deliverFile(name: string, content: string, type: string): Promise<"compartilhado" | "baixado" | "cancelado"> {
  const blob = new Blob([content], { type });
  try {
    const file = new File([blob], name, { type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: name });
      return "compartilhado";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
    /* sem suporte a compartilhar arquivos: segue para o download */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "baixado";
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}
