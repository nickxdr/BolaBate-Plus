import { store } from "../state/store.js";
import { showToast } from "./rankingView.js";
import {
  loginAdmin,
  logoutAdmin,
  listAdmins,
  addAdminAccount,
  removeAdminAccount,
  ADMIN_UID,
} from "../services/cloudSync.js";
import { auth } from "../services/firebase.js";

export function renderSettingsView() {
  const container = document.createElement("div");
  container.className = "view-container";

  function render() {
    const canChangeTeamSize =
      store.isAdmin && store.activePelada.status === "idle";

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
          Escolha os temas Escuro/Claro Bola Bate ou os temas Escuro/Claro tradicionais.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div id="theme-bolabate-dark-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "bolabate-dark" ? "#3B82F6" : "var(--border-color)"}; background: #0A0E1A; color: #F8FAFC; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🛡️</div>
            <strong style="font-size: 0.95rem;">Bola Bate Escuro</strong>
            <div style="font-size: 0.75rem; margin-top: 2px;">
              <span style="color: #3B82F6;">●</span>
              <span style="color: #E11D2E;">●</span>
              <span style="color: #F8FAFC;">●</span>
              (Padrão)
            </div>
          </div>

          <div id="theme-bolabate-light-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "bolabate-light" ? "#1D4ED8" : "var(--border-color)"}; background: #F5F7FC; color: #0B1220; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🛡️</div>
            <strong style="font-size: 0.95rem;">Bola Bate Claro</strong>
            <div style="font-size: 0.75rem; margin-top: 2px;">
              <span style="color: #1D4ED8;">●</span>
              <span style="color: #DC2626;">●</span>
              <span style="color: #94A3B8;">●</span>
            </div>
          </div>

          <div id="theme-dark-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "dark" ? "var(--pitch-green)" : "var(--border-color)"}; background: #0F172A; color: #F8FAFC; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🌙</div>
            <strong style="font-size: 0.95rem;">Tema Escuro</strong>
            <div style="font-size: 0.75rem; color: #94A3B8; margin-top: 2px;">(Clássico Estádio)</div>
          </div>

          <div id="theme-light-btn" class="card" style="padding: 14px; cursor: pointer; border: 2px solid ${store.theme === "light" ? "var(--pitch-green)" : "var(--border-color)"}; background: #FFFFFF; color: #0F172A; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">☀️</div>
            <strong style="font-size: 0.95rem;">Tema Claro</strong>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">(Clássico Alto Contraste)</div>
          </div>
        </div>
      </div>

      <!-- Match Format Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          ⚽ Formato da Pelada
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">
          Escolha entre o tradicional 5x5 (padrão do app) e o 6x6. Times, sugestões de equilíbrio e o campinho ao vivo se ajustam automaticamente ao número de jogadores por time.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div id="team-size-5-btn" class="card format-option-card ${store.teamSize === 5 ? "active" : ""} ${!canChangeTeamSize ? "disabled" : ""}" style="padding: 14px; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">5️⃣</div>
            <strong style="font-size: 0.95rem;">5x5</strong>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">(Padrão)</div>
          </div>

          <div id="team-size-6-btn" class="card format-option-card ${store.teamSize === 6 ? "active" : ""} ${!canChangeTeamSize ? "disabled" : ""}" style="padding: 14px; text-align: center; margin-bottom: 0;">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">6️⃣</div>
            <strong style="font-size: 0.95rem;">6x6</strong>
          </div>
        </div>

        ${
          !store.isAdmin
            ? `<p style="font-size: 0.78rem; color: var(--text-dim); margin-top: 10px;">Apenas o admin pode trocar o formato.</p>`
            : store.activePelada.status !== "idle"
              ? `<p style="font-size: 0.78rem; color: var(--accent-gold); margin-top: 10px;">⚠️ Termine ou cancele a pelada atual para trocar o formato.</p>`
              : ""
        }
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
            <button id="btn-admin-logout" class="btn btn-secondary">
              🚪 Sair do modo admin
            </button>
          </div>

          <!-- Admin management (only visible to authenticated admins) -->
          <div style="border-top: 1px solid var(--border-color); margin-top: 16px; padding-top: 14px;">
            <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 4px;">
              👑 Gerenciar Administradores
            </h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
              Cadastre novos admins com e-mail e senha.
            </p>

            <div id="admins-list" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
              <span style="font-size: 0.8rem; color: var(--text-muted);">Carregando administradores...</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <input id="new-admin-email" type="email" placeholder="E-mail do novo admin" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
              <input id="new-admin-password" type="password" placeholder="Senha (mínimo 6 caracteres)" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
              <button id="btn-add-admin" class="btn btn-primary">➕ Cadastrar Admin</button>
            </div>
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
          📱 BolaBate+ v4.0 (Web & Android APK)
        </h3>
        <p>• Suporta instalação como <strong>PWA</strong> direto pelo navegador (Chrome/Edge).</p>
        <p>• Compatível com empacotamento nativo <strong>Android APK</strong> via Capacitor.</p>
        <p>• Os dados ficam salvos na nuvem (Firebase) — alterações do administrador aparecem para todos automaticamente.</p>
      </div>
    `;

    // Bind Theme
    container
      .querySelector("#theme-bolabate-dark-btn")
      .addEventListener("click", () => {
        store.setTheme("bolabate-dark");
        render();
      });

    container
      .querySelector("#theme-bolabate-light-btn")
      .addEventListener("click", () => {
        store.setTheme("bolabate-light");
        render();
      });

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

    // Bind Match Format (5x5 / 6x6)
    function handleTeamSizeClick(size) {
      if (!canChangeTeamSize) {
        if (!store.isAdmin) {
          showToast("🔒 Apenas o admin pode trocar o formato.");
        } else {
          showToast(
            "⚠️ Termine ou cancele a pelada atual para trocar o formato.",
          );
        }
        return;
      }
      const result = store.setTeamSize(size);
      if (result?.success) {
        showToast(`⚽ Formato alterado para ${size}x${size}!`);
      } else if (result?.error) {
        showToast("❌ " + result.error);
      }
      render();
    }
    container
      .querySelector("#team-size-5-btn")
      .addEventListener("click", () => handleTeamSizeClick(5));
    container
      .querySelector("#team-size-6-btn")
      .addEventListener("click", () => handleTeamSizeClick(6));

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
          showToast(
            "❌ Login falhou: " +
              (err.code === "auth/invalid-credential"
                ? "e-mail ou senha incorretos."
                : err.message),
          );
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

    // Bind Admin Management (list / add / remove) — admin only.
    // NOTE: the elements below only exist in the DOM for admins; guard to avoid
    // crashing the whole settings screen for regular users.
    const adminsList = container.querySelector("#admins-list");
    async function refreshAdminsList() {
      if (!adminsList) return;
      try {
        const admins = await listAdmins();
        const currentUid = auth?.currentUser?.uid;
        adminsList.innerHTML = admins
          .map((a) => {
            const isSelf = a.uid === currentUid;
            const isRoot = a.uid === ADMIN_UID;
            const canRemove = !isSelf && !isRoot;
            return `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-secondary);">
              <div style="min-width: 0;">
                <div style="font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis;">${a.email || a.uid}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${isRoot ? "👑 administrador raiz" : isSelf ? "você" : ""}</div>
              </div>
              ${
                canRemove
                  ? `<button class="btn btn-danger btn-sm btn-remove-admin" data-uid="${a.uid}" data-email="${a.email || ""}" title="Remover admin">🗑️</button>`
                  : `<span style="font-size: 0.75rem; color: var(--text-dim);">—</span>`
              }
            </div>
          `;
          })
          .join("");
        adminsList.querySelectorAll(".btn-remove-admin").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const uid = btn.getAttribute("data-uid");
            const email = btn.getAttribute("data-email");
            if (
              !confirm(
                `Remover ${email} como administrador? Ele perderá o acesso de edição (a conta de login continua existindo).`,
              )
            ) {
              return;
            }
            btn.disabled = true;
            const result = await removeAdminAccount(uid);
            if (result.success) {
              showToast(`${email} não é mais administrador.`);
            } else {
              showToast("❌ " + result.error);
              btn.disabled = false;
            }
            refreshAdminsList();
          });
        });
      } catch (err) {
        adminsList.innerHTML = `<span style="font-size: 0.8rem; color: var(--accent-red);">Não foi possível carregar a lista (verifique as regras do Firestore).</span>`;
      }
    }
    refreshAdminsList();

    const addAdminBtn = container.querySelector("#btn-add-admin");
    if (addAdminBtn) {
      addAdminBtn.addEventListener("click", async () => {
        const email = container.querySelector("#new-admin-email").value.trim();
        const password = container.querySelector("#new-admin-password").value;
        if (!email || !password) {
          showToast("⚠️ Preencha o e-mail e a senha do novo admin.");
          return;
        }
        addAdminBtn.disabled = true;
        addAdminBtn.textContent = "Cadastrando...";
        const result = await addAdminAccount(email, password);
        if (result.success) {
          showToast(`👑 ${email} agora é administrador!`);
          container.querySelector("#new-admin-email").value = "";
          container.querySelector("#new-admin-password").value = "";
          refreshAdminsList();
        } else {
          showToast("❌ " + result.error);
        }
        addAdminBtn.disabled = false;
        addAdminBtn.textContent = "➕ Cadastrar Admin";
      });
    }
  }

  render();
  return container;
}
