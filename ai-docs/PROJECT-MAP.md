# Mapa visual — SendMaster-App
Atualizado: 2026-11-24

```mermaid
flowchart LR
  UI[index.html + app.js + campaigns-ui.js + providers-ui.js] --> API[src/server.ts]
  API --> Forms[src/forms.ts]
  API --> Campaigns[src/campaigns.ts]
  API --> Queue[src/campaign-queue.ts]
  Queue --> Delivery[src/campaign-delivery.ts]
  Delivery --> Mailer[src/mailer.ts + src/smtp-transport.ts]
  API --> Audience[src/audience.ts]
  API --> MailSettings[src/mailer-settings.ts]
  Forms --> Store[src/storage.ts]
  Campaigns --> Store
  Audience --> Store
  MailSettings --> Store
  Forms --> Mailer
  Store --> DB[(data/sendmaster.sqlite)]
  Store --> Events[integration_events]
  Events --> Outbox[src/outbound.ts]
```

Módulo: [local-app.md](modules/local-app.md). Alvo de produto: [email-marketing.md](modules/email-marketing.md). O POST de revisão grava `campaign_messages`. O processo Node chama a fila, a sequência e a outbox a cada 15 segundos. Relatório em `src/tracking.ts`. Sequência em `src/sequences.ts`.
