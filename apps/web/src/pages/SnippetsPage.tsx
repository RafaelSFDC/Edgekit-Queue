import React, { useState } from 'react';
import { PageLayout } from '../components/layout/PageLayout';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useI18n } from '../i18n/context';
import { getStoredApiKey } from '../services/api';
import { copyToClipboard } from '@/lib/utils';
import { toast } from 'sonner';
import { Code2, Copy, Check, Terminal } from 'lucide-react';

export const SnippetsPage: React.FC = () => {
  const { t } = useI18n();
  const apiKey = getStoredApiKey() || 'YOUR_API_KEY';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787';

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (code: string, id: string) => {
    copyToClipboard(code);
    setCopiedId(id);
    toast.success(t.common.copied);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // QStash Snippets
  const qstashTs = `import { Client } from "@upstash/qstash";

const client = new Client({
  baseUrl: "${baseUrl}",
  token: "${apiKey}",
});

// 1. Publicar tarefa com 10 segundos de atraso
const res = await client.publishJSON({
  url: "https://meusite.com/api/webhook",
  body: { event: "order.created", orderId: "ord_123" },
  delay: "10s",
  retries: 3,
});

console.log("Mensagem agendada:", res.messageId);`;

  const qstashCurl = `# Publicar mensagem na fila com 10s de atraso e retentativas
curl -X POST "${baseUrl}/publish" \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -H "Upstash-Delay: 10s" \\
  -H "Upstash-Retries: 3" \\
  -d '{
    "url": "https://meusite.com/api/webhook",
    "payload": { "event": "order.created", "orderId": "ord_123" }
  }'`;

  const qstashPython = `import requests

url = "${baseUrl}/publish"
headers = {
    "X-API-Key": "${apiKey}",
    "Upstash-Delay": "10s",
    "Upstash-Retries": "3",
    "Content-Type": "application/json"
}
payload = {
    "url": "https://meusite.com/api/webhook",
    "payload": {"event": "order.created", "orderId": "ord_123"}
}

response = requests.post(url, json=payload, headers=headers)
print("Publicado:", response.json())`;

  // Redis Snippets
  const redisTs = `import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "${baseUrl}",
  token: "${apiKey}",
});

// 1. Gravar chave com TTL de 1 hora (3600 segundos)
await redis.set("user:123:session", JSON.stringify({ userId: 123, role: "admin" }), { ex: 3600 });

// 2. Ler chave
const session = await redis.get("user:123:session");
console.log("Sessão recuperada:", session);`;

  const redisCurl = `# 1. Gravar valor no Redis (REST API)
curl -X POST "${baseUrl}/set/user:123:session?ex=3600" \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"value": "{\\"userId\\":123,\\"role\\":\\"admin\\"}"}'

# 2. Ler valor do Redis
curl -X GET "${baseUrl}/get/user:123:session" \\
  -H "X-API-Key: ${apiKey}"`;

  const redisPython = `from upstash_redis import Redis

redis = Redis(
    url="${baseUrl}",
    token="${apiKey}"
)

# Gravar chave com expiração
redis.set("user:123:session", '{"userId": 123}', ex=3600)

# Obter valor
val = redis.get("user:123:session")
print("Valor obtido:", val)`;

  return (
    <PageLayout>
      <PageHeader
        title={t.snippets.title}
        description={t.snippets.subtitle}
      />

      <Tabs defaultValue="qstash" className="space-y-6">
        <TabsList className="bg-muted p-1">
          <TabsTrigger value="qstash" className="gap-2 text-xs">
            <Terminal className="size-3.5" />
            <span>{t.snippets.qstashTab}</span>
          </TabsTrigger>
          <TabsTrigger value="redis" className="gap-2 text-xs">
            <Code2 className="size-3.5" />
            <span>{t.snippets.redisTab}</span>
          </TabsTrigger>
        </TabsList>

        {/* QStash Tab */}
        <TabsContent value="qstash" className="space-y-4">
          {/* TypeScript */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.typescript}</CardTitle>
                <CardDescription className="text-xs">
                  Compatível diretamente com o pacote oficial <code>@upstash/qstash</code>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(qstashTs, 'qstash-ts')}
              >
                {copiedId === 'qstash-ts' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'qstash-ts' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {qstashTs}
              </pre>
            </CardContent>
          </Card>

          {/* cURL */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.curl}</CardTitle>
                <CardDescription className="text-xs">
                  Disparo direto via requisição HTTP simples
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(qstashCurl, 'qstash-curl')}
              >
                {copiedId === 'qstash-curl' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'qstash-curl' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {qstashCurl}
              </pre>
            </CardContent>
          </Card>

          {/* Python */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.python}</CardTitle>
                <CardDescription className="text-xs">
                  Integração usando requests no Python
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(qstashPython, 'qstash-py')}
              >
                {copiedId === 'qstash-py' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'qstash-py' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {qstashPython}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Redis Tab */}
        <TabsContent value="redis" className="space-y-4">
          {/* TypeScript */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.typescript}</CardTitle>
                <CardDescription className="text-xs">
                  Compatível com o cliente oficial <code>@upstash/redis</code>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(redisTs, 'redis-ts')}
              >
                {copiedId === 'redis-ts' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'redis-ts' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {redisTs}
              </pre>
            </CardContent>
          </Card>

          {/* cURL */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.curl}</CardTitle>
                <CardDescription className="text-xs">
                  Acesso REST direto para comandos GET e SET
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(redisCurl, 'redis-curl')}
              >
                {copiedId === 'redis-curl' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'redis-curl' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {redisCurl}
              </pre>
            </CardContent>
          </Card>

          {/* Python */}
          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-semibold">{t.snippets.python}</CardTitle>
                <CardDescription className="text-xs">
                  Compatível com a biblioteca <code>upstash-redis</code>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => handleCopy(redisPython, 'redis-py')}
              >
                {copiedId === 'redis-py' ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedId === 'redis-py' ? t.common.copied : t.snippets.copyCode}</span>
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="p-4 bg-muted/60 border border-border rounded-lg font-mono text-xs overflow-x-auto text-foreground">
                {redisPython}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
};
