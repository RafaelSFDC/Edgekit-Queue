import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PageHeader,
} from '../src/components/ui/page-header';

async function testPageHeader() {
  console.log('🧪 Iniciando testes de validação do componente PageHeader...');

  // 1. Título e subtítulo simples
  const html1 = renderToStaticMarkup(
    React.createElement(PageHeader, {
      title: 'Fila de Mensagens',
      subtitle: 'Tarefas ativas no Durable Object',
    })
  );
  assert(html1.includes('Fila de Mensagens'), 'Deve renderizar o título');
  assert(html1.includes('Tarefas ativas no Durable Object'), 'Deve renderizar o subtítulo');
  assert(!html1.includes('shrink-0'), 'Não deve ter container de ações quando não houver botões');
  console.log('✅ Renderização de título e subtítulo validada!');

  // 2. Suporte a description como alias de subtitle
  const html2 = renderToStaticMarkup(
    React.createElement(PageHeader, {
      title: 'Visão Geral',
      description: 'Painel de métricas',
    })
  );
  assert(html2.includes('Painel de métricas'), 'Deve suportar description');
  console.log('✅ Suporte a description como alias validado!');

  // 3. Ações via children
  const html3 = renderToStaticMarkup(
    React.createElement(
      PageHeader,
      {
        title: 'Chaves Redis',
        subtitle: 'Armazenamento KV',
      },
      React.createElement('button', { type: 'button' }, 'Nova Chave')
    )
  );
  assert(html3.includes('Nova Chave'), 'Deve renderizar botões passados via children');
  assert(html3.includes('shrink-0'), 'Deve conter container de ações à direita');
  console.log('✅ Renderização de botões de ação via children validada!');

  // 4. Ações via prop actions
  const html4 = renderToStaticMarkup(
    React.createElement(PageHeader, {
      title: 'Dead Letter Queue',
      subtitle: 'Falhas de entrega',
      actions: React.createElement('button', { type: 'button' }, 'Limpar DLQ'),
    })
  );
  assert(html4.includes('Limpar DLQ'), 'Deve renderizar botão passado via prop actions');
  assert(html4.includes('shrink-0'), 'Deve conter container de ações à direita');
  console.log('✅ Renderização de ações via prop actions validada!');

  console.log('🎉 TODOS OS TESTES DO PAGEHEADER PASSARAM COM 100% DE SUCESSO!');
}

testPageHeader();
