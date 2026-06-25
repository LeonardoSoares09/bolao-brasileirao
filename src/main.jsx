import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

/* Rede de segurança: se o render quebrar (ex.: cache de um deploy antigo com
   formato incompatível), em vez de deixar a tela verde vazia, limpamos o
   cache do bolão e recarregamos UMA vez. Se quebrar de novo logo após o
   reload, mostramos uma mensagem em vez de entrar em loop de reload. */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { caiu: false };
  }
  static getDerivedStateFromError() {
    return { caiu: true };
  }
  componentDidCatch() {
    let jaTentou = false;
    try { jaTentou = sessionStorage.getItem("bolao-recuperando") === "1"; } catch { /* ignore */ }
    if (!jaTentou) {
      try {
        sessionStorage.setItem("bolao-recuperando", "1");
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith("bolao-")) localStorage.removeItem(k);
        }
      } catch { /* ignore */ }
      window.location.reload();
    }
  }
  render() {
    if (this.state.caiu) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", color: "#cdeacd", font: "16px/1.5 system-ui, sans-serif", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: "40px" }}>⚽</div>
            <p>Não consegui abrir o bolão. Tente recarregar a página.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Se o app rodar alguns segundos sem cair, limpa o sinalizador pra que uma
   falha FUTURA possa tentar a auto-recuperação de novo. Não pode limpar na
   carga do módulo: um crash no primeiro render recarrega antes disso e, sem
   o sinalizador, entraria em loop de reload. */
setTimeout(() => {
  try { sessionStorage.removeItem("bolao-recuperando"); } catch { /* ignore */ }
}, 4000);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
