import { store } from "../state/store.js";
import { showToast } from "./rankingView.js";
import { loginAdmin, logoutAdmin, pushStateNow } from "../services/cloudSync.js";

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

      <!-- Cloud Sync & Admin Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          ☁️ Nuvem & Administrador
        </h2>

        ${
          store.isAdmin
            ? `
          <p style="font-size: 0.85rem; color: var(--pitch-green); margin-bottom: 12px;">
            ✅ Logado como <strong>Administrador</strong> — suas alterações são sincronizadas automaticamente com a nuvem.
          </p>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <button id="btn-cloud-push" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 10px;">
              ⬆️ Enviar dados locais para a nuvem
            </button>
            <button id="btn-admin-logout" class="btn btn-secondary">
              🚪 Sair do modo admin (voltar a somente leitura)
            </button>
          </div>
        `
            : `
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">
            Você está no modo <strong>somente leitura</strong>. Entre como administrador para editar jogadores, estatísticas e peladas.
          </p>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <input id="admin-email" type="email" placeholder="E-mail do admin" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
            <input id="admin-password" type="password" placeholder="Senha" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
            <button id="btn-admin-login" class="btn btn-primary">
              🔑 Entrar como Administrador
            </button>
          </div>
        `
        }
      </div>

      <!-- App Info Card -->
      <div class="card" style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          📱 BolaBate+ v2.2 (Web & Android APK)
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

    // Bind Cloud & Admin
    const loginBtn = container.querySelector("#btn-admin-login");
    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        const email = container.querySelector("#admin-email").value.trim();
        const password = container.querySelector("#admin-password").value;
        if (!email || !password) {
          showToast("⚠️ Preencha e-mail e senha do admin.");
          return;
        }
        loginBtn.disabled = true;
        loginBtn.textContent = "Entrando...";
        try {
          await loginAdmin(email, password);
          showToast("👑 Bem-vindo, admin!");
        } catch (err) {
          showToast("❌ Login falhou: " + (err.code === "auth/invalid-credential" ? "e-mail ou senha incorretos." : err.message));
          loginBtn.disabled = false;
          loginBtn.textContent = "🔑 Entrar como Administrador";
        }
      });
    }

    const logoutBtn = container.querySelector("#btn-admin-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await logoutAdmin();
          showToast("Modo somente leitura ativado.");
        } catch (err) {
          showToast("❌ Erro ao sair: " + err.message);
        }
      });
    }

    const pushBtn = container.querySelector("#btn-cloud-push");
    if (pushBtn) {
      pushBtn.addEventListener("click", async () => {
        pushBtn.disabled = true;
        pushBtn.textContent = "Enviando...";
        try {
          await pushStateNow(store);
          showToast("☁️ Dados enviados para a nuvem com sucesso!");
        } catch (err) {
          showToast("❌ Erro ao enviar: " + err.message);
        }
        pushBtn.disabled = false;
        pushBtn.textContent = "⬆️ Enviar dados locais para a nuvem";
      });
    }

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
