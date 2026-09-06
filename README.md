<div align="center">

# ⚽ BolaBate+

**Organizador de peladas equilibradas & Tabela oficial da liga**

App **mobile-first** (PWA instalável) para organizar peladas de fútbol 5v5, equilibrar os times por estrellas e manter a tabela oficial da liga com G4 e Z4. Empacotado para Android via **Capacitor**.

</div>

---

## ✨ Recursos

### 🏆 Tabela da Liga (Ranking)

- Recreação fiel da planilha oficial:
  - **1º Lugar**: Coroa dourada (👑 1º Breno - 64 pts).
  - **Zona G4**: Top 4 posições em verde com badge G4.
  - **Zona Z4**: Últimas 4 posições em vermelho com badge Z4.
- **Fórmula oficial de pontos**:
  `3×Gols + 2×Assists + 4×Seleção + 3×Puskas + 5×Craque − 3×Bagre + 1×Participação`
- **Dados iniciais**: Todos os 26 jogadores precargados com seus pontos e estrellas oficiais (5.0★ → 1.0★).
- **Ajustes manuais**: Edite estatísticas de qualquer jogador com o botão ✏️.
- **Compartir WhatsApp**: Copia a tabela formatada com emojis, pronta para colar no grupo.

### ⚽ Pelada (Aba padrão & Controle ao vivo)

- **Configuração**: Times de **3, 4, 5 ou 6** (15–30 jogadores, 5 por time) com recálculo dinámico de atletas, preenchimento automático e botão de avanço.
- **Equilibrio inteligente (~20★)**:
  - **Equilibrar automaticamente**: Algoritmo de particionamento (snake draft + hill climbing) que balancea os times para somas quase iguais de estrellas (~20.0★ por time de 5).
  - **Arrastrar e soltar**: Troque jogadores entre times com feedback visual animado.
  - **Toque para trocar**: No celular, toque um jogador e depois outro para trocarlos.
  - **Sugerências inteligentes**: Quando um time está meio cheio (2–4 jogadores), sugere atletas para atingir ~20★.
- **Controles ao vivo de Gols & Assists**: Contadores `+⚽ / −` e `+👟 / −` com dimensionamento compacto.
- **Saídas antecipadas, reversão & convidado**:
  - `🚪 Saiu` preserva gols/assists existentes; `↩️ Voltar` restaura ao vivo.
  - **Regra de convidado & diaristas**: Suman gols/assists cronologicamente no timeline, mas ficam **estrictamente fora** do ranking oficial.
- **🏁 Terminar pelada & votaciones**: Resumo da partida, selectores de **Craque (+5)**, **Seleção (+4)**, **Puskas (+3)**, **Bagre (−3)**, atualização automática da tabela (+1 participación), confetti e navegación ao ranking.

### 👥 Jogadores

- Lista completa com busca e ordenamento (nome, estrellas desc/asc).
- Edição de estrellas (0.5★ a 5.0★ em incrementos de 0.5) e de todas as estatísticas.
- Agregar/eliminar jogadores.

### ⚙️ Ajustes & Dados

- **Tema escuro** (padrão, "stadium night") e **tema claro**.
- **Exportar/Importar JSON**: Backup completo (`bolabate-backup-*.json`) para transferir a liga entre dispositivos.
- **Restaurar dados padrão**: Recarga os 26 jogadores da planilha.

---

## 🧱 Stack

| Capa        | Tecnologia                                                      |
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

Abre **`http://localhost:5173/`** no navegador (ou `http://<seu-ip-local>:5173` desde o celular na mesma rede).

---

## 📱 Instalar como PWA em Android

1. Abra a URL no Chrome do celular.
2. Menú ⋮ → **"Adicionar à tela inicial / Instalar aplicação"**.
3. BolaBate+ será instalada como app em tela completa com seu ícono.

---

## 🤖 Generar APK Android (Capacitor)

```bash
# 1. Build da distribuição web
npm run build

# 2. Agregar plataforma Android (primeira vez)
npx cap add android

# 3. Sincronizar código ao projeto Android
npx cap sync

# 4. Abrir no Android Studio
npx cap open android
```

No Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)** para gerar `app-debug.apk`.

---

## ✅ Verificação (test suite)

`test_suite.js` valida:

1. Cálculo de pontos: os 26 jogadores coinciden 100% com a planilha de referência.
2. Equilibrio de equipos: divisões de 2/3/4 equipos balanceadas (e.g. 20.0×3, variance mínima).
3. Sugerências inteligentes: sugiere corretamente jogadores 3.5★ para um time de 9.0★ com 3 slots libres.
4. Isolamento de convidados: gols/assists de um suplente NÃO alteram o ranking oficial do jogador.
5. Build: `npm run build` compila com zero erros de bundle.

```bash
npm run build        # verifica compilação
node test_suite.js   # executa tests de lógica
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
    ├── main.js             # Shell da app e navegación por abas
    ├── style.css           # Temas (escuro/claro) e estilos
    ├── data/seedData.js    # Jogadores iniciais e fórmula de pontos
    ├── services/balancer.js# Equilibrio de times e sugerências
    ├── state/store.js      # Estado, persistência (localStorage) e lógica
    └── views/              # Pelada, Jogadores, Ranking, Ajustes
```

---

## 📜 Licença

Privado / uso personal do grupo. Por definir.
