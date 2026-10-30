import assert from 'node:assert';
import { router } from '../src/router';
import { ptBR } from '../src/i18n/locales/pt-BR';
import { en } from '../src/i18n/locales/en';

async function testAuthRouting() {
  console.log('🧪 Iniciando testes de validação de Rotas e Autenticação (/login)...');

  // 1. Validar que a rota /login existe e está fora do _dashboard
  console.log('1. Validando estrutura da rota /login...');
  const routes = router.routesByPath as Record<string, any>;
  assert.ok(routes['/login'], 'A rota /login deve existir no router');
  assert.strictEqual(
    routes['/login'].parentRoute?.id,
    '__root__',
    'A rota /login deve ser filha direta da raiz, fora de layouts protegidos'
  );
  console.log('✅ Rota /login configurada fora do layout da dashboard!');

  // 2. Validar que as rotas da Dashboard estão aninhadas no layout protegido
  console.log('2. Validando rotas protegidas da Dashboard...');
  const dashboardRoutes = ['/', '/messages', '/dlq', '/redis', '/snippets'];
  for (const path of dashboardRoutes) {
    const route = routes[path];
    assert.ok(route, `A rota ${path} deve estar registrada`);
    assert.strictEqual(
      route.parentRoute?.id,
      '/_dashboard',
      `A rota ${path} deve ser filha de /_dashboard`
    );
  }
  console.log('✅ Todas as rotas da dashboard (/ , /messages, /dlq, /redis, /snippets) pertencem a _dashboard!');

  // 3. Validar chaves de tradução i18n para Login
  console.log('3. Validando traduções i18n (pt-BR e en)...');
  assert.ok(ptBR.login.title, 'pt-BR deve conter login.title');
  assert.ok(ptBR.login.apiKeyLabel, 'pt-BR deve conter login.apiKeyLabel');
  assert.ok(ptBR.login.submit, 'pt-BR deve conter login.submit');

  assert.ok(en.login.title, 'en deve conter login.title');
  assert.ok(en.login.apiKeyLabel, 'en deve conter login.apiKeyLabel');
  assert.ok(en.login.submit, 'en deve conter login.submit');
  console.log('✅ Dicionários de internacionalização i18n validados com sucesso!');

  console.log('\n🎉 TODOS OS TESTES DE ROTEAMENTO E LOGIN PASSARAM COM SUCESSO!\n');
}

testAuthRouting().catch((err) => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
