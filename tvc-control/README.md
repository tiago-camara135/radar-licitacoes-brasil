# TVC Control

Aplicação de gestão financeira pessoal com dashboard responsivo, autenticação individual, contas, cartões, lançamentos, parcelamentos, orçamentos, metas e relatórios.

## Execução local
1. Instale Node.js 20 ou superior.
2. Copie .env.example para .env.
3. Preencha DATABASE_URL e JWT_SECRET.
4. Execute npm install.
5. Execute npm start e abra http://localhost:3000.

## Variáveis de ambiente
- DATABASE_URL: conexão PostgreSQL do projeto Neon.
- JWT_SECRET: segredo aleatório forte para assinar sessões.
- NODE_ENV=production em produção.
- PORT: definido automaticamente pelo Render.

## Deploy
O deploy é feito pelo Render a partir da branch tvc-control-app. O banco de dados está no Neon, região AWS São Paulo. Configure DATABASE_URL e JWT_SECRET como variáveis secretas no Render.

## Recursos implementados
- Cadastro e login com senha armazenada por hash bcrypt.
- Sessão JWT em cookie HttpOnly, Secure em produção e SameSite=Lax.
- Dados isolados por usuário no backend.
- Dashboard com saldo, receitas, despesas, pendências e fluxo de seis meses.
- Contas, categorias, cartões, lançamentos e transferências entre contas.
- Parcelamento de despesas em lançamentos mensais.
- Orçamentos por categoria, metas, relatórios CSV e lembretes editáveis de pagamentos no calendário.
- Saldo real negativo sem bloqueio; projeção com compromissos pendentes, lembretes e recorrências.
- Atividade recente no dashboard e validação de conta vinculada para movimentações pagas.
- Interface responsiva, tema claro/escuro e instalação PWA.

## Observações
A versão atual não se conecta automaticamente a bancos via Open Finance. Os lançamentos são registrados manualmente. O envio de e-mails para recuperação de senha e notificações depende da configuração de um provedor SMTP. Não cadastre senhas bancárias ou dados completos de cartão.
