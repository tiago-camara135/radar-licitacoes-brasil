# Radar de Licitações Brasil — Notificações Multicanal

## Arquitetura

O Radar registra a correspondência do alerta no banco e cria uma entrega por canal, com chave única por `alert_id + pncp_id + channel`, evitando duplicidades.

Fluxo:

1. Monitor PNCP grava uma nova contratação em `monitored_procurements`.
2. `notification-monitor-bridge.mjs` detecta apenas as novas linhas.
3. `notifications-v1.mjs` cruza a contratação com os alertas ativos do usuário.
4. A correspondência é registrada no Radar (`onsite`).
5. Se o contato estiver confirmado e o canal habilitado, são criadas entregas de e-mail e/ou WhatsApp.
6. O dispatcher tenta as entregas externas e registra `provider_id`, status, tentativas e erro.

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

## WhatsApp — Twilio / WhatsApp Business Platform

Variáveis de ambiente:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_WHATSAPP_CONTENT_SID`
- `TWILIO_WHATSAPP_VERIFY_CONTENT_SID`

`TWILIO_WHATSAPP_FROM` é aceito pelo código como compatibilidade, mas para templates de produção recomenda-se usar o Messaging Service configurado com o WhatsApp Sender.

### Template de alerta

O template associado a `TWILIO_WHATSAPP_CONTENT_SID` deve receber estas variáveis:

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

Categoria sugerida: Utility, conforme enquadramento e aprovação do provedor/WhatsApp.

### Template de verificação

O template associado a `TWILIO_WHATSAPP_VERIFY_CONTENT_SID` recebe:

1. Código de seis dígitos

Texto sugerido:

> Seu código de confirmação do Radar de Licitações Brasil é {{1}}. Ele expira em 10 minutos. Não compartilhe este código.

## Consentimento

O WhatsApp somente é habilitado depois da confirmação do número. A confirmação grava `whatsapp_opt_in_at`, servindo como registro técnico do consentimento dentro da plataforma.

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

- `sent` — registrado/enviado
- `queued` — aguardando tentativa
- `sending` — envio em andamento
- `waiting_provider` — credencial/template ainda não configurado
- `failed` — falhou após as tentativas
- `skipped` — contato desabilitado ou sem confirmação

O dispatcher executa a cada 15 segundos enquanto o serviço estiver ativo e usa retentativas com backoff.

## Observação de infraestrutura

No plano gratuito do Render o Web Service pode entrar em suspensão. Para lançamento comercial, o módulo de notificações deve ficar em infraestrutura que permaneça ativa ou ser movido para um Background Worker/serviço equivalente, para garantir entrega contínua mesmo sem usuários navegando no site.
