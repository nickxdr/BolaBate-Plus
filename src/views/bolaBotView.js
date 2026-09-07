import { askBolaBot } from "../services/bolaBot.js";

let messages = [
  {
    type: "bot",
    text: "Fala! 🤖⚽ Eu sou o BolaBot. Pergunta alguma coisa sobre a pelada!"
  }
];

let isOpen = false;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatMessage(text) {
  return escapeHtml(text).replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );
}

function renderMessages() {
  return messages
    .map(
      message => `
        <div class="bolabot-message ${message.type}">
          <div class="bolabot-bubble">
            ${formatMessage(message.text)}
          </div>
        </div>
      `
    )
    .join("");
}

function scrollMessagesToBottom() {
  const container = document.querySelector("#bolabot-messages");

  if (!container) return;

  container.scrollTop = container.scrollHeight;
}

function updateMessages() {
  const container = document.querySelector("#bolabot-messages");

  if (!container) return;

  container.innerHTML = renderMessages();

  scrollMessagesToBottom();
}

function sendMessage(question) {
  const text = question.trim();

  if (!text) return;

  messages.push({
    type: "user",
    text
  });

  updateMessages();

  const response = askBolaBot(text);

  messages.push({
    type: "bot",
    text: response
  });

  updateMessages();
}

function handleSubmit() {
  const input = document.querySelector("#bolabot-input");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  sendMessage(text);

  input.value = "";
  input.focus();
}

function openBolaBot() {
  const bot = document.querySelector("#bolabot");

  if (!bot) return;

  isOpen = true;
  bot.classList.add("open");

  const input = document.querySelector("#bolabot-input");

  if (input) {
    setTimeout(() => input.focus(), 100);
  }
}

function closeBolaBot() {
  const bot = document.querySelector("#bolabot");

  if (!bot) return;

  isOpen = false;
  bot.classList.remove("open");
}

function toggleBolaBot() {
  if (isOpen) {
    closeBolaBot();
  } else {
    openBolaBot();
  }
}

function handleSuggestion(question) {
  sendMessage(question);
}

export function renderBolaBotView() {
  return `
    <!-- Botão flutuante -->
    <button
      id="bolabot-trigger"
      class="bolabot-trigger"
      aria-label="Abrir BolaBot"
      title="BolaBot"
    >
      <span>🤖</span>
      <span class="bolabot-trigger-badge"></span>
    </button>

    <!-- Janela do BolaBot -->
    <div
      id="bolabot"
      class="bolabot"
      aria-hidden="true"
    >
      <div class="bolabot-header">

        <div class="bolabot-brand">
          <div class="bolabot-avatar">
            🤖
          </div>

          <div class="bolabot-title">
            <strong>BolaBot</strong>

            <span class="bolabot-status">
              <span class="bolabot-status-dot"></span>
              Online
            </span>
          </div>
        </div>

        <button
          id="bolabot-close"
          class="bolabot-close"
          aria-label="Fechar BolaBot"
          title="Fechar"
        >
          ×
        </button>

      </div>

      <div
        class="bolabot-messages"
        id="bolabot-messages"
      >
        ${renderMessages()}
      </div>

      <div class="bolabot-suggestions">

        <button
          class="bolabot-suggestion"
          data-question="Quem é o melhor jogador?"
        >
          👑 Melhor jogador
        </button>

        <button
          class="bolabot-suggestion"
          data-question="Quem fez mais gols?"
        >
          ⚽ Mais gols
        </button>

        <button
          class="bolabot-suggestion"
          data-question="Quem deu mais assistências?"
        >
          🎯 Mais assistências
        </button>

        <button
          class="bolabot-suggestion"
          data-question="Quem está pior no ranking?"
        >
          📉 Pior ranking
        </button>

      </div>

      <div class="bolabot-input-area">

        <input
          id="bolabot-input"
          class="bolabot-input"
          type="text"
          placeholder="Pergunte ao BolaBot..."
          autocomplete="off"
        />

        <button
          id="bolabot-send"
          class="bolabot-send"
          aria-label="Enviar mensagem"
          title="Enviar"
        >
          ➤
        </button>

      </div>
    </div>
  `;
}

export function initBolaBotView() {
  const trigger = document.querySelector("#bolabot-trigger");
  const closeButton = document.querySelector("#bolabot-close");
  const sendButton = document.querySelector("#bolabot-send");
  const input = document.querySelector("#bolabot-input");

  if (trigger) {
    trigger.addEventListener("click", toggleBolaBot);
  }

  if (closeButton) {
    closeButton.addEventListener("click", closeBolaBot);
  }

  if (sendButton) {
    sendButton.addEventListener("click", handleSubmit);
  }

  if (input) {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      }
    });
  }

  document
    .querySelectorAll(".bolabot-suggestion")
    .forEach(button => {
      button.addEventListener("click", () => {
        handleSuggestion(button.dataset.question);
      });
    });

  if (isOpen) {
    openBolaBot();
  }

  scrollMessagesToBottom();
}