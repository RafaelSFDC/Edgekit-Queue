# 📬 Edgekit Queue

> **Clone serverless e open-source do Upstash (QStash + Redis) na Cloudflare Workers utilizando Hono e SQLite Durable Objects.**  
> 100% serverless, zero infraestrutura externa, alta tolerância a falhas e dashboard moderno em React 19 + Tailwind CSS v4.

Leia em [Inglês (English)](README.md)

---

## 🚀 O que é o Edgekit Queue?

O **Edgekit Queue** faz parte do ecossistema **Edgekit** de ferramentas serverless de alta performance. Ele oferece uma infraestrutura completa de filas de mensagens com agendamento de atraso (QStash) e banco de dados chave-valor (Redis REST) executando inteiramente sobre Cloudflare Workers e SQLite Durable Objects.

```
Edgekit Queue/
├── apps/
│   ├── api/            # Cloudflare Worker backend (Hono + SQLite Durable Objects)
│   └── web/            # Frontend SPA interativo (React 19, Vite, Tailwind CSS v4, Shadcn)
├── scripts/
│   └── setup.mjs       # Assistente de configuração rápida do ambiente local
└── package.json        # Orquestrador do monorepo via pnpm workspaces
```

---

## 🌟 Principais Recursos

1. **QStash (Fila HTTP & Background Jobs)**
   - Envio assíncrono para qualquer URL webhook/endpoint HTTP.
   - **Agendamento com atraso (Delays flexíveis)**: `10s`, `30s`, `5m`, `2h`, `1d` ou timestamp UNIX.
   - **Retentativas com Backoff Exponencial**: Tenta novamente de forma inteligente se o destino falhar.
   - **Dead Letter Queue (DLQ)**: Retém mensagens que esgotaram retentativas para diagnóstico e reprocessamento com 1 clique.
   - **Deduplicação de Mensagens**: Prevenção de duplicidade por chave (`dedupId`).
   - **Alarmes Nativos de DO**: Sem necessidade de crons externos (Supabase, Upstash, etc.).

2. **Upstash Redis REST Clone**
   - Comandos Redis sobre HTTP REST: `GET`, `SET`, `DEL`, `INCR`, `DECR`, `EXPIRE`, `TTL`, `KEYS`, `FLUSHDB`.
   - **Compatibilidade total com o SDK `@upstash/redis`**: Use a biblioteca oficial em Node.js, Next.js, Bun ou Python.
   - Suporte a pipeline transacional (`POST /pipeline`).

3. **Dashboard Web Interativo (SPA Moderna)**
   - Construído com **React 19**, **Tailwind CSS v4**, **TanStack Router**, **TanStack Query** e componentes **Shadcn**.
   - Design System Edgekit oficial (cor do módulo Queue: `#EC4899`).
   - Suporte nativo a **Português (PT-BR)** e **Inglês (EN)** com alternador em tempo real.
   - Modo Claro e Escuro (Dark/Light Mode).
   - Gerenciamento completo de Mensagens Ativas, DLQ com retry individual/purge, explorador de chaves Redis e gerador de snippets interativo.

---

## ⚡ Início Rápido

### 1. Instalar dependências

```bash
pnpm install
```

### 2. Configurar ambiente

Execute o assistente para gerar automaticamente sua chave de API e arquivo `.dev.vars`:

```bash
pnpm setup
```

### 3. Rodar em desenvolvimento

Inicia simultaneamente o Worker na porta `8787` e o dashboard Vite na porta `5173` (com proxy reverso e Fast Refresh):

```bash
pnpm dev
```

Abra [http://localhost:5173](http://localhost:5173) no seu navegador para acessar o console interativo.

---

## 🧪 Testes e Verificação

```bash
# Executa todos os testes da API e do Frontend
pnpm test

# Valida tipos TypeScript em todos os workspaces
pnpm typecheck

# Compila o frontend SPA e valida a API para produção
pnpm build
```

---

## 🚀 Deploy em Produção

```bash
# 1. Faça login na Cloudflare (caso ainda não esteja logado)
pnpm --filter @edgekit/api wrangler login

# 2. Defina sua chave de API em produção
pnpm --filter @edgekit/api wrangler secret put API_KEY

# 3. Compile o frontend e faça o deploy com 1 comando:
pnpm deploy
```

O Cloudflare Workers servirá automaticamente o frontend SPA estático compilado através do recurso nativo `assets` com fallback de roteamento de página única.

---

## 📄 Licença

Distribuído sob a licença MIT.
