import { store } from "../state/store.js";
import { showToast } from "./rankingView.js";

export function renderSettingsView() {
  const container = document.createElement("div");
  container.className = "view-container";

  function render() {
    container.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h1 style="font-size: 1.6rem; font-weight: 800; display: flex; align-items: center; gap: 8px;">
          ⚙️ Configurações & Dados
        </h1>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Personalize a interface do BolaBate+ e gerencie os backups do seu campeonato.
        </p>
      </div>

      <!-- Theme Switcher Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          🎨 Tema Visual
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          Escolha entre o tema Escuro (estádio noturno) e o tema Claro.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div id="theme-dark-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "dark" ? "var(--pitch-green)" : "var(--border-color)"}; background: #0F172A; color: #F8FAFC; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🌙</div>
            <strong style="font-size: 0.95rem;">Tema Escuro</strong>
            <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 2px;">(Padrão Estádio)</div>
          </div>

          <div id="theme-light-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "light" ? "var(--pitch-green)" : "var(--border-color)"}; background: #FFFFFF; color: #0F172A; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">☀️</div>
            <strong style="font-size: 0.95rem;">Tema Claro</strong>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">(Alto Contraste)</div>
          </div>
        </div>
      </div>

      <!-- Backup & Restore JSON Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          💾 Backup & Sincronização (JSON)
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          Exporte jogadores, pontuações, estrelas e o histórico completo de peladas (gols, assistências e votações) para transferir para outro celular ou computador.
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <button id="btn-export-json" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Exportar Dados (Baixar Arquivo JSON)
          </button>

          <label class="btn btn-secondary" style="display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            Importar Arquivo JSON
            <input type="file" id="input-import-json" accept=".json,application/json" style="display: none;" />
          </label>
        </div>
      </div>

      <!-- Reset & Default Data Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          🔄 Restaurar Dados Padrão
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          Restaura a tabela com os dados originais do app.
        </p>

        <button id="btn-reset-default" class="btn btn-danger btn-sm">
          Restaurar Dados Originais da Planilha
        </button>
      </div>

      <!-- App Info Card -->
      <div class="card" style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          📱 BolaBate+ v2.0 (Web & Android APK)
        </h3>
        <p>• Suporta instalação como <strong>PWA</strong> direto pelo navegador (Chrome/Edge).</p>
        <p>• Compatível com empacotamento nativo <strong>Android APK</strong> via Capacitor.</p>
        <p>• Todos os dados são armazenados localmente e podem ser salvos via exportação JSON.</p>
      </div>
    `;

    // Bind Theme
    container.querySelector("#theme-dark-btn").addEventListener("click", () => {
      store.setTheme("dark");
      render();
    });

    container
      .querySelector("#theme-light-btn")
      .addEventListener("click", () => {
        store.setTheme("light");
        render();
      });

    // Bind Export
    container
      .querySelector("#btn-export-json")
      .addEventListener("click", () => {
        const json = store.exportToJson();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const dateStr = new Date().toISOString().split("T")[0];
        a.href = url;
        a.download = `bolabate-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Backup JSON exportado com sucesso!");
      });

    // Bind Import
    const importInput = container.querySelector("#input-import-json");
    importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const result = store.importFromJson(content);
        if (result.success) {
          const historyMsg = result.historyCount
            ? ` e ${result.historyCount} ${result.historyCount === 1 ? "pelada" : "peladas"}`
            : "";
          showToast(
            `Sucesso! ${result.count} jogadores${historyMsg} importados.`,
          );
          render();
        } else {
          alert("Erro ao importar arquivo: " + result.error);
        }
      };
      reader.readAsText(file);
      importInput.value = "";
    });

    // Bind Reset
    container
      .querySelector("#btn-reset-default")
      .addEventListener("click", () => {
        if (
          confirm(
            "Atenção: deseja realmente restaurar os dados originais? Dados adicionados serão substituídos.",
          )
        ) {
          store.resetToDefaults();
          showToast("Dados restaurados para a planilha original!");
          render();
        }
      });
  }

  render();
  return container;
}
