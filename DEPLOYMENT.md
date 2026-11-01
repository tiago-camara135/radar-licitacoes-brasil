# Publicação do Radar

O serviço de produção é `radar-licitacoes-brasil-app` no Render, ligado à branch `main` deste repositório pela integração GitHub do Render.

- Runtime: Node, conforme `package.json`.
- Build: `npm install --omit=dev`.
- Inicialização: `npm start`.
- Auto-deploy: `On Commit`.
- Endereço: https://radar-licitacoes-brasil-app.onrender.com/

## Verificação de uma publicação

1. Confirme que o commit enviado à `main` aparece automaticamente em Deploys no Render.
2. Aguarde o estado `Live` para esse mesmo commit.
3. Execute `npm test` e `RLB_BASE_URL=https://radar-licitacoes-brasil-app.onrender.com npm run smoke`.
4. Confira o workflow Stability Check: ele testa cadastro, sessão, permissões, alertas, busca de oportunidades ativas, rejeição de upload inválido e logout em banco de teste isolado.

Credenciais e URLs de deploy hook devem permanecer fora do repositório. A integração GitHub do Render deve estar instalada e autorizada para este repositório; apenas informar a URL pública não estabelece o recebimento de eventos de novos commits.
