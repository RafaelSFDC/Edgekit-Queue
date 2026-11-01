# Guia de Integração — Edgekit Queue

Este guia ensina como integrar o **Edgekit Queue** em qualquer aplicação (Next.js, Node.js, Express, Fastify, Python FastAPI) para disparar tarefas em segundo plano e validar webhooks com segurança criptográfica.

---

## 📑 Índice

1. [Como Funciona o Ciclo de Vida da Mensagem](#1-como-funciona-o-ciclo-de-vida-da-mensagem)
2. [Integração no Next.js (App Router)](#2-integração-no-nextjs-app-router)
   - [Publicando um Job em Segundo Plano](#a-publicando-um-job-em-segundo-plano)
   - [Recebendo e Validando o Webhook](#b-recebendo-e-validando-o-webhook)
3. [Integração no Node.js / Express](#3-integração-no-nodejs--express)
4. [Integração no Python (FastAPI / Flask)](#4-integração-no-python-fastapi--flask)
5. [Rate Limiting na Borda com `@upstash/ratelimit`](#5-rate-limiting-na-borda-com-upstashratelimit)
6. [Resolução de Problemas (Troubleshooting)](#6-resolução-de-problemas-troubleshooting)

---

## 1. Como Funciona o Ciclo de Vida da Mensagem

```
[Seu App / Vercel]
       │
       ▼  POST /publish (com delay="5m", retries=3)
[Edgekit Queue Worker] ──(Salva no SQLite Durable Object)
       │
       ▼  (Aguarda 5 minutos via alarme nativo de DO)
[Edgekit Queue Worker]
       │
       ▼  POST https://seu-site.com/api/webhooks/processar
          Headers: Upstash-Signature: eyJhbGciOi...
[Seu Endpoint Webhook]
       │  (Valida a assinatura HMAC-SHA256)
       ▼
   HTTP 200 OK  ──► Sucesso! Mensagem removida da fila.
   HTTP 500 ERR ──► Erro! Retentativa com backoff ou envio para DLQ.
```

---

## 2. Integração no Next.js (App Router)

### A. Publicando um Job em Segundo Plano

Copie o cliente [`snippets/queue.ts`](../snippets/queue.ts) para `lib/queue.ts` no seu projeto:

```ts
// app/actions/send-welcome-email.ts
'use server';

import { EdgeKitQueue } from '@/lib/queue';

const queue = new EdgeKitQueue({
  baseUrl: process.env.EDGEKIT_QUEUE_URL!, // ex: https://queue.seudominio.workers.dev
  apiKey: process.env.EDGEKIT_QUEUE_KEY!,
});

export async function scheduleWelcomeEmail(userId: string, email: string) {
  // Agenda o envio para daqui a 15 minutos
  const res = await queue.publish({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/welcome-email`,
    payload: { userId, email },
    delay: '15m',
    retries: 3,
    dedupId: `welcome-${userId}`, // Evita emails duplicados
  });

  return { scheduled: true, messageId: res.messageId };
}
```

---

### B. Recebendo e Validando o Webhook

Crie um Route Handler para processar a tarefa e validar a assinatura criptográfica `Upstash-Signature`:

```ts
// app/api/webhooks/welcome-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/queue';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('upstash-signature') || '';
  const rawBody = await req.text();
  const currentUrl = req.url;

  // 1. Validação Criptográfica (Zero Dependências)
  const isValid = await verifyWebhookSignature({
    signature,
    url: currentUrl,
    body: rawBody,
    signingKey: process.env.EDGEKIT_QUEUE_KEY!,
  });

  if (!isValid) {
    return NextResponse.json({ error: 'Assinatura inválida ou expirada.' }, { status: 401 });
  }

  // 2. Processa o payload
  const { userId, email } = JSON.parse(rawBody);
  console.log(`Enviando email de boas-vindas para: ${email} (${userId})`);

  // Simula operação
  // await sendEmail({ to: email, template: 'welcome' });

  return NextResponse.json({ success: true });
}
```

---

## 3. Integração no Node.js / Express

```ts
import express from 'express';
import { EdgeKitQueue, verifyWebhookSignature } from './queue';

const app = express();
const QUEUE_KEY = process.env.EDGEKIT_QUEUE_KEY!;

// Importante: capture o corpo bruto para validar a assinatura
app.post(
  '/api/webhooks/worker-task',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = (req.headers['upstash-signature'] as string) || '';
    const rawBody = req.body.toString('utf-8');
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = await verifyWebhookSignature({
      signature,
      url,
      body: rawBody,
      signingKey: QUEUE_KEY,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Assinatura inválida.' });
    }

    const payload = JSON.parse(rawBody);
    console.log('Processando webhook:', payload);

    return res.status(200).json({ ok: true });
  }
);
```

---

## 4. Integração no Python (FastAPI / Flask)

Usando [`snippets/queue.py`](../snippets/queue.py):

```python
from fastapi import FastAPI, Request, HTTPException
from lib.queue import EdgeKitQueue, verify_webhook_signature

app = FastAPI()
QUEUE_KEY = "sua_chave_secreta"
queue = EdgeKitQueue(base_url="https://queue.seudominio.workers.dev", api_key=QUEUE_KEY)

# 1. Agendar tarefa
@app.post("/pedidos")
def criar_pedido(pedido_id: str):
    queue.publish(
        url="https://meusite.com/webhooks/cancelar-se-nao-pago",
        payload={"pedidoId": pedido_id},
        delay="2h",
        retries=3,
        dedup_id=f"cancel-{pedido_id}"
    )
    return {"status": "agendado"}

# 2. Receber e validar webhook
@app.post("/webhooks/cancelar-se-nao-pago")
async def processar_cancelamento(request: Request):
    sig = request.headers.get("upstash-signature", "")
    body_bytes = await request.body()
    raw_body = body_bytes.decode("utf-8")
    
    valido = verify_webhook_signature(
        signature=sig,
        url=str(request.url),
        body=raw_body,
        signing_key=QUEUE_KEY
    )
    
    if not valido:
        raise HTTPException(status_code=401, detail="Assinatura inválida")
        
    dados = await request.json()
    print("Executando cancelamento:", dados)
    return {"status": "processado"}
```

---

## 5. Rate Limiting na Borda com `@upstash/ratelimit`

O **Edgekit Queue** implementa os comandos REST do Redis (incluindo `ZADD`, `ZRANGEBYSCORE`, `ZREMRANGEBYSCORE`), o que permite usar o algoritmo Sliding Window do `@upstash/ratelimit` nativamente:

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Conecta diretamente ao Edgekit Queue Worker
const redis = new Redis({
  url: 'https://sua-fila.workers.dev',
  token: 'sua_chave_secreta',
});

// Limita a 10 requisições a cada 10 segundos por IP
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: false,
});
```

---

## 6. Resolução de Problemas (Troubleshooting)

| Sintoma | Possível Causa | Solução |
| :--- | :--- | :--- |
| **HTTP 401 ao publicar** | Header `X-API-Key` incorreto ou ausente | Configure a secret `pnpm wrangler secret put API_KEY` |
| **`verifyWebhookSignature` falha** | O `rawBody` foi parseado antes de validar | Garanta que o corpo bruto em string (sem re-serializar JSON) seja usado |
| **Webhook nunca chega** | O destino retornou erro HTTP ou timeout | Verifique o menu **Logs** e a aba **DLQ** na dashboard |
| **Deduplicação descartou mensagem** | O mesmo `dedupId` foi enviado antes de expirar | Utilize identificadores únicos ou ajuste o parâmetro `dedupWindowSeconds` |
