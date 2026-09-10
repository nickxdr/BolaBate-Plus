<div align="center">

# ⚽ BolaBate+

**Organizador de peladas equilibradas & Tabela oficial da liga**

App **mobile-first** (PWA instalável) para organizar peladas de futebol 5v5, equilibrar os times por estrelas e manter a tabela oficial da liga com G4 e Z4. Empacotado para Android via **Capacitor**.

</div>

---

## ✨ Recursos

### 🏆 Tabela da Liga (Ranking)

- Reprodução fiel da planilha oficial:
  - **1º Lugar**: Coroa dourada.
  - **Zona G4**: Top 4 posições em verde com badge G4.
  - **Zona Z4**: Últimas 4 posições em vermelho com badge Z4.
- **Fórmula oficial de pontos**:
  `3×Gols + 2×Assists + 4×Seleção + 3×Puskas + 5×Craque − 3×Bagre + 1×Participação`
- **Dados iniciais**: Todos os 26 jogadores pré-carregados com seus pontos e estrelas oficiais (5.0★ → 1.0★).
- **Ajustes manuais**: Edite estatísticas de qualquer jogador com o botão ✏️.
- **Compartilhar WhatsApp**: Copia a tabela formatada com emojis, pronta para colar no grupo.

### ⚽ Pelada (Aba padrão & Controle ao vivo)

- **Configuração**: Times de **3, 4, 5 ou 6** (15–30 jogadores, 5 por time) com recálculo dinâmico de atletas, preenchimento automático e botão de avanço.
- **Equilíbrio inteligente (~20★)**:
  - **Equilibrar automaticamente**: Algoritmo de particionamento (snake draft + hill climbing) que balanceia os times para somas quase iguais de estrelas (~20.0★ por time de 5).
  - **Arrastar e soltar**: Troque jogadores entre times com feedback visual animado.
  - **Toque para trocar**: No celular, toque um jogador e depois outro para trocá-los.
  - **Sugestões inteligentes**: Quando um time está meio cheio (2–4 jogadores), sugere atletas para atingir ~20★.
- **Controles ao vivo de Gols & Assists**: Contadores `+⚽ / −` e `+👟 / −` com dimensionamento compacto.
- **Saídas antecipadas, reversão & convidado**:
  - `🚪 Saiu` preserva gols/assists existentes; `↩️ Voltar` restaura ao vivo.
  - **Regra de convidado & diaristas**: Somam gols/assists cronologicamente na timeline, mas ficam **estritamente fora** do ranking oficial.
- **🏁 Terminar pelada**: Resumo da partida, atualização automática da tabela (gols, assists e +1 participação), confetti e navegação ao ranking.

### 🤖 BolaBot (Assistente inteligente)

- **Chat flutuante** disponível em todas as telas: pergunte qualquer coisa sobre a liga em linguagem natural.
- **Respostas com dados reais** (via `store`), sem APIs externas:
  - 🏆 Melhor e pior jogador do ranking geral (todos os tempos).
  - 👑 "Quem foi o melhor do ano?" / "Quem foi o melhor do mês?" — melhor jogador do ranking anual ou do mês em contexto (respeita o período selecionado na Tabela da Liga).
  - ⚽ Artilheiro e 👟 maior assistente — geral (todos os tempos) ou com escopo: "no ano?" / "no mês?" (respeita o período selecionado na Tabela da Liga).
  - 📉 Pior do ranking — geral ou com escopo: "Quem foi o pior do ano? / do mês?".
  - 📊 Estatísticas completas de um jogador específico.
- **Evolução mensal** (com base nas estatísticas por período):
  - 📈 "Quem mais evoluiu esse mês?" — compara os pontos do mês atual com o anterior.
  - 🔥 "Como o jogador X evoluiu?" — evolução individual (+/− pontos).
- **Sugestões clicáveis** de perguntas e mensagem de ajuda com exemplos.


- **🏁 Terminar pelada**: Resumo da partida, atualização automática da tabela (gols, assists e +1 participação), confetti e navegação ao ranking.

