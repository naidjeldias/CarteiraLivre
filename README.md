# CarteiraLivre

Controle de carteira a partir do extrato `.xlsx` da B3 — **open source**, **local-first**, sem mensalidade.

## O que faz (MVP)

- Importa a posição baixada da B3 no navegador (nada sobe para servidor)
- Normaliza tickers, quantidades e valores
- Destaca FIIs com alocação por **tipo** (papel, tijolo, híbrido, FoF…) e **segmento**
- Mostra patrimônio, tabelas e barras de alocação
- **Opcional:** atualiza preços de mercado via [brapi.dev](https://brapi.dev) (plano Free)
- Clique em um FII → página de detalhes com gráfico de cotação (~3 meses) e dividendos (se o plano brapi permitir)

## Stack

- Next.js 13 + TypeScript + React 18 (compatível com Node 16+)
- SheetJS (`xlsx`) no client
- Catálogo seed de FIIs em `src/lib/fii-catalog.ts` (editável)
- Cotações: rota server-side `/api/quotes` → brapi (token só no servidor)

> Ideal: Node 20 LTS. Com Node 16 (como no Ubuntu antigo), use as versões pinadas do `package.json`.

## Setup

```bash
cd ~/Projects/CarteiraLivre
npm install
cp .env.example .env.local
# edite .env.local e cole BRAPI_TOKEN=... (opcional, para cotações)
npm run dev
```

Abra http://localhost:3000 e envie seu `.xlsx` da B3.

### Cotações e dividendos

| Dado | Fonte padrão | Alternativa |
|------|--------------|-------------|
| Preço / histórico ~3m | **brapi** Free (`BRAPI_TOKEN`) | — |
| Dividendos de FIIs | **Status Invest** (sem chave) | **bolsai** Free (`BOLSAI_API_KEY`) ou brapi Pro |

```bash
cp .env.example .env.local
# BRAPI_TOKEN=...          # cotações
# BOLSAI_API_KEY=...       # opcional, dividendos via API oficial
```

Cascata de dividendos: bolsai (se configurada) → Status Invest → brapi Pro.  
Status Invest não é API oficial — pode mudar; bolsai é mais estável (200 req/dia no Free).

## Privacidade

- O parse do `.xlsx` roda 100% no browser.
- Arquivos `.xlsx` estão no `.gitignore`.
- Com brapi ativo, só os **tickers** (não o arquivo) passam pelo Next.js local → brapi.
- Nunca exponha `BRAPI_TOKEN` no client nem no git.

## Roadmap curto

- [ ] Override manual de classificação de FIIs
- [ ] Snapshots / histórico de imports
- [ ] Metas de alocação (ex.: 40% papel / 60% tijolo)
- [ ] Ampliar catálogo de FIIs / opcional Pro para `segmentType`

## Licença

MIT
