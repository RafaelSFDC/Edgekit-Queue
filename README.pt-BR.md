# 📬 Edgekit Queue (Cloudflare Workers + SQLite Durable Objects)

<p align="left">
  <a href="README.md">🇺🇸 English</a> •
  <b>🇧🇷 Português (Brasil)</b>
</p>

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/RafaelSFDC/Edgekit-Queue)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Zero External Infra](https://img.shields.io/badge/Infra-Cloudflare%20Native-blue)](#)

> **Fila HTTP simples e self-hosted na sua conta Cloudflare utilizando Workers e SQLite Durable Objects.**  
> Publique tarefas em segundo plano via HTTP, agende entregas com atraso, execute retentativas automáticas com backoff exponencial, isole filas com controle de concorrência por grupo, inspecione e reexecute falhas na Dead Letter Queue (DLQ) e valide a autenticidade das entregas com assinaturas HMAC-SHA256 — sem dependência de serviços externos obrigatórios e com uma chave de API simples e leve.

---

## 📑 Sumário

- [Recursos Principais (Núcleo)](#-recursos-principais-núcleo)
- [Recursos Secundários e Experimentais](#-recursos-secundários-e-experimentais)
- [Arquitetura e Fluxo de Mensagens](#-arquitetura-e-fluxo-de-mensagens)
- [Garantias de Entrega e Idempotência](#-garantias-de-entrega-e-idempotência)
- [Pré-requisitos e Limites da Cloudflare](#-pré-requisitos-e-limites-da-cloudflare)
- [Configurações e Secrets](#-configurações-e-secrets)
- [Início Rápido e Instalação Local](#-início-rápido-e-instalação-local)
- [Referência da API REST](#-referência-da-api-rest)
  - [1. Publicação e Fila de Mensagens](#1-publicação-e-fila-de-mensagens)
  - [2. Dead Letter Queue (DLQ) e Reprocessamento](#2-dead-letter-queue-dlq-e-reprocessamento)
  - [3. Controle de Concorrência e Configurações](#3-controle-de-concorrência-e-configurações)
  - [4. Logs de Auditoria](#4-logs-de-auditoria)
  - [5. Validação de Assinatura de Webhook](#5-validação-de-assinatura-de-webhook)
  - [6. Secundário: Agendamentos Recorrentes (Cron)](#6-secundário-agendamentos-recorrentes-cron)
  - [7. Secundário: Armazenamento Chave-Valor Redis REST](#7-secundário-armazenamento-chave-valor-redis-rest)
- [Snippets de Código (Zero Dependências)](#-snippets-de-código-zero-dependências)
- [Deploy na Cloudflare](#-deploy-na-cloudflare)
- [Licença](#-licença)

---

## 🚀 Recursos Principais (Núcleo)

O Edgekit Queue foca em entregar uma fila HTTP confiável, segura e self-hosted:

- ⚡ **100% Cloudflare Native**: Executa inteiramente na sua conta Cloudflare, sem necessidade de servidores dedicados ou bancos externos.
- 📬 **Publicação de Jobs via HTTP**: Envie mensagens através de `POST /publish` padrão ou `POST /v2/publish/:url` compatível com QStash.
- ⏱️ **Agendamento com Atraso (Delay)**: Atrasos no formato `"10s"`, `"30s"`, `"5m"`, `"2h"`, `"1d"` ou timestamps UNIX.
- 🔄 **Retentativas Automáticas com Backoff Exponencial**: Falhas de entrega (códigos HTTP não-2xx ou timeouts) são reprocessadas com intervalos exponenciais inteligentes.
- 🚦 **Controle de Concorrência por Grupo**: Limite configurável de entregas simultâneas por grupo de fila, reservado atomicamente no SQLite para não sobrecarregar seus servidores de destino.
- 🛡️ **Lease de Processamento e Recuperação de Falhas**: Mensagens em processamento possuem um lease/timeout automático. Se o Worker for interrompido durante uma entrega, a mensagem é recuperada e reprocessada em vez de ficar presa permanentemente.
- 📦 **Dead Letter Queue (DLQ)**: Mensagens que esgotam retentativas são movidas para a DLQ com motivo exato da falha e histórico para reprocessamento com 1 clique.
- 🔐 **Assinatura Criptográfica (`Upstash-Signature`)**: As requisições de webhook enviadas são assinadas com HMAC-SHA256 (formato JWT) para garantir que vieram da sua fila.
- 🛡️ **Deduplicação Persistente**: Chave opcional `dedupId` para evitar execuções duplicadas acidentais dentro de uma janela de tempo.
- 🔑 **Autenticação Simples com Chave Única**: Uma única chave de API (`API_KEY`) protege o painel e os endpoints. Se a chave não for configurada, o deploy falha fechado por segurança.
- 🖥️ **Painel Web Interativo**: Interface moderna em React 19 + Tailwind CSS v4 para monitorar filas, reexecutar mensagens da DLQ, inspecionar logs e ajustar limites.
- 📦 **Snippets Prontos para Copiar**: Arquivos [`snippets/queue.ts`](snippets/queue.ts) e [`snippets/queue.py`](snippets/queue.py) prontos para incluir no seu projeto sem pacotes extras.

---

## 🧪 Recursos Secundários e Experimentais

Os seguintes recursos são oferecidos de forma secundária ou simplificada:

- ⏰ **Agendamentos Recorrentes (Cron)**: Disparos periódicos básicos acionados pelo Cron Trigger da Cloudflare Workers (resolução mínima de 1 minuto). Útil para tarefas recorrentes simples, mas não substitui orquestradores complexos de cron distribuído.
- ⚡ **Armazenamento Chave-Valor Redis REST**: Emulador básico de comandos de string, hash, lista e sorted sets via HTTP para scripts auxiliares na borda. **Não** é anunciado como uma implementação completa do Redis nem possui garantia de suporte a rate limiters externos complexos.

---

## 📐 Arquitetura e Fluxo de Mensagens

```
[Sua Aplicação / Next.js / Laravel / Python]
        │
        ▼ (POST /publish com X-API-Key, Upstash-Delay, Upstash-Group-Id)
[Edgekit Queue Worker (Hono)]
        │
        ▼ (Grava no SQLite e agenda alarme no Durable Object)
[Durable Object: StashStorage]
        │
        ▼ (Dispara após o delay ou imediatamente dentro do limite de concorrência)
[Dispara Webhook HTTP Assinado com HMAC-SHA256]
        │
        ├─► [HTTP 2xx OK]  ──► Sucesso! Mensagem excluída & log de auditoria salvo.
        └─► [HTTP 5xx/Err] ──► Retry exponencial ──► DLQ (se esgotar tentativas)
                                                               │
                                                               ▼
                                                   [Webhook de Alerta Opcional]
```

---

## ⚠️ Garantias de Entrega e Idempotência

> [!IMPORTANT]
> **Semântica de Entrega Pelo Menos Uma Vez (At-Least-Once):**
> O Edgekit Queue opera com garantia **at-least-once**. Em casos de oscilações de rede, timeouts onde o destino processou mas demorou a responder, ou expiração de lease após reinicialização do runtime, uma mensagem pode ser reenviada.
> 
> **Seus webhooks consumidores devem ser idempotentes:**
> - Inspecione o cabeçalho `Upstash-Message-Id` para descartar mensagens já processadas.
> - Utilize identificadores únicos de negócio (ex: `order_id`, `transacao_id`).

---

## 🛠️ Pré-requisitos e Limites da Cloudflare

- **Node.js** >= 18
- **pnpm** (ou npm)
- **Conta Cloudflare**:
  - Requer o plano **Cloudflare Workers Paid** (\$5/mês) para habilitar **Durable Objects com persistência SQLite**. A disponibilidade de recursos, armazenamento e cotas de requisição dependem do plano contratado na Cloudflare.
- **Limites de Payload**:
  - O tamanho do payload respeita os limites de body de requisições da Cloudflare Workers (até ~100MB no plano Paid) e o limite por linha do SQLite.
- **Timeout de Entrega**:
  - Requisições de webhook possuem timeout padrão de 15 segundos (configurável via variável `HTTP_REQUEST_TIMEOUT`).

---

## 🔐 Configurações e Secrets

O Edgekit Queue utiliza uma chave mestre e variáveis opcionais:

| Variável | Tipo | Obrigatório | Descrição |
| :--- | :--- | :--- | :--- |
| `API_KEY` | Secret | **Sim** | Chave mestre de acesso para chamadas de API e login no painel. Configure via `wrangler secret put API_KEY` em produção, ou em `.dev.vars` no desenvolvimento local. |
| `QSTASH_CURRENT_SIGNING_KEY` | Secret | Não | Chave dedicada para gerar a assinatura HMAC `Upstash-Signature`. Se omitida, utiliza o valor de `API_KEY`. |
| `QSTASH_NEXT_SIGNING_KEY` | Secret | Não | Próxima chave de assinatura para suportar rotação de segredos sem downtime. |
| `HTTP_REQUEST_TIMEOUT` | Var | Não | Tempo limite em segundos para requisições de webhook (padrão: `15`). |
| `TOTAL_RETRIES_BEFORE_DLQ` | Var | Não | Quantidade de retentativas antes de enviar a mensagem à DLQ (padrão: `3`). |
| `MAX_CONCURRENT_DELIVERIES` | Var | Não | Limite máximo de entregas simultâneas em trânsito por grupo (padrão: `10`). |
| `PROCESSING_LEASE_TIMEOUT` | Var | Não | Duração do lease em segundos antes de uma mensagem em processamento ser considerada abandonada e recuperada (padrão: `30` ou `2 * HTTP_REQUEST_TIMEOUT`). |
| `ALLOWED_ORIGINS` | Var | Não | Lista separada por vírgulas de origens CORS autorizadas a enviar credenciais (ex: `https://meu-app.com,https://painel.pages.dev`). |
| `DLQ_ALERT_URL` | Var/Setting | Não | URL de webhook (Discord, Slack ou customizada) notificada quando uma mensagem falhar em definitivo. |

> [!CAUTION]
> **Segurança com Falha Fechada:**
> Se a variável `API_KEY` não estiver configurada, o Worker recusa qualquer operação de fila com erro 500, o endpoint `/health` responde 503 com status não saudável e nenhum segredo é retornado a chamadas não autenticadas.

---

## ⚡ Início Rápido e Instalação Local

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/RafaelSFDC/Edgekit-Queue.git
   cd Edgekit-Queue
   ```

2. **Instale as dependências:**
   ```bash
   pnpm install
   ```

3. **Configure as variáveis de desenvolvimento:**
   ```bash
   pnpm setup
   ```
   *Cria automaticamente o arquivo `.dev.vars` com uma chave gerada com segurança. Você também pode copiar `.dev.vars.example` para `.dev.vars` e definir sua própria chave.*

4. **Inicie os servidores locais:**
   ```bash
   pnpm dev
   ```
   - API do Worker: `http://localhost:8787`
   - Painel Web (Vite + React): `http://localhost:5173`

5. **Execute a suíte de testes:**
   ```bash
   pnpm test
   ```
   *Executa testes unitários, testes de segurança, validação de concorrência/recuperação e testes de integração com o runtime real do Wrangler.*

---

## 📖 Referência da API REST

### Autenticação
Envie a chave de API em qualquer um dos seguintes formatos:
* Cabeçalho: `X-API-Key: sua_chave`
* Cabeçalho: `Authorization: Bearer sua_chave`
* Cabeçalho (SDK QStash): `Upstash-Token: sua_chave`

---

### 1. Publicação e Fila de Mensagens

#### `POST /publish`
Publica uma mensagem para ser entregue de forma assíncrona.

**Parâmetros de Query ou Corpo JSON:**
* `url` (obrigatório): URL de destino do webhook.
* `payload`: Objeto JSON ou texto enviado no corpo do webhook.
* `groupId`: Identificador do grupo da fila (padrão: `"default"`).
* `delay`: Atraso para entrega (`"10s"`, `"5m"`, `"2h"`, `"1d"` ou ms).
* `retries`: Número máximo de tentativas (padrão: `3`).
* `priority`: Nível de prioridade (`0` a `100`; valores maiores têm preferência).
* `dedupId`: Chave de deduplicação.
* `dedupWindow`: Janela de deduplicação em segundos (padrão: 7200).
* `callbackUrl`: URL chamada após sucesso ou falha definitiva.

**Encaminhamento de Cabeçalhos:**
Cabeçalhos com prefixo `Upstash-Forward-` são encaminhados diretamente ao webhook de destino (ex: `Upstash-Forward-Authorization: Bearer token` vira `Authorization: Bearer token`).

```bash
curl -X POST "http://localhost:8787/publish" \
  -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -H "Upstash-Delay: 30s" \
  -d '{
    "url": "https://meu-app.com/api/webhooks/process",
    "payload": { "pedidoId": "ped_123", "status": "pago" },
    "groupId": "pedidos",
    "priority": 10
  }'
```

#### `GET /messages`
Lista as mensagens pendentes e agendadas na fila.
* **Query Params:** `groupId` (opcional, padrão: `"default"`), `limit` (padrão: 50), `offset` (padrão: 0).

#### `DELETE /messages/:id`
Cancela e remove uma mensagem pendente da fila.

#### `ALL /process`
Aciona manualmente o processamento de mensagens pendentes de um grupo (útil para testes ou cron sweeps externos).
* **Query Params:** `groupId` (padrão: `"default"`), `limit` (padrão: 10).

---

### 2. Dead Letter Queue (DLQ) e Reprocessamento

#### `GET /dlq`
Lista mensagens que esgotaram todas as tentativas de entrega.
* **Query Params:** `groupId` (padrão: `"default"`), `limit` (padrão: 50), `offset` (padrão: 0).

#### `POST /dlq/:id/retry`
Move uma mensagem da DLQ de volta para a fila ativa com contador de tentativas zerado.

#### `DELETE /dlq/:id`
Exclui permanentemente uma mensagem da DLQ.

---

### 3. Controle de Concorrência e Configurações

O limite de concorrência é isolado por grupo e controlado atomicamente no SQLite:

#### `GET /api/v1/settings`
Retorna as configurações do grupo informado (`max_concurrent_deliveries`, `dlq_alert_url`).

#### `POST /api/v1/settings`
Atualiza as configurações do grupo:
```bash
curl -X POST "http://localhost:8787/api/v1/settings" \
  -H "X-API-Key: sua_chave" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "pedidos",
    "maxConcurrentDeliveries": 5,
    "dlqAlertUrl": "https://discord.com/api/webhooks/SEU_WEBHOOK"
  }'
```

---

### 4. Logs de Auditoria

#### `GET /logs`
Retorna o histórico das últimas 300 entregas do grupo com latência em milissegundos, status HTTP e mensagem de erro se houver.

#### `POST /logs/clear`
Limpa os logs de entrega do grupo especificado.

---

### 5. Validação de Assinatura de Webhook

Os webhooks enviados contêm o cabeçalho `Upstash-Signature` (JWT em 3 partes). O receptor pode validar a assinatura HMAC-SHA256 usando a `API_KEY` (ou `QSTASH_CURRENT_SIGNING_KEY`):

```ts
import { verifyWebhookSignature } from './lib/queue';

const isValid = await verifyWebhookSignature({
  signature: req.headers.get('upstash-signature') || '',
  url: 'https://meu-app.com/api/webhooks/process',
  body: rawBodyString,
  signingKey: process.env.EDGEKIT_SIGNING_KEY!,
});

if (!isValid) {
  return new Response('Assinatura inválida', { status: 401 });
}
```

---

### 6. Secundário: Agendamentos Recorrentes (Cron)

* `POST /api/v1/schedules` — Cria agendamento recorrente (`cron`, `url`, `payload`, `groupId`).
* `GET /api/v1/schedules` — Lista agendamentos.
* `POST /api/v1/schedules/:id/pause` — Pausa agendamento.
* `POST /api/v1/schedules/:id/resume` — Retoma agendamento.
* `POST /api/v1/schedules/:id/trigger` — Dispara agendamento imediatamente.
* `DELETE /api/v1/schedules/:id` — Exclui agendamento.

---

### 7. Secundário: Armazenamento Chave-Valor Redis REST

Comandos básicos de chave-valor para scripts auxiliares na borda:

* `GET /get/:key` — Lê chave.
* `POST /set/:key/:value` — Grava chave com `?ex=segundos` opcional.
* `DELETE /del/:key` — Remove chave.
* `POST /pipeline` — Executa múltiplos comandos básicos em lote.

---

## 📦 Snippets de Código (Zero Dependências)

Não é necessário instalar nenhum pacote npm externo. Copie o snippet correspondente diretamente para seu projeto:

* **TypeScript / Next.js / Node:** Copie [`snippets/queue.ts`](snippets/queue.ts) para `lib/queue.ts`.
* **Python:** Copie [`snippets/queue.py`](snippets/queue.py) para `lib/queue.py`.

---

## 🌐 Deploy na Cloudflare

1. **Faça login na CLI da Cloudflare:**
   ```bash
   pnpm --filter @edgekit/api wrangler login
   ```

2. **Defina a chave de API de produção como secret:**
   ```bash
   pnpm --filter @edgekit/api wrangler secret put API_KEY
   ```

3. **Verifique o build e as associações:**
   ```bash
   pnpm build
   pnpm --filter @edgekit/api wrangler deploy --dry-run
   ```

4. **Realize o deploy:**
   ```bash
   pnpm deploy
   ```

Sua fila e painel estarão operacionais na sua conta Cloudflare! 🚀

---

## 📄 Licença

Distribuído sob a licença [MIT](LICENSE).
