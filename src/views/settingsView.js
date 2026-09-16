import { store, PELADA_ID_KEY, PELADA_NAME_KEY } from "../state/store.js";
import { showToast } from "./rankingView.js";
import {
  loginAdmin,
  logoutAdmin,
  listAdmins,
  addAdminAccount,
  removeAdminAccount,
  createPelada,
  listAllPeladas,
  setPeladaBlocked,
  ADMIN_UID,
} from "../services/cloudSync.js";
import { auth } from "../services/firebase.js";

const ROLE_KEY = "bolabate_role_v1";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function renderSettingsView() {
  const container = document.createElement("div");
  container.className = "view-container";

  function render() {
    const canChangeTeamSize =
      store.isAdmin && store.activePelada.status === "idle";
    const isRootAdmin = store.isAdmin && auth?.currentUser?.uid === ADMIN_UID;

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

      <!-- Match Format Card (admin-only — regular players have no reason to see this control) -->
      ${
        store.isAdmin
          ? `
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
          store.activePelada.status !== "idle"
            ? `<p style="font-size: 0.78rem; color: var(--accent-gold); margin-top: 10px;">⚠️ Termine ou cancele a pelada atual para trocar o formato.</p>`
            : ""
        }
      </div>
      `
          : ""
      }

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

      <!-- Pelada (tenant) Card -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          🏟️ Pelada
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px;">
          Você está na pelada <strong>${escapeHtml(store.peladaName || store.peladaId)}</strong> (ID: ${escapeHtml(store.peladaId)}).
        </p>
        <button id="btn-pelada-logout" class="btn btn-secondary">🚪 Sair da pelada</button>

        ${
          isRootAdmin
            ? `
          <div style="border-top: 1px solid var(--border-color); margin-top: 16px; padding-top: 14px;">
            <h3 style="font-size: 0.95rem; font-weight: 700; margin-bottom: 4px;">
              ➕ Criar nova pelada
            </h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
              Visível apenas para o administrador raiz. A nova pelada começa sem nenhum jogador.
            </p>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <input id="new-pelada-id" type="text" autocomplete="off" autocapitalize="off" placeholder="ID (ex: nomedapelada)" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
              <input id="new-pelada-name" type="text" placeholder="Nome de exibição" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
              <input id="new-pelada-password" type="text" placeholder="Senha compartilhada" style="padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-main); font-size: 0.9rem;" />
              <button id="btn-create-pelada" class="btn btn-primary">🏟️ Criar Pelada</button>
            </div>
          </div>
        `
            : ""
        }
      </div>

      ${
        isRootAdmin
          ? `
      <!-- Root Admin: manage every pelada's access -->
      <div class="card">
        <h2 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
          🔒 Gerenciar Peladas (raiz)
        </h2>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px;">
          Bloquear uma pelada corta o acesso imediatamente, inclusive de quem já está logado — útil para assinaturas vencidas.
        </p>
        <div id="all-peladas-list" style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Carregando peladas...</span>
        </div>
      </div>
      `
          : ""
      }

      <!-- App Info Card -->
      <div class="card" style="font-size: 0.82rem; color: var(--text-muted); line-height: 1.6;">
        <h3 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
          📱 BolaBate+ v5.0 (Web & Android APK)
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
    // Team-size buttons only exist in the DOM for admins (the whole card is hidden otherwise).
    container
      .querySelector("#team-size-5-btn")
      ?.addEventListener("click", () => handleTeamSizeClick(5));
    container
      .querySelector("#team-size-6-btn")
      ?.addEventListener("click", () => handleTeamSizeClick(6));

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

    // Bind "Sair da pelada" — forgets which pelada this device is signed into
    // and reloads, which sends the user back to the pelada login splash.
    container
      .querySelector("#btn-pelada-logout")
      .addEventListener("click", () => {
        openSignOutPeladaModal();
      });

    // Bind "Criar nova pelada" (root admin only — element only exists in the DOM for them).
    const createPeladaBtn = container.querySelector("#btn-create-pelada");
    if (createPeladaBtn) {
      createPeladaBtn.addEventListener("click", async () => {
        const id = container
          .querySelector("#new-pelada-id")
          .value.trim()
          .toLowerCase();
        const name = container.querySelector("#new-pelada-name").value.trim();
        const password = container.querySelector("#new-pelada-password").value;
        if (!/^[a-z0-9_-]{3,30}$/.test(id)) {
          showToast(
            "⚠️ ID inválido — use 3 a 30 letras minúsculas, números, - ou _.",
          );
          return;
        }
        if (!password || password.length < 6) {
          showToast("⚠️ A senha precisa ter pelo menos 6 caracteres.");
          return;
        }
        createPeladaBtn.disabled = true;
        createPeladaBtn.textContent = "Criando...";
        const result = await createPelada(id, name, password);
        if (result.success) {
          showToast(
            `🏟️ Pelada "${id}" criada! Compartilhe o ID e a senha com o grupo.`,
          );
          container.querySelector("#new-pelada-id").value = "";
          container.querySelector("#new-pelada-name").value = "";
          container.querySelector("#new-pelada-password").value = "";
        } else {
          showToast("❌ " + result.error);
        }
        createPeladaBtn.disabled = false;
        createPeladaBtn.textContent = "🏟️ Criar Pelada";
      });
    }

    // Bind "Gerenciar Peladas" (root admin only — element only exists in the DOM for them).
    const allPeladasList = container.querySelector("#all-peladas-list");
    async function refreshAllPeladasList() {
      if (!allPeladasList) return;
      try {
        const peladas = await listAllPeladas();
        allPeladasList.innerHTML = peladas
          .map((p) => {
            const blocked = !!p.blocked;
            const displayName = escapeHtml(p.name || p.id);
            return `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-secondary);">
              <div style="min-width: 0;">
                <div style="font-size: 0.85rem; font-weight: 600; overflow: hidden; text-overflow: ellipsis;">${displayName} ${blocked ? "🔒" : ""}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">ID: ${escapeHtml(p.id)}${blocked ? " — bloqueada" : ""}</div>
              </div>
              <button class="btn ${blocked ? "btn-primary" : "btn-danger"} btn-sm btn-toggle-pelada-block" data-id="${escapeHtml(p.id)}" data-name="${displayName}" data-blocked="${blocked ? "1" : "0"}">
                ${blocked ? "🔓 Desbloquear" : "🔒 Bloquear"}
              </button>
            </div>
          `;
          })
          .join("");
        allPeladasList.querySelectorAll(".btn-toggle-pelada-block").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-id");
            const name = btn.getAttribute("data-name");
            const currentlyBlocked = btn.getAttribute("data-blocked") === "1";
            openTogglePeladaBlockModal(id, name, currentlyBlocked, refreshAllPeladasList);
          });
        });
      } catch (err) {
        allPeladasList.innerHTML = `<span style="font-size: 0.8rem; color: var(--accent-red);">Não foi possível carregar a lista de peladas.</span>`;
      }
    }
    refreshAllPeladasList();

    // Bind Admin Management (list / add / remove) — admin only.
    // NOTE: the elements below only exist in the DOM for admins; guard to avoid
    // crashing the whole settings screen for regular users.
    const adminsList = container.querySelector("#admins-list");
    async function refreshAdminsList() {
      if (!adminsList) return;
      try {
        const admins = await listAdmins(store.peladaId);
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
            const result = await removeAdminAccount(uid, store.peladaId);
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
        const result = await addAdminAccount(email, password, store.peladaId);
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

/** Confirmation modal for leaving the current pelada (returns the user to the login splash). */
function openSignOutPeladaModal() {
  const modalContainer = document.getElementById("modal-container");

  modalContainer.innerHTML = `
    <div class="modal-overlay" id="pelada-logout-overlay">
      <div class="modal-content" style="max-width: 420px;">
        <div class="modal-header">
          <h2 class="modal-title">🚪 Sair da pelada?</h2>
          <button class="modal-close" id="pelada-logout-close" title="Fechar">✕</button>
        </div>

        <div style="font-size: 0.9rem; color: var(--text-main); line-height: 1.6;">
          <p style="margin-bottom: 4px;">
            Você vai precisar digitar o ID e a senha da pelada novamente para entrar.
          </p>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button id="pelada-logout-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="pelada-logout-confirm" class="btn btn-danger">Sair da pelada</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { modalContainer.innerHTML = ""; };
  const overlay = modalContainer.querySelector("#pelada-logout-overlay");
  modalContainer.querySelector("#pelada-logout-close").addEventListener("click", close);
  modalContainer.querySelector("#pelada-logout-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  modalContainer.querySelector("#pelada-logout-confirm").addEventListener("click", () => {
    localStorage.removeItem(PELADA_ID_KEY);
    localStorage.removeItem(PELADA_NAME_KEY);
    localStorage.removeItem(ROLE_KEY);
    location.reload();
  });
}

/** Root-admin-only confirmation modal for blocking/unblocking one pelada's access. */
function openTogglePeladaBlockModal(peladaId, name, currentlyBlocked, onDone) {
  const modalContainer = document.getElementById("modal-container");
  const action = currentlyBlocked ? "Desbloquear" : "Bloquear";

  modalContainer.innerHTML = `
    <div class="modal-overlay" id="pelada-block-overlay">
      <div class="modal-content" style="max-width: 440px;">
        <div class="modal-header">
          <h2 class="modal-title" style="color: ${currentlyBlocked ? "var(--pitch-green)" : "var(--accent-red)"};">
            ${currentlyBlocked ? "🔓" : "🔒"} ${action} "${escapeHtml(name)}"?
          </h2>
          <button class="modal-close" id="pelada-block-close" title="Fechar">✕</button>
        </div>

        <div style="font-size: 0.9rem; color: var(--text-main); line-height: 1.6;">
          <p>
            ${
              currentlyBlocked
                ? "O acesso será restaurado imediatamente para todos os usuários dessa pelada."
                : "Todos os usuários dessa pelada — incluindo quem já está logado agora — serão desconectados imediatamente e verão uma mensagem para renovar a assinatura."
            }
          </p>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px;">
          <button id="pelada-block-cancel" class="btn btn-secondary">Cancelar</button>
          <button id="pelada-block-confirm" class="btn ${currentlyBlocked ? "btn-primary" : "btn-danger"}">Sim, ${action.toLowerCase()}</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { modalContainer.innerHTML = ""; };
  const overlay = modalContainer.querySelector("#pelada-block-overlay");
  modalContainer.querySelector("#pelada-block-close").addEventListener("click", close);
  modalContainer.querySelector("#pelada-block-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  modalContainer.querySelector("#pelada-block-confirm").addEventListener("click", async () => {
    try {
      await setPeladaBlocked(peladaId, !currentlyBlocked);
      showToast(currentlyBlocked ? `🔓 "${name}" desbloqueada.` : `🔒 "${name}" bloqueada.`);
    } catch (err) {
      showToast("❌ " + err.message);
    }
    close();
    if (onDone) onDone();
  });
}
