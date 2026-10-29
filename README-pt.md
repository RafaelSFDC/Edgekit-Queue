# ⚡ Cloudflare-Stash

> **Clone self-hosted do Upstash (QStash + Redis) na Cloudflare Workers usando Hono e Durable Objects (SQLite).**  
> 100% serverless, plug-and-play, super leve e pensado para ser **extremamente amigável para iniciantes (noob friendly)**.

Leia em [Inglês (English)](README.md)

---

## 🚀 Por que o Cloudflare-Stash é diferente?

Inspirado em projetos como [tiago123456789/simple-queue](https://github.com/tiago123456789/simple-queue) e nos serviços pagos do **Upstash (QStash & Redis)**, o **Cloudflare-Stash** foi reconstruído do zero para resolver as maiores dores de quem quer hospedar sua própria infraestrutura:

| Recurso | Outras soluções (ex: simple-queue) | **Cloudflare-Stash** ⚡ |
| :--- | :--- | :--- |
| **Agendador / Cron** | Exigia conta no **Supabase** + SQL cron manual | **Zero serviços externos!** Usa alarmes nativos do Cloudflare Durable Objects (`storage.setAlarm`) |
| **Criação de Grupos/Filas** | Exigia alterar `groups.json` no código e redeploy | **100% Dinâmico**: crie e use qualquer grupo na hora via API (`?groupId=...`) |
| **Funcionalidades** | Apenas fila HTTP simples | **2 em 1**: Fila HTTP (QStash) + Banco Chave-Valor (Redis REST) |
| **Compatibilidade** | Rotas proprietárias | **Compatível com SDK do `@upstash/redis`** e formato QStash v2 |
| **Painel de Controle** | HTML estático básico | **Dashboard moderno** em `/dashboard` com gerenciamento de DLQ, retry com 1 clique, testador visual e explorador Redis |
| **Instalação** | Múltiplas etapas manuais e configs | **1 Comando**: `npm run deploy` e está funcionando |

---

## 🌟 Principais Recursos

1. **QStash (Fila HTTP & Tarefas em Segundo Plano)**
   - Envie mensagens para qualquer URL webhook de forma assíncrona.
   - **Agendamento com atraso (Delays)**: `10s`, `30s`, `5m`, `1h`, `1d` ou timestamp UNIX.
   - **Retentativas automáticas (Backoff Exponencial)**: Se o seu servidor downstream falhar (500, timeout), a fila tenta novamente de forma inteligente.
   - **Dead Letter Queue (DLQ)**: Mensagens que esgotarem as tentativas vão para o DLQ para análise e reprocessamento com 1 clique.
   - **Webhook de Retorno (Callback URL)**: Notificação quando uma mensagem for entregue com sucesso ou falhar.
   - **Deduplicação**: Evite mensagens duplicadas passando um `dedupId`.

2. **Upstash Redis REST Clone**
   - Execute comandos Redis sobre HTTP simples: `GET`, `SET`, `DEL`, `INCR`, `DECR`, `EXPIRE`, `TTL`, `KEYS`, `FLUSHDB`.
   - **Compatível com `@upstash/redis`**: Você pode usar o SDK oficial da Upstash em Next.js, Node.js ou Python apontando para o seu Worker da Cloudflare!
   - Suporte a pipeline: envie múltiplos comandos de uma só vez (`/pipeline`).

3. **Dashboard Visual Integrado**
   - Acesse diretamente no seu navegador em `/dashboard`.
   - Visualize métricas em tempo real (Mensagens Pendentes, Agendadas, Em Execução, DLQ e Chaves Redis).
   - Teste disparos de mensagens e comandos Redis pela própria interface.
   - Reenvie mensagens com falha do DLQ com 1 clique.

---

## ⚡ Início Rápido em 1 Minuto (Plug & Play)

### 1. Clonar e Instalar

```bash
git clone https://github.com/seu-usuario/cloudflare-stash.git
cd cloudflare-stash
npm install
```

### 2. Testar Localmente

```bash
npm run dev
```

Abra [http://localhost:8787/dashboard](http://localhost:8787/dashboard) no navegador!  
A chave padrão de desenvolvimento é: `stash_secret_key`.

### 3. Fazer Deploy na Cloudflare (Plano Gratuito)

Se você ainda não estiver logado no Wrangler:
```bash
npx wrangler login
```

E faça o deploy com um único comando:
```bash
npm run deploy
```

Pronto! Seu Worker já está no ar com URL pública (ex: `https://cloudflare-stash.seu-subdominio.workers.dev`).

---

## 📖 Como Usar o QStash (Filas e Agendamentos)

### 1. Enviar Mensagem Imediata

```bash
curl -X POST "https://SEU_WORKER.workers.dev/publish?url=https://seu-site.com/api/webhook" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "evento": "novo_usuario",
    "email": "teste@exemplo.com"
  }'
```

### 2. Enviar Mensagem com Atraso (Delay)

Você pode atrasar a execução usando o parâmetro `delay`:
- Segundos: `10s`, `30s`
- Minutos: `5m`, `15m`
- Horas: `1h`, `2h`
- Dias: `1d`

```bash
curl -X POST "https://SEU_WORKER.workers.dev/publish?url=https://seu-site.com/api/lembrete&delay=10m" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"lembrete": "Reunião em 10 minutos"}'
```

### 3. Usar Grupos / Filas Separadas

Não precisa configurar nada previamente! Apenas passe o nome do grupo:

```bash
curl -X POST "https://SEU_WORKER.workers.dev/publish?groupId=emails&url=https://seu-site.com/api/enviar-email" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{"para": "cliente@email.com", "assunto": "Bem-vindo"}'
```

### 4. Configurar Retentativas e Callback

```bash
curl -X POST "https://SEU_WORKER.workers.dev/publish" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://meu-servico.com/processar",
    "retries": 5,
    "delay": "30s",
    "callbackUrl": "https://meu-servico.com/notificar-conclusao",
    "payload": { "id": 1234 }
  }'
```

---

## 🗄️ Como Usar o Redis REST (Upstash Clone)

### 1. Via cURL / HTTP REST

#### Gravar Chave (SET com expiração opcional de 60 segundos):
```bash
curl -X POST "https://SEU_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["SET", "usuario:1", "João Silva", "EX", 60]'
```
*Resposta:* `{"result": "OK"}`

#### Ler Chave (GET):
```bash
curl -X POST "https://SEU_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["GET", "usuario:1"]'
```
*Resposta:* `{"result": "João Silva"}`

#### Incrementar Contador (INCR):
```bash
curl -X POST "https://SEU_WORKER.workers.dev/" \
  -H "x-api-key: stash_secret_key" \
  -H "Content-Type: application/json" \
  -d '["INCR", "contador_visitas"]'
```
*Resposta:* `{"result": 1}`

---

### 2. Usando a biblioteca oficial `@upstash/redis` (Node.js / Next.js / TypeScript)

Instale o pacote:
```bash
npm install @upstash/redis
```

No seu código:
```typescript
import { Redis } from '@upstash/redis';

// Aponte para o seu próprio Worker na Cloudflare!
const redis = new Redis({
  url: 'https://SEU_WORKER.workers.dev',
  token: 'stash_secret_key',
});

async function exemplo() {
  // SET com TTL
  await redis.set('sessao:abc', { id: 1, plano: 'pro' }, { ex: 3600 });

  // GET
  const sessao = await redis.get('sessao:abc');
  console.log('Sessão:', sessao);

  // INCR
  const visualizacoes = await redis.incr('contador:blog');
  console.log('Visualizações:', visualizacoes);
}
```

---

## 📊 Endpoints da API

### Filas (QStash)
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `POST` | `/publish` | Publica uma mensagem na fila (imediata ou com delay). |
| `POST` | `/v2/publish/:destinationUrl` | Endpoint compatível com Upstash QStash REST v2. |
| `ALL` | `/process` | Força o processamento do lote da fila (se quiser acionar manualmente). |
| `GET` | `/stats?groupId=default` | Retorna contadores da fila (pendentes, agendados, DLQ, etc). |
| `GET` | `/messages?groupId=default` | Lista mensagens ativas/pendentes. |
| `DELETE` | `/messages/:id` | Cancela/exclui uma mensagem agendada. |
| `GET` | `/dlq?groupId=default` | Lista mensagens com falha que estão no Dead Letter Queue. |
| `POST` | `/dlq/:id/retry` | Reenvia uma mensagem do DLQ de volta para a fila ativa. |
| `DELETE` | `/dlq/:id` | Exclui permanentemente uma mensagem do DLQ. |
| `POST` | `/purge?target=active\|dlq` | Limpa toda a fila ou DLQ de um grupo. |

### Redis REST
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `POST` | `/` | Executa comando Redis em formato array (ex: `["SET", "k", "v"]`). |
| `POST` | `/pipeline` | Executa múltiplos comandos Redis em lote. |
| `GET` | `/get/:key` | Rota REST simples para obter o valor de uma chave. |
| `POST` | `/set/:key/:val` | Rota REST simples para definir chave e valor. |
| `DELETE` | `/del/:key` | Remove uma chave. |
| `GET` | `/kv/list` | Lista as chaves armazenadas com seus TTLs. |

### Interface Gráfica
| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/dashboard` | Interface visual completa para gerenciar filas e Redis. |

---

## 🔒 Segurança e Autenticação

Todas as chamadas à API são protegidas pela chave configurada em `API_KEY`.
Você pode enviar a chave de qualquer uma das seguintes formas:

1. **Header HTTP**:
   ```http
   x-api-key: sua_chave_secreta
   ```
2. **Authorization Bearer**:
   ```http
   Authorization: Bearer sua_chave_secreta
   ```
3. **Query Parameter** (útil para testes rápidos):
   ```
   https://SEU_WORKER.workers.dev/stats?key=sua_chave_secreta
   ```

### Como alterar a chave para produção:

Edite o arquivo `wrangler.jsonc` ou use o comando seguro de segredos da Cloudflare:
```bash
npx wrangler secret put API_KEY
```

---

## 🛠️ Variáveis de Configuração (`wrangler.jsonc`)

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `API_KEY` | `"stash_secret_key"` | Chave secreta que protege as requisições à API. |
| `HTTP_REQUEST_TIMEOUT` | `15` | Tempo limite em segundos para cada chamada HTTP downstream. |
| `TOTAL_RETRIES_BEFORE_DLQ`| `3` | Quantidade de tentativas antes de mover a mensagem para o DLQ. |
| `MAX_CONCURRENT_DELIVERIES`| `10` | Quantidade máxima de mensagens processadas por lote simultaneamente. |

---

## 🧪 Rodando os Testes

O projeto vem com uma suíte de testes completa cobrindo cálculo de atrasos, operações de chave-valor e rotas HTTP:

```bash
npm test
```

---

## 📄 Licença

Distribuído sob a licença MIT. Sinta-se livre para usar, modificar e distribuir em seus próprios projetos!
