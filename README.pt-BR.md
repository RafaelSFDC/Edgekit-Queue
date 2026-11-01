# 📬 Edgekit Queue (Cloudflare Workers + SQLite Durable Objects)

<p align="left">
  <a href="README.md">🇺🇸 English</a> •
  <b>🇧🇷 Português (Brasil)</b>
</p>

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/RafaelSFDC/Edgekit-Queue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero Infra](https://img.shields.io/badge/Infra-100%25%20Serverless-pink)](#)

> **Clone serverless e open-source do Upstash (QStash + Redis) na Cloudflare Workers utilizando Hono e SQLite Durable Objects.**  
> Fila HTTP de mensagens assíncronas com agendamento de atraso, retentativas automáticas, DLQ com reprocessamento em 1 clique, banco chave-valor Redis REST (com suporte a Sorted Sets / `@upstash/ratelimit`) e dashboard moderno em React 19 + Tailwind CSS v4.

---

## 📑 Sumário

- [Por que o Edgekit Queue existe?](#-por-que-o-edgekit-queue-existe)
- [Destaques](#-destaques)
- [Arquitetura e Fluxo de Mensagens](#-arquitetura-e-fluxo-de-mensagens)
- [Pré-requisitos](#-pré-requisitos)
- [Início Rápido e Instalação](#-início-rápido-e-instalação)
- [Referência da API REST](#-referência-da-api-rest)
  - [1. Fila de Mensagens / QStash](#1-fila-de-mensagens--qstash)
  - [2. Dead Letter Queue (DLQ)](#2-dead-letter-queue-dlq)
  - [3. Logs de Auditoria](#3-logs-de-auditoria)
  - [4. Banco Chave-Valor Redis REST](#4-banco-chave-valor-redis-rest)
- [Snippet estilo shadcn (Zero Dependências)](#-snippet-estilo-shadcn-zero-dependências)
- [Deploy na Cloudflare](#-deploy-na-cloudflare)
- [Licença](#-licença)

---

## 💡 Por que o Edgekit Queue existe?

Trabalhar com filas nativas da Cloudflare (**Cloudflare Queues**) via painel apresenta limitações críticas para desenvolvedores:
1. **Cegueira total do conteúdo:** O painel nativo não permite inspecionar mensagens na fila nem visualizar seus payloads JSON.
2. **DLQ sem visibilidade nem reprocessamento:** Mensagens que falham não exibem o erro nem possuem um botão "Reenviar/Reprocessar" na dashboard.
3. **Restrito a Workers:** Não é possível consumir filas da Cloudflare a partir de backends externos (Vercel, Next.js, VPS, Laravel, Python) sem programar Workers intermediários.

O **Edgekit Queue** resolve isso implementando o protocolo **QStash (HTTP background jobs)** com persistência SQLite em **Durable Objects**. Qualquer aplicação na web pode agendar entregas via HTTP com autenticação segura, monitorar logs com latência e reprocessar falhas visualmente.

---

## 🚀 Destaques

- ⚡ **100% Serverless**: Executa inteiramente na borda da Cloudflare sem servidores externos.
- ⏱️ **Agendamento com Delays Flexíveis**: Atrasos no formato `"10s"`, `"30s"`, `"5m"`, `"2h"`, `"1d"` ou timestamps UNIX.
- 🔄 **Retentativas com Backoff Exponencial**: Tenta novamente de forma inteligente se o destino falhar com códigos 4xx/5xx ou timeout.
- 📬 **Dead Letter Queue (DLQ)**: Retém mensagens que esgotaram retentativas para diagnóstico e reprocessamento com 1 clique.
- 🔐 **Assinatura Criptográfica (`Upstash-Signature`)**: Assina requisições de webhook com HMAC-SHA256 (JWT) para validação segura.
- 🛡️ **Deduplicação Persistente com TTL**: Evita envio duplicado via chave customizada (`dedupId`).
- ⚡ **Redis REST Completo com ZSET**: Suporta Strings, Hashes, Lists e Sorted Sets — **habilita `@upstash/ratelimit` na borda**.
- 🖥️ **Dashboard Web Integrada**: Interface em **React 19 + Tailwind CSS v4** com estatísticas em tempo real, visualizador de payload, console CLI do Redis e i18n (PT-BR e EN).
- 📦 **Snippet Zero Dependências**: Copie [`snippets/queue.ts`](snippets/queue.ts) ou [`snippets/queue.py`](snippets/queue.py) diretamente para o seu projeto.

---

## 📐 Arquitetura e Fluxo de Mensagens

```
[Seu Backend / Vercel / Next.js / VPS]
        │
        ▼ (POST /publish com X-API-Key e Upstash-Delay)
[Edgekit Queue Worker (Hono)]
        │
        ▼ (Grava no SQLite e agenda alarme)
[Durable Object: StashStorage]
        │
        ▼ (Alarme dispara após o delay configurado)
[Entrega Webhook HTTP Assinada com HMAC-SHA256]
        │
        ├─► [HTTP 200 OK]  ──► Sucesso! Mensagem excluída & log registrado.
        └─► [HTTP 5xx/Err] ──► Retry exponencial ──► DLQ (se esgotar tentativas)
```

---

## 🛠️ Pré-requisitos

- **Node.js** >= 18
- **pnpm** (ou npm)
- Conta na **Cloudflare** com o plano **Workers Paid** (\$5/mês), necessário para o uso de **Durable Objects com persistência SQLite**.

---

## ⚡ Início Rápido e Instalação

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/RafaelSFDC/Edgekit-Queue.git
   cd Edgekit-Queue
   ```

2. **Instale as dependências:**
   ```bash
   pnpm install
   ```

3. **Gere sua chave de ambiente local:**
   ```bash
   pnpm setup
   ```
   *Isso criará automaticamente o arquivo `.dev.vars` com uma chave segura.*

4. **Inicie o ambiente de desenvolvimento:**
   ```bash
   pnpm dev
   ```
   * O Worker iniciará na porta `8787` (`http://localhost:8787`).
   * A Dashboard SPA Vite iniciará na porta `5173` (`http://localhost:5173`).

5. **Execute os testes:**
   ```bash
   pnpm test
   ```

---

## 📖 Referência da API REST

### Autenticação
Envie a chave de API em qualquer uma das formas:
* Header: `X-API-Key: sua_chave`
* Header: `Authorization: Bearer sua_chave`
* Header QStash: `Upstash-Token: sua_chave`

---

### 1. Fila de Mensagens / QStash

#### `POST /publish`
Publica uma mensagem para ser entregue a uma URL webhook.

**Headers Suportados:**
* `Upstash-Delay`: Ex: `"10s"`, `"5m"`, `"2h"` ou UNIX epoch ms.
* `Upstash-Retries`: Número de retentativas (padrão: 3).
* `Upstash-Group-Id`: Identificador do grupo / fila (padrão: `"default"`).
* `Upstash-Callback`: URL de callback chamada após sucesso ou falha definitiva.
* `Upstash-Dedup-Id`: Chave de deduplicação (descarta duplicatas na janela de tempo).
* `Upstash-Method`: Método HTTP enviado ao destino (padrão: `"POST"`).
* `Upstash-Forward-<Header>`: Encaminha cabeçalhos customizados ao destino.

```bash
curl -X POST "http://localhost:8787/publish" \
  -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -H "Upstash-Delay: 1m" \
  -H "Upstash-Retries: 3" \
  -d '{
    "url": "https://meu-app.com/api/webhooks/processar",
    "payload": { "orderId": "ord_123", "status": "paid" }
  }'
```

**Resposta:**
```json
{
  "messageId": "msg_8f10b7b1...",
  "deduplicated": false
}
```

#### `POST /v2/publish/:destinationUrl`
Endpoint compatível com o formato nativo da REST API do QStash.

```bash
curl -X POST "http://localhost:8787/v2/publish/https://meu-app.com/api/webhooks/processar" \
  -H "Authorization: Bearer sua_chave" \
  -H "Upstash-Delay: 10s" \
  -H "Content-Type: application/json" \
  -d '{"evento": "notificacao"}'
```

#### `GET /messages`
Lista as mensagens atualmente agendadas ou ativas na fila.
* **Query Params:** `groupId` (opcional), `limit` (padrão: 50), `offset` (padrão: 0).

#### `DELETE /messages/:id`
Cancela e remove uma mensagem pendente da fila.

---

### 2. Dead Letter Queue (DLQ)

#### `GET /dlq`
Lista mensagens que falharam em todas as tentativas de entrega.

#### `POST /dlq/:id/retry`
Re-enfileira imediatamente uma mensagem do DLQ para nova tentativa.

#### `DELETE /dlq/:id`
Descarta permanentemente uma mensagem do DLQ.

---

### 3. Logs de Auditoria

#### `GET /logs`
Retorna os registros recentes de tentativas de entrega com latência em milissegundos, código HTTP retornado e erros.

#### `POST /logs/clear`
Limpa os logs de auditoria do grupo especificado.

---

### 4. Banco Chave-Valor Redis REST

O Edgekit Queue emula a API REST do Upstash Redis:

#### Executar Comando Direto: `POST /`
```bash
curl -X POST "http://localhost:8787/" \
  -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -d '["SET", "usuario:1", "{\"nome\":\"Maria\"}", "EX", 3600]'
```

#### Atalhos REST:
* `GET /get/:key` — Obtém o valor de uma chave.
* `POST /set/:key` — Grava valor (aceita `?ex=segundos`).
* `DELETE /del/:key` — Remove uma chave.

#### Pipeline Transacional: `POST /pipeline`
```bash
curl -X POST "http://localhost:8787/pipeline" \
  -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -d '[
    ["SET", "k1", "v1"],
    ["GET", "k1"],
    ["INCR", "contador"]
  ]'
```

---

## 📦 Snippet estilo shadcn (Zero Dependências)

Você não precisa instalar nenhuma biblioteca pesada. Basta copiar o cliente correspondente para sua aplicação:

* **TypeScript / Next.js / Node:** Copie [`snippets/queue.ts`](snippets/queue.ts) para `lib/queue.ts`.
* **Python:** Copie [`snippets/queue.py`](snippets/queue.py) para `lib/queue.py`.

Consulte o [Guia Completo de Integração](docs/integrations.pt-BR.md) para ver exemplos com Next.js App Router e verificação de webhooks.

---

## 🌐 Deploy na Cloudflare

1. **Faça login na Cloudflare CLI:**
   ```bash
   pnpm --filter @edgekit/api wrangler login
   ```

2. **Configure sua chave de API mestra em produção:**
   ```bash
   pnpm --filter @edgekit/api wrangler secret put API_KEY
   ```

3. **Compile o frontend e faça o deploy completo:**
   ```bash
   pnpm deploy
   ```

Sua fila estará disponível e sua dashboard no ar em segundos! 🚀

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).
