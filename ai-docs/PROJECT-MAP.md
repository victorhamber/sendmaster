# Mapa visual — SendMaster-App
Atualizado: 2026-11-13

```mermaid
flowchart LR
  UI[UI: index.html + app.js] --> API[Node TypeScript: src/server.ts]
  API --> Store[SQLite: src/storage.ts]
  Audience[Tags + segmentos: src/audience.ts] --> Store
  Forms[Formulários: src/forms.ts] --> Store
  Mail[Provedores: src/mailer-settings.ts] --> Store
  Store --> DB[(data/sendmaster.sqlite)]
  API --> UI
  Store --> Events[Outbox de eventos + IDs externos]
  Events -. futura integração por API .-> Apps[WhatsApp / tracking / MCP]
```

Módulo: [local-app.md](modules/local-app.md). O catálogo original e as configurações por workspace já existem, mas os adaptadores de envio/teste ainda não. Formulários capturam consentimento sem enviar confirmação. O servidor é local e loopback; esta arquitetura não representa uma implantação VPS.
