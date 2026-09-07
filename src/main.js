import { store } from "./state/store.js";
import { renderPeladaView } from "./views/peladaView.js";
import { renderPlayersView } from "./views/playersView.js";
import { renderRankingView } from "./views/rankingView.js";
import { renderHistoryView } from "./views/historyView.js";
import { renderSettingsView } from "./views/settingsView.js";
import {renderBolaBotView, initBolaBotView } from "./views/bolaBotView.js";

let currentTab = "pelada"; // default to Pelada tab as requested!

let viewRendering = false;

function initApp() {
  const app = document.getElementById("app");

  function renderShell() {
    app.innerHTML = `
      <!-- Top Header -->
      <header class="app-header">
        <a href="#" class="brand" id="brand-link">
          <img src="/icon.svg" alt="BolaBate+ Logo" class="brand-icon" />
          <div class="brand-title">
            BolaBate<span class="plus">+</span>
          </div>
        </a>

        <div class="header-actions">
          ${
            store.activePelada.status === "live"
              ? `
            <div class="live-badge" id="header-live-badge">
              <span class="live-dot"></span> AO VIVO
            </div>
          `
              : ""
          }

          <button id="quick-theme-toggle" class="btn btn-secondary btn-sm" style="border-radius: 50%; width: 34px; height: 34px; padding: 0;" title="Alternar tema">
            ${store.theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      <!-- Main Content Container -->
      <main id="view-mount"></main>

      <!-- Bottom Navigation Bar -->
      <nav class="bottom-nav">
        <button class="nav-item ${currentTab === "pelada" ? "active" : ""}" data-tab="pelada">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polygon points="12,7 16,10 14.5,15 9.5,15 8,10" />
          </svg>
          <span>Pelada</span>
        </button>

        <button class="nav-item ${currentTab === "players" ? "active" : ""}" data-tab="players">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span>Jogadores</span>
        </button>

        <button class="nav-item ${currentTab === "ranking" ? "active" : ""}" data-tab="ranking">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
          <span>Ranking</span>
        </button>

        <button class="nav-item ${currentTab === "history" ? "active" : ""}" data-tab="history">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Histórico</span>
        </button>

        <button class="nav-item ${currentTab === "settings" ? "active" : ""}" data-tab="settings">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Ajustes</span>
        </button>
      </nav>

        ${renderBolaBotView()}
    `;
    
    initBolaBotView();
    
    // Bind Navigation items
    app.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const tab = e.currentTarget.getAttribute("data-tab");
        navigateTo(tab);
      });
    });

    // Bind Header actions
    const brandLink = app.querySelector("#brand-link");
    brandLink.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo("ranking");
    });

    const liveBadge = app.querySelector("#header-live-badge");
    if (liveBadge) {
      liveBadge.addEventListener("click", () => {
        navigateTo("pelada");
      });
    }

    const quickThemeBtn = app.querySelector("#quick-theme-toggle");
    quickThemeBtn.addEventListener("click", () => {
      const nextTheme = store.theme === "dark" ? "light" : "dark";
      store.setTheme(nextTheme);
      renderShell();
      renderCurrentView();
    });

    renderCurrentView();
  }

  function navigateTo(tab) {
    currentTab = tab;
    // update active classes in bottom nav
    app.querySelectorAll(".nav-item").forEach((btn) => {
      if (btn.getAttribute("data-tab") === tab) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
    renderCurrentView();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderCurrentView() {
    if (viewRendering) return; // skip nested re-render triggered by save() during view render
    const mount = document.getElementById("view-mount");
    if (!mount) return;

    viewRendering = true;
    try {
      mount.innerHTML = "";

      let viewNode;
      if (currentTab === "pelada") {
        viewNode = renderPeladaView(navigateTo);
      } else if (currentTab === "players") {
        viewNode = renderPlayersView();
      } else if (currentTab === "ranking") {
        viewNode = renderRankingView();
      } else if (currentTab === "history") {
        viewNode = renderHistoryView();
      } else if (currentTab === "settings") {
        viewNode = renderSettingsView();
      }

      if (viewNode) {
        mount.appendChild(viewNode);
      }
    } finally {
      viewRendering = false;
    }
  }

  // Subscribe to store updates
  store.subscribe(() => {
    // Check if live badge status changed
    const currentHasLive = !!document.getElementById("header-live-badge");
    const shouldHaveLive = store.activePelada.status === "live";
    if (currentHasLive !== shouldHaveLive) {
      renderShell();
    } else {
      renderCurrentView();
    }
  });

  renderShell();
}

document.addEventListener("DOMContentLoaded", initApp);
