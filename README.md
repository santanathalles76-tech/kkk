# DUDA

Aplicativo de organização pessoal de **Maria Eduarda**: tarefas, agenda, progresso e perfil.
É um app web instalável (PWA): abre pelo Safari, vai para a Tela de Início do iPhone com o ícone **D**, funciona offline e guarda os dados no próprio aparelho. Não precisa de Expo Go, TestFlight, cadastro nem servidor pago.

## O que o app faz

| Área | Recursos |
|---|---|
| Início | Saudação conforme o horário, resumo do dia com anel de progresso, próxima tarefa, pendentes, concluídas, atrasadas, sem data e atalho para adicionar |
| Tarefas | Criar, editar, excluir (com desfazer), concluir, título, descrição, data, horário, prioridade alta, média ou baixa, categorias personalizadas, pesquisa, filtros (situação, quando, prioridade, categoria) e ordenação por data ou prioridade |
| Agenda | Visões de mês, semana e dia, compromissos por data, mover data (“para hoje”, “+1 dia”, “+1 semana”), tarefas recorrentes (diária, dias úteis, semanal, mensal, com data final opcional) |
| Progresso | Estatísticas de dia, semana e mês, percentual de conclusão, tarefas por dia, desempenho por prioridade, sequência de dias completos, total concluído e histórico das últimas 8 semanas |
| Perfil | Avatar D, nome, aparência clara/escura/automática, cor de destaque, início da semana, visão padrão da agenda, lembretes, categorias, backup e instalação |

## Tecnologia

React 19 + TypeScript + Vite, `vite-plugin-pwa` (manifest e service worker com Workbox), IndexedDB para os dados, `lucide-react` para os ícones e animações em CSS. Sem roteador nem biblioteca de estado: a navegação usa o endereço (`#/agenda`), o que permite o gesto de voltar do iPhone.

```
src/
  App.tsx              navegação, tema, lembretes
  lib/db.ts            IndexedDB (com reserva em localStorage)
  lib/store.tsx        estado e gravação, com desfazer e tratamento de erros
  lib/tasks.ts         recorrência, ordenação, validação
  lib/stats.ts         estatísticas
  lib/reminders.ts     notificações e exportação para o Calendário (.ics)
  lib/sync.ts          ponto de extensão para sincronizar no futuro (Supabase)
  screens/             Início, Tarefas, Agenda, Progresso, Perfil
  components/          tarefa, folha de edição, componentes visuais
public/icons, public/splash   ícones e telas de abertura do iPhone
scripts/gerar-icones.cjs      regenera ícones e telas de abertura
```

## Rodar no computador

```bash
npm install
npm run dev        # desenvolvimento
npm run build      # build de produção em dist/
npm run preview    # testar o build em http://localhost:4173
```

## Publicar de graça (link público com HTTPS)

### Opção mais simples: Netlify Drop (sem Git, sem cartão)
1. Crie uma conta gratuita em netlify.com (pode entrar com e-mail ou Google).
2. Acesse **app.netlify.com/drop**.
3. Arraste a pasta **`dist`** (já incluída neste projeto, ou gerada com `npm run build`) para a página.
4. Em segundos o Netlify mostra um endereço `https://….netlify.app`. Em **Site configuration › Change site name** dá para trocar por algo como `duda-maria.netlify.app`.
5. Para atualizar depois: rode `npm run build` e arraste a nova `dist` em **Deploys**.

### Com GitHub (atualiza sozinho a cada alteração)
Suba o projeto para um repositório e importe em **Netlify**, **Vercel** ou **Cloudflare Pages**. As configurações já estão prontas:
- Netlify: `netlify.toml`
- Vercel: `vercel.json`
- Cloudflare Pages: `public/_redirects` e `public/_headers` (comando `npm run build`, pasta `dist`)

Não há variáveis de ambiente obrigatórias. As três plataformas fornecem HTTPS automaticamente, requisito para o service worker e para a instalação.

## Instalar no iPhone

1. Abra o link público no **Safari** (não funciona por outros navegadores no iOS antigo, nem por dentro do Instagram/WhatsApp; se abrir por um link nesses apps, toque em “Abrir no Safari”).
2. Toque em **Compartilhar** (quadrado com seta para cima).
3. Toque em **Adicionar à Tela de Início**, confirme o nome **DUDA** e toque em **Adicionar**.
4. Abra pelo ícone **D**: o app ocupa a tela toda, sem barra do Safari.
5. Em **Perfil › Lembretes**, toque em **Ativar notificações** e permita.

## Dados

- Ficam no iPhone, em IndexedDB, e continuam lá ao fechar o app, reiniciar o celular ou ficar sem internet.
- O app pede ao sistema armazenamento persistente para reduzir o risco de limpeza automática.
- **Perfil › Dados e backup** exporta um arquivo `.json` (salve em Arquivos ou iCloud Drive) e importa de volta, mesclando sem duplicar ou substituindo tudo.
- Nenhum dado de exemplo é criado: o app começa vazio, apenas com quatro categorias editáveis (Pessoal, Estudos, Trabalho, Saúde).

## Notificações com o app fechado

A pasta **`push-server/`** traz um servidor gratuito para a Cloudflare que envia os lembretes mesmo com o DUDA fechado. O passo a passo completo, feito só pelo painel do site, está em **[CLOUDFLARE.md](CLOUDFLARE.md)**. Sem esse servidor, o DUDA avisa enquanto está aberto e oferece a exportação para o Calendário do iPhone.

## Limitações reais do iPhone para apps web

1. **Notificações.** O iOS (16.4 ou superior) só permite notificações web para apps instalados na Tela de Início e com permissão concedida. Para avisar com o app fechado é preciso o servidor gratuito da Cloudflare (veja acima), e o celular precisa de internet no horário do aviso. A exportação para o Calendário continua como reserva offline.
2. **Dados por navegador.** Os dados do app instalado ficam separados dos dados do Safari. Use sempre o ícone da Tela de Início. Se o ícone for removido, os dados vão junto: faça backups.
3. **Limpeza pelo sistema.** Se o app ficar semanas sem ser aberto, o iOS pode apagar dados de sites não instalados. Instalado na Tela de Início e com armazenamento persistente, esse risco é mínimo, mas o backup continua recomendado.
4. **Sem sincronização de tarefas entre aparelhos.** Hoje tudo fica em um único iPhone. A estrutura em `src/lib/sync.ts` está pronta para conectar um Supabase gratuito no futuro.
5. **Tela de abertura.** O iOS usa as imagens de abertura apenas nos tamanhos de iPhone que conhece; em modelos futuros com nova resolução, aparece a cor de fundo creme.
6. **Testes.** O app foi testado em navegador Chromium simulando o iPhone 15 Pro (Playwright). O motor WebKit real do Safari não está disponível neste ambiente, então a validação final deve ser feita em um iPhone após a publicação.

## Caminho para app nativo

A lógica (`src/lib`) é TypeScript puro, sem dependência de navegador nas regras de tarefas, recorrência e estatísticas. Para um app nativo, ela pode ser reaproveitada em React Native/Expo ou embrulhada com Capacitor, trocando apenas `db.ts` (armazenamento) e `reminders.ts` (notificações locais nativas).
