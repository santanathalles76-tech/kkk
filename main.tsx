import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { StoreProvider } from "./lib/store";
import "./styles/app.css";

// Service worker: guarda o app para funcionar offline e se atualiza sozinho quando houver versão nova
if ("serviceWorker" in navigator) {
  registerSW({
    immediate: true,
    onRegisterError: (e) => console.warn("DUDA: service worker não registrado", e)
  });
}

// Teclado virtual do iPhone: mede quanto ele cobre a tela para a folha de edição subir junto
const vv = window.visualViewport;
if (vv) {
  const onResize = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", (kb > 80 ? kb : 0) + "px");
  };
  vv.addEventListener("resize", onResize);
  vv.addEventListener("scroll", onResize);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
);
