# MAP — SendMaster-App · 2026-11-19 · 24 arquivos · 2602 linhas
> Gerado por ai-docs/tools/map_repo.py — NÃO editar. Use isto em vez de ler o código inteiro: ache o arquivo/símbolo aqui e abra só o trecho.
Stack: node
Entradas: npm scripts: dev, start, typecheck

## (raiz)/
- .dockerignore [16L] .sqlite-shm
- AGENTS.md [51L] SendMaster-App — guia para IA
- Dockerfile [14L]
- README.md [36L] SendMaster
- app.js [88L] — api(), cacheState(), startApp(), getWorkspaces(), activeWorkspace(), renderWorkspace(), showWorkspaceMenu(), createWorkspace(), dashboard(), formsPage(), formTagCheckboxes(), renderFormPreview(), +26
- campaigns-ui.js [167L] Local campaign drafting UI. Delivery controls will be added only with suppressio — campaignsMarkup(), renderCampaigns(), refreshCampaignDrafts(), renderCampaignPreview(), saveCampaign(), refreshCampaignReviewQueue(), addCurrentCampaignToReview(), handleReviewQueueClick(), resetCampaignEditor(), handleCampaignListClick(), campaignsView()
- index.html [38L]
- package-lock.json [567L]
- package.json [20L]
- providers-ui.js [8L] — integrationsPage(), renderMailerProviders(), renderMailerFields(), captureMailerDraft(), refreshMailerSettings(), initMailerSettings()
- styles.css [18L]
- tsconfig.json [13L]

## .impeccable/
- config.json [18L]

## src/
- audience.ts [123L] Audience queries, workspace tags, contact assignments, and saved segments. — normalized(), recordEvent(), listTags(), listContactSources(), createTag(), deleteTag(), setContactTags(), listContacts(), countEligibleContacts(), listSegments(), createSegment(), deleteSegment(), +1
- campaign-delivery.ts [33L] One-recipient campaign delivery seam. Campaign UI remains draft-only until queue — escapeHtml(), sendCampaignToContact()
- campaigns.ts [96L] Campaign drafting. Sending is intentionally owned by a later delivery workflow. — withCount(), listCampaignDrafts(), getCampaignDraft(), saveCampaignDraft(), deleteCampaignDraft(), withCurrentCount(), listCampaignReviewEntries(), addCampaignReviewEntry(), deleteCampaignReviewEntry()
- forms.ts [125L] Workspace form configuration and local signup capture. — withTags(), listSignupForms(), getSignupForm(), saveSignupForm(), deleteSignupForm(), submitSignupForm(), issueSignupConfirmation(), confirmSignupToken()
- mailer-settings.ts [78L] Per-workspace mail provider catalog and local connection settings. — readStoredSettings(), isMailProviderId(), getMailSettings(), readMailCredentials(), saveMailSettings()
- mailer.ts [135L] One-recipient email transport adapters ported from the original WordPress plugin — addr(), named(), requestFor(), responseMessageId(), sendWorkspaceEmail()
- secret-store.ts [46L] Protect provider credentials at rest with Windows DPAPI locally, or an env key o — powershell(), envKey(), isProtectedSecret(), protectSecret(), revealSecret()
- server.ts [412L] API and static server bound to loopback for personal local use. — equalSecret(), isAuthorized(), sendUnauthorized(), sendJson(), readJson(), readText(), validDomain(), validEmail(), escapeHtml(), publicFormPage(), route()
- smtp-transport.ts [77L] Minimal SMTP transport for the existing generic SMTP configuration. — SmtpConnection, headerValue(), encodeHeader(), address(), base64Lines(), mimeMessage(), connect(), sendSmtpMessage()
- storage.ts [321L] Persistência local do SendMaster: workspaces, briefs reutilizáveis e domínios. — readState(), importLegacy(), createWorkspace(), setActiveWorkspace(), saveBrief(), saveDomains(), recordIntegrationEvent(), createContact(), importContacts(), updateContactStatus(), recordContactResubscription(), linkContactExternalId(), +1
- suppressions.ts [102L] Durable contact suppression, unsubscribe tokens, and normalized provider-event i — hashToken(), recordIntegrationEvent(), issueUnsubscribeToken(), createUnsubscribeUrl(), unsubscribeWithToken(), applyProviderMailEvent()
