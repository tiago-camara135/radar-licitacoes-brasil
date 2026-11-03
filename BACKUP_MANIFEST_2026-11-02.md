# Radar de Licitações Brasil — Backup estável de 02/11/2026

Este manifesto registra o ponto de restauração criado após a estabilização da Análise Completa do Edital e do Diagnóstico Empresa × Edital.

## 1. Código-fonte

- Repositório: `tiago-camara135/radar-licitacoes-brasil`
- Branch estável congelada: `backup/stable-full-site-2026-11-02`
- Commit exato: `9772d484e594756a62eb63a20fbc75107cdea2f1`
- Tree SHA: `2b180807fcb40bd04565208d7cf83027065b7f64`
- Runtime: `production-v33.mjs`
- Package version: `2.19.0`

A branch de backup aponta exatamente para o commit em produção e não deve ser usada para desenvolvimento.

## 2. Banco de dados Neon

- Project ID: `silent-frog-65712360`
- Branch de produção de origem: `br-floral-grass-b8jd2d0f` (`main`)
- Branch de backup criada: `br-bitter-wildflower-b89ss1ug`
- Nome: `backup-stable-2026-11-02-full-site`
- Parent LSN congelado: `0/1E3550A0`
- Parent timestamp: `2026-11-03T01:01:23Z`
- Compute na branch de backup: **nenhum** (`no_compute`), para evitar escrita acidental e consumo desnecessário.

Bases presentes na cópia:

- `radar`
- `radar_prod_20261101_v3` — base de produção ativa no momento do backup.

Observação: foi tentada a criação de um snapshot adicional, mas o plano do Neon informou limite de snapshots atingido. Nenhum snapshot existente foi apagado. O snapshot anterior `radar-post-migration-2026-11-01` (`snap-ancient-wildflower-b86jbpki`) foi preservado e expira em 01/12/2026. A branch-clone acima é o ponto de recuperação desta versão atual.

Também foi tentado proteger a branch de backup no Neon, porém o plano atingiu o limite de branches protegidas. A branch continua separada, sem compute e fora do fluxo da aplicação.

## 3. Render — configuração operacional no ponto do backup

- Workspace: `tea-dbi2d8h42hec73c8misg`
- Service ID: `srv-dbi7p1mtlv9c7393m41g`
- Serviço: `radar-licitacoes-brasil-app`
- Repositório conectado: `https://github.com/tiago-camara135/radar-licitacoes-brasil`
- Branch de deploy: `main`
- Auto deploy: `yes`
- Trigger: `commit`
- Runtime: `node`
- Build command: `npm install --omit=dev`
- Start command: `npm start`
- Região: `virginia`
- Instâncias: `1`
- URL Render: `https://radar-licitacoes-brasil-app.onrender.com`
- Deploy estável correspondente: `dep-dbkj2659el5s73eja8mg`
- Commit do deploy: `9772d484e594756a62eb63a20fbc75107cdea2f1`

As variáveis de ambiente e segredos permanecem armazenados no Render. Seus valores não são copiados para este repositório por segurança e porque o conector disponível não expõe valores secretos para leitura/exportação.

## 4. Validação do ponto estável

No momento da criação deste backup:

- Deploy Render: **LIVE**
- Stability Check do `main`: **SUCCESS**
- Syntax checks: **SUCCESS**
- Regression tests: **SUCCESS**
- Authenticated browser-like integration smoke: **SUCCESS**
- Matriz de pré-habilitação v3: ativa
- CSS externo CSP-safe do Diagnóstico Empresa × Edital: ativo
- Monitor PNCP, notificações, recuperação de conta e banco PostgreSQL: inicializados normalmente.

Workflow principal validado: `41556308765`.

## 5. Procedimento de restauração

Em caso de regressão futura, não restaurar de forma destrutiva sem confirmação.

### Código

Usar o commit `9772d484e594756a62eb63a20fbc75107cdea2f1` ou a branch `backup/stable-full-site-2026-11-02` como fonte. O `main` pode ser realinhado a esse commit somente após autorização e verificação do impacto.

### Banco

A branch Neon `backup-stable-2026-11-02-full-site` representa o estado completo do branch de produção no LSN `0/1E3550A0`. Para recuperação, preferir criar/ativar um ambiente a partir desta cópia e validar antes de trocar a conexão de produção.

### Render

Após restaurar o código, manter a configuração operacional registrada acima. Confirmar `DATABASE_URL`, chaves de IA, e-mail e demais segredos no Render antes de redirecionar tráfego ou publicar uma restauração.

## 6. Regra de segurança

Este backup deve ser tratado como **baseline estável**. Novas atualizações devem ser feitas a partir do `main`, testadas em branch/CI e só depois publicadas. Não alterar manualmente a branch `backup/stable-full-site-2026-11-02`.
