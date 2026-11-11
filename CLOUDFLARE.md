# Notificações do DUDA com o app fechado (Cloudflare, grátis)

Tempo estimado: 15 minutos. Tudo pelo site da Cloudflare, sem instalar nada no computador e sem cartão de crédito.

## Como funciona

1. Ao criar uma tarefa com horário e lembrete, o DUDA envia ao servidor só o horário, o título e um resumo curto.
2. O servidor confere a lista a cada minuto e manda a notificação para o iPhone no horário certo.
3. Ela aparece mesmo com o DUDA fechado e a tela bloqueada.

As tarefas continuam guardadas apenas no iPhone. O servidor guarda só os lembretes dos próximos 30 dias.

## Passo 1. Criar a conta

1. Acesse **dash.cloudflare.com/sign-up** e crie uma conta gratuita (e-mail e senha).
2. Confirme o e-mail. Não é preciso cadastrar domínio nem cartão.

## Passo 2. Criar o banco de dados

1. No menu lateral, abra **Storage & Databases** e depois **D1 SQL Database**.
2. Clique em **Create** (Criar).
3. Nome: `duda-push`. Clique em **Create**.

Não é preciso criar tabelas: o servidor cria tudo sozinho no primeiro acesso.

## Passo 3. Criar o servidor (Worker)

1. No menu lateral, abra **Workers & Pages** e clique em **Create** (Criar).
2. Escolha **Start with Hello World!** (ou “Create Worker”).
3. Nome: `duda-push`. Clique em **Deploy**.
4. Clique em **Edit code** (Editar código).
5. Apague todo o código de exemplo, cole o conteúdo inteiro do arquivo **`push-server/worker.js`** e clique em **Deploy**.

## Passo 4. Ligar o banco ao servidor

1. Ainda no Worker `duda-push`, abra a aba **Settings** (Configurações) e depois **Bindings** (Vinculações).
2. Clique em **Add binding** e escolha **D1 database**.
3. **Variable name**: `DB` (exatamente assim, em maiúsculas).
4. **D1 database**: `duda-push`.
5. Salve com **Add binding** / **Deploy**.

## Passo 5. Ligar o relógio (a cada minuto)

1. Em **Settings**, procure **Trigger Events** (ou “Triggers”).
2. Clique em **Add**, escolha **Cron Triggers**.
3. Escolha **Every minute** ou digite `* * * * *`.
4. Salve.

## Passo 6. Conferir se está no ar

Na página do Worker aparece o endereço dele, parecido com:

```
https://duda-push.SEU-USUARIO.workers.dev
```

Abra esse endereço no navegador. Deve aparecer:

```
{"app":"DUDA","status":"ok","aparelhos":0}
```

Se aparecer `Banco D1 não ligado ao Worker`, revise o Passo 4.

## Passo 7. Apontar o DUDA para o servidor

1. Abra a pasta **`dist`** do projeto e edite o arquivo **`duda-config.json`** com o Bloco de Notas (Windows) ou o TextEdit (Mac).
2. Coloque o endereço do Worker entre as aspas:

```json
{
  "pushServer": "https://duda-push.SEU-USUARIO.workers.dev"
}
```

3. Salve e publique a pasta `dist` de novo no Netlify (**Deploys** e arraste a pasta).

Quem publica pelo GitHub pode editar `public/duda-config.json` ou definir a variável `VITE_PUSH_SERVER_URL` no painel da hospedagem.

## Passo 8. Proteger o servidor (recomendado)

Isso faz o servidor aceitar pedidos apenas do endereço do DUDA.

1. No Worker, abra **Settings** e depois **Variables and Secrets**.
2. Adicione duas variáveis do tipo **Text**:
   - `ALLOWED_ORIGIN`: o endereço do DUDA, por exemplo `https://duda-maria.netlify.app` (sem barra no final).
   - `VAPID_SUBJECT`: `mailto:` seguido de um e-mail seu, por exemplo `mailto:seuemail@gmail.com`.
3. Clique em **Deploy**.

## Passo 9. Ativar no iPhone

1. Abra o DUDA pelo ícone da **Tela de Início** (no Safari comum não funciona).
2. Vá em **Perfil › Lembretes** e toque em **Ativar notificações**.
3. Toque em **Permitir** no aviso do iPhone.
4. Toque em **Enviar teste** e bloqueie a tela: a notificação deve chegar em poucos segundos.

Pronto. A partir daí, toda tarefa com horário e lembrete avisa no momento certo.

## Dúvidas comuns

**Quanto custa?** Nada. O plano gratuito da Cloudflare cobre com muita folga o uso de uma pessoa (o relógio roda 1.440 vezes por dia, e o limite gratuito é de 100 mil pedidos diários).

**A notificação não chegou.**
- Confira se o DUDA foi aberto pelo ícone da Tela de Início.
- Veja em **Ajustes › Notificações › DUDA** se as notificações estão permitidas.
- Desative o Modo Foco ou o Não Perturbe.
- No painel do Worker, a aba **Logs** mostra se o relógio está rodando.

**Tarefas que se repetem.** O servidor recebe os lembretes dos próximos 30 dias. Basta abrir o DUDA ao menos uma vez por mês para a lista ser renovada; isso acontece sozinho ao abrir o app.

**Trocou de iPhone ou reinstalou o app.** Toque em **Ativar notificações** de novo.

**Sem internet no horário.** A notificação chega quando o celular voltar a ter conexão, se ainda estiver dentro de uma hora. Para compromissos críticos, use também **Exportar tarefas futuras para o Calendário**, que funciona offline.

**Privacidade.** O servidor é seu, na sua conta, e guarda só título, horário e um resumo curto de cada lembrete. Lembretes antigos são apagados automaticamente depois de 3 dias.
