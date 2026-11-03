# Radar de Licitações Brasil — Notificações Multicanal

## Arquitetura

O Radar registra a correspondência do alerta no banco e cria uma entrega por canal, com chave única por `alert_id + pncp_id + channel`, evitando duplicidades.

Fluxo:

1. Monitor PNCP grava uma nova contratação em `monitored_procurements`.
2. `notification-monitor-bridge.mjs` detecta apenas as novas linhas.
3. `notifications-v1.mjs` cruza a contratação com os alertas ativos do usuário.
4. A correspondência é registrada no Radar (`onsite`).
5. Se o contato estiver confirmado e o canal habilitado, são criadas entregas de e-mail e/ou WhatsApp.
6. E-mail segue pelo Resend.
7. WhatsApp é assumido pelo adaptador oficial Meta Cloud API quando configurado; o worker processa a mesma fila e grava `provider_id`, status, tentativas e erro.

O dispatcher base continua executando a cada 15 segundos. O worker Meta verifica a fila em intervalos menores e assume registros `waiting_provider`/`queued`, preservando a deduplicação existente.

## Banco de dados

Tabelas criadas automaticamente:

- `notification_profiles`
- `notification_alert_settings`
- `notification_verifications`
- `notification_deliveries`
- `notification_monitor_state`

## E-mail — Resend

Variáveis de ambiente:

- `RESEND_API_KEY`
- `NOTIFICATION_EMAIL_FROM` — exemplo: `Radar de Licitações Brasil <alertas@seudominio.com.br>`
- `NOTIFICATION_PUBLIC_URL` — URL pública do Radar (opcional se `APP_ORIGIN` já estiver configurada)

O domínio do remetente deve estar verificado no Resend antes do lançamento.

## WhatsApp — Meta WhatsApp Business Platform / Cloud API

Integração principal recomendada: API oficial da Meta, sem SDK ou dependência adicional.

Variáveis de ambiente:

- `META_WHATSAPP_ACCESS_TOKEN` — token de acesso da integração; nunca versionar no GitHub
- `META_WHATSAPP_PHONE_NUMBER_ID` — ID do número remetente no WhatsApp Business Platform
- `META_WHATSAPP_ALERT_TEMPLATE_NAME` — nome do template aprovado para alertas
- `META_WHATSAPP_VERIFY_TEMPLATE_NAME` — nome do template aprovado para verificação do número
- `META_WHATSAPP_TEMPLATE_LANGUAGE` — padrão `pt_BR`
- `META_WHATSAPP_GRAPH_VERSION` — padrão de runtime `v26.0`, configurável para atualização futura
- `META_WHATSAPP_VERIFY_BUTTON_SUBTYPE` — padrão `url` para template de autenticação/copy-code; pode ser `none` se o template aprovado não possuir parâmetro de botão

Endpoint de envio usado pelo Radar:

`POST https://graph.facebook.com/{versão}/{phone-number-id}/messages`

A autenticação é enviada via Bearer token e o destinatário é normalizado para dígitos no padrão internacional.

### Template de alerta

Nome sugerido: `radar_alerta_licitacao`.

O template deve receber, nesta ordem:

1. Nome do alerta
2. Modalidade
3. Órgão
4. Localidade
5. Objeto
6. Encerramento
7. Link oficial PNCP/Radar

Texto sugerido para aprovação:

> 🔔 Nova oportunidade no Radar de Licitações Brasil
> Alerta: {{1}}
> Modalidade: {{2}}
> Órgão: {{3}}
> Local: {{4}}
> Objeto: {{5}}
> Encerramento: {{6}}
> Abrir oportunidade: {{7}}

Categoria: utilizar o enquadramento aprovado pela Meta para a finalidade transacional/Utility do alerta solicitado pelo usuário.

### Template de verificação

Nome sugerido: `radar_codigo_verificacao`.

Usar template de autenticação com OTP/código de seis dígitos e botão de copiar código, quando disponível na conta.

O código expira no Radar em 10 minutos. A confirmação bem-sucedida grava `whatsapp_verified_at` e `whatsapp_opt_in_at`.

## Compatibilidade Twilio

O código legado `notifications-v1.mjs` continua aceitando Twilio. As seguintes variáveis não foram removidas:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_WHATSAPP_CONTENT_SID`
- `TWILIO_WHATSAPP_VERIFY_CONTENT_SID`
- `TWILIO_WHATSAPP_FROM`

Quando a Meta Cloud API está configurada, o runtime de produção expõe o provedor `meta-cloud` ao frontend e encaminha as ações de WhatsApp para a camada Meta. E-mail e notificações internas não são alterados.

## Consentimento

O WhatsApp somente é habilitado depois da confirmação do número. A confirmação grava `whatsapp_opt_in_at`, servindo como registro técnico do consentimento dentro da plataforma.

O usuário pode manter o WhatsApp desabilitado no perfil ou desabilitá-lo em alertas individuais.

## Regiões

Cada alerta pode adicionar uma macrorregião de entrega:

- Todas
- Norte
- Nordeste
- Centro-Oeste
- Sudeste
- Sul

Esse filtro é combinado com os critérios já existentes do alerta (palavra-chave, UF, município, modalidade, órgão, CNPJ e faixa de valor).

## Status de entrega

- `sent` — enviado pelo provedor
- `queued` — aguardando tentativa
- `sending` — envio em andamento
- `waiting_provider` — credencial/template ainda não configurado no dispatcher base
- `meta_retry` — retentativa controlada pelo worker Meta
- `failed` — falhou após as tentativas
- `skipped` — contato desabilitado, sem confirmação ou sem consentimento

A fila mantém no máximo cinco tentativas por entrega e registra o identificador retornado pelo provedor (`wamid` na Cloud API) quando o envio é aceito.

## Segurança

- Tokens e IDs operacionais devem ficar apenas nas variáveis de ambiente do Render.
- Nenhum token da Meta deve ser salvo no GitHub ou enviado ao frontend.
- O frontend recebe somente o status do provedor (`configured`, `verification_configured`, `provider`, versão da API).
- Endpoints de escrita exigem sessão autenticada e origem autorizada.
- Verificação de telefone possui limitação de tentativas.

## Custos e aprovação

A ativação da API oficial do WhatsApp pode depender de conta comercial, número remetente, templates aprovados e regras de cobrança vigentes da Meta. Não habilitar cobrança, forma de pagamento ou contratação paga sem autorização expressa do responsável pelo Radar.

## Observação de infraestrutura

No plano gratuito do Render o Web Service pode entrar em suspensão. Para uso comercial com requisito de entrega contínua, avaliar infraestrutura sempre ativa ou Background Worker quando o volume justificar, sem alterar isso automaticamente sem aprovação.