### 📅 Histórico

- Registra cada pelada encerrada com **data**, **times**, **gols e assists por jogador**.
- **Votações pós-partida**: Craque (+5), Seleção (+4), Puskas (+3) e Bagre (−3) são definidos depois, quando a enquete do WhatsApp fechar.
- Alterações nas votações atualizam o ranking oficial sem contagem duplicada.

### 👥 Jogadores

- Lista completa com busca e ordenação (nome, estrelas desc/asc).
- Edição de estrelas (0.5★ a 5.0★ em incrementos de 0.5) e de todas as estatísticas.
- Adicionar/remover jogadores.

### ⚙️ Ajustes & Dados

- **Tema escuro** (padrão, "stadium night") e **tema claro**.
- **Exportar/Importar JSON**: Backup completo (`bolabate-backup-*.json`) com jogadores, ranking e **histórico de peladas** para transferir a liga entre dispositivos.
- **Restaurar dados padrão**: Recarrega os 26 jogadores da planilha.

---

## 🧱 Stack

| Camada      | Tecnologia                                                      |
| ----------- | --------------------------------------------------------------- |
| Frontend    | HTML, CSS e JavaScript moderno modular (sem frameworks pesados) |
| Build / Dev | [Vite](https://vitejs.dev)                                      |
| Android     | [Capacitor](https://capacitorjs.com) (`@capacitor/android`)     |
| Extras      | `canvas-confetti` para a celebração                             |

---

## 🚀 Como rodar localmente (Web)

```bash
# 1. Instalar dependências
npm install

# 2. Servidor de desenvolvimento
npm run dev
```

Abra **`http://localhost:5173/`** no navegador (ou `http://<seu-ip-local>:5173` a partir do celular na mesma rede).

---

## 📱 Instalar como PWA no Android

1. Abra a URL no Chrome do celular.
2. Menu ⋮ → **"Adicionar à tela inicial / Instalar aplicativo"**.
3. BolaBate+ será instalado como app em tela cheia com seu ícone.

---

## 🤖 Gerar APK Android (Capacitor)

```bash
# 1. Build da distribuição web
npm run build

# 2. Adicionar plataforma Android (primeira vez)
npx cap add android

# 3. Sincronizar código com o projeto Android
npx cap sync

# 4. Abrir no Android Studio
npx cap open android
```

No Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)** para gerar `app-debug.apk`.

---

## ✅ Verificação (suite de testes)

O `test_suite.js` valida:

1. **Cálculo de pontos**: os 26 jogadores coincidem 100% com a planilha de referência.
2. **Equilíbrio de times**: divisões de 2/3/4/5 times balanceadas (ex.: 20.0★ × 3, variância mínima).
3. **Sugestões inteligentes**: sugere corretamente jogadores 3.5★ para um time de 9.0★ com 3 vagas livres.
4. **Isolamento de convidados**: gols/assists de um substituto **não** alteram o ranking oficial do jogador.
5. **Build**: `npm run build` compila sem erros de bundle.

```bash
npm run build        # verifica compilação
node test_suite.js   # executa testes de lógica
```

---

## 🗂️ Estrutura de código

```
├── capacitor.config.json   # Configuração Capacitor (Android)
├── index.html              # HTML raiz / ponto de entrada
├── package.json            # Dependências e scripts
├── public/
│   └── manifest.json       # Manifest PWA
└── src/
    ├── main.js             # Shell da app e navegação por abas
    ├── style.css           # Temas (escuro/claro) e estilos
    ├── data/seedData.js    # Jogadores iniciais e fórmula de pontos
    ├── services/balancer.js# Equilíbrio de times e sugestões
    ├── services/bolaBot.js  # Assistente BolaBot (consultas e evolução mensal)
    ├── state/store.js      # Estado, persistência (localStorage) e lógica
    └── views/              # Pelada, Jogadores, Ranking, Histórico, Ajustes, BolaBot
```

---

## 📜 Licença

Privado / uso pessoal do grupo. A definir.
