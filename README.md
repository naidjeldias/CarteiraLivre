# CarteiraLivre

Controle de carteira a partir do extrato `.xlsx` da B3 — **open source**, **local-first**, sem mensalidade.

## O que faz (MVP)

- Importa a posição baixada da B3 no navegador (nada sobe para servidor)
- Normaliza tickers, quantidades e valores
- Destaca FIIs com alocação por **tipo** (papel, tijolo, híbrido, FoF…) e **segmento**
- Mostra patrimônio, tabelas e barras de alocação
- **Opcional:** atualiza preços de mercado via [brapi.dev](https://brapi.dev) (plano Free)
- Clique em um FII → cotação, dividendos, indicadores por tipo e **sinal de preço** (score)
- **Opcional:** assistente Gemini para perguntas sobre a carteira importada (alocação, concentração, detalhe de FII)
- Na página do FII: comunicados/informes recentes baixados automaticamente + **Resumo IA** do estado atual

## Stack

- Next.js 13 + TypeScript + React 18 (compatível com Node 16+)
- SheetJS (`xlsx`) no client
- Catálogo seed de FIIs em `src/lib/fii-catalog.ts` (editável)
- Cotações: rota server-side `/api/quotes` → brapi (token só no servidor)

> Ideal: Node 20 LTS. Com Node 16 (como no Ubuntu antigo), use as versões pinadas do `package.json`.

## Setup

O app (incluindo o assistente Gemini) roda no container. O SDK `@google/genai` é instalado no build da imagem (`npm ci`), não precisa no host.

```bash
cd ~/Projects/CarteiraLivre
cp .env.example .env.local
# edite .env.local: BRAPI_TOKEN, BOLSAI_API_KEY, GEMINI_API_KEY
docker compose up --build
```

Abra http://localhost:3000 e envie seu `.xlsx` da B3.

Tokens entram em runtime via `.env.local` — não vão para a imagem. Depois de editar `.env.local`, rode `docker compose up -d --force-recreate` para aplicar.

O cache de comunicados fica em **`./data` no host**, montado em `/app/data` no container (usuário `nextjs`, uid 1001). Recriar o container **não** apaga o cache.

Alternativa sem Docker (Node 20+): `npm install && npm run dev` — o cache vai para `./data` no projeto.

### Cotações e dividendos

| Dado | Fonte padrão | Alternativa |
|------|--------------|-------------|
| Preço / histórico ~3m | **brapi** Free (`BRAPI_TOKEN`) | — |
| Dividendos de FIIs | **Status Invest** (sem chave) | **bolsai** Free (`BOLSAI_API_KEY`) ou brapi Pro |

```bash
cp .env.example .env.local
# BRAPI_TOKEN=...          # cotações
# BOLSAI_API_KEY=...       # opcional, dividendos via API oficial
# GEMINI_API_KEY=...       # opcional, assistente da carteira
```

Cascata de dividendos: bolsai (se configurada) → Status Invest → brapi Pro.  
Status Invest não é API oficial — pode mudar; bolsai é mais estável (200 req/dia no Free).

### Assistente Gemini

Com `GEMINI_API_KEY` (chave em [Google AI Studio](https://aistudio.google.com/apikey)), a home ganha um chat depois das barras de alocação.

- Responde com o **resumo compacto** da carteira (tickers, qtd, valores, fatias de alocação) e ferramentas no servidor (alocação, posições, catálogo FII, detalhe/dividendos/sinal, cotações).
- Escolha o modelo Gemini no seletor do chat (padrão: `gemini-3.6-flash`). A lista é validada no servidor.
- Sem a chave, o painel avisa e a API devolve **503** em português.
- O arquivo `.xlsx` **não** é enviado ao modelo — só o JSON resumido montado no browser.
- Tom educacional; não é recomendação de investimento.
- Chave só no servidor, injetada no container via `.env.local`. Recrie após colar: `docker compose up -d --force-recreate`.

### Comunicados e Resumo IA (página do FII)

Ao abrir `/fii/HGLG11` (ou outro ticker), o app **sincroniza sozinho** fatos relevantes, informes CVM e relatórios recentes. A lista aparece em **Comunicados e informes recentes** (acima da análise). Se o cache tiver menos de 24h, não baixa de novo.

| Tipo | Uso | Retenção |
|------|-----|----------|
| Fato relevante | Linha do tempo / “o que mudou” | 180 dias |
| Informe mensal / trimestral | Números oficiais + texto para busca | últimos 6 mensais e 4 trimestrais |
| Relatório gerencial | Narrativa para perguntas profundas | texto dos últimos 6 meses |

O botão **Resumo IA** (ao lado do título da lista) gera um painel inline com cotação, sinal de preço, P/VP, DY e destaques dos documentos. Sem `GEMINI_API_KEY`, a lista continua; o botão explica a chave ausente. O resumo fica em cache 1h.

O assistente da home usa as mesmas fontes locais: “Teve fato relevante no KNRI11?” e “O relatório fala de vacância?”. Abra a página do FII antes se ainda não houver cache.

Fontes: [CVM Dados Abertos](https://dados.cvm.gov.br) (sem chave) e, se o token permitir, brapi `/api/v2/fii/reports`. P/VP, DY e vacância do score continuam vindo de bolsai/brapi — os PDFs não recalculam o score.

Arquivos em `data/disclosures/{TICKER}/` e `data/rag/{TICKER}/` (gitignore). PDFs/HTML são extraídos com `unpdf`; se a extração falhar, a lista ainda mostra título, data e link.

## Privacidade

- O parse do `.xlsx` roda 100% no browser.
- Arquivos `.xlsx` estão no `.gitignore`.
- Com brapi ativo, só os **tickers** (não o arquivo) passam pelo Next.js local → brapi.
- Com o assistente, só o **resumo da carteira** (e resultados das ferramentas) vai ao Gemini — nunca o `.xlsx`.
- O Resumo IA da página do FII envia só o ticker ao servidor; o Gemini recebe métricas públicas e trechos de comunicados, nunca a planilha.
- Nunca exponha `BRAPI_TOKEN` nem `GEMINI_API_KEY` no client nem no git.

## Roadmap curto

- [ ] Override manual de classificação de FIIs
- [ ] Snapshots / histórico de imports
- [ ] Metas de alocação (ex.: 40% papel / 60% tijolo)
- [ ] Ampliar catálogo de FIIs / opcional Pro para `segmentType`

## Licença

MIT
