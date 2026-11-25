# MAP — SendMaster-App · 2026-11-25 · 45 arquivos · 4696 linhas
> Gerado por ai-docs/tools/map_repo.py — NÃO editar. Use isto em vez de ler o código inteiro: ache o arquivo/símbolo aqui e abra só o trecho.
Stack: node
Entradas: npm scripts: dev, start, typecheck, test

## (raiz)/
- .dockerignore [16L] .sqlite-shm
- AGENTS.md [51L] SendMaster-App — guia para IA
- Dockerfile [14L]
- README.md [37L] SendMaster
- app.js [91L] — api(), cacheState(), startApp(), getWorkspaces(), activeWorkspace(), renderWorkspace(), showWorkspaceMenu(), createWorkspace(), overviewRate(), dashboard(), loadDashboard(), formsPage(), +30
- campaigns-ui.js [223L] Campanhas: rascunho e revisão na interface. O envio fica na fila do servidor. — campaignsMarkup(), renderCampaigns(), refreshCampaignDrafts(), renderCampaignPreview(), saveCampaign(), refreshCampaignReviewQueue(), addCurrentCampaignToReview(), handleReviewQueueClick(), resetCampaignEditor(), handleCampaignListClick(), refreshCampaignTemplates(), applyCampaignTemplate(), +2
- email-builder.js [74L] Monta o HTML do e-mail arrastando blocos. O rascunho guarda o resultado. — blockHtml(), emailPlain(), mountEmailBuilder(), drawEmailBlocks()
- index.html [41L]
- package-lock.json [567L]
- package.json [21L]
- providers-ui.js [8L] — integrationsPage(), renderMailerProviders(), renderMailerFields(), captureMailerDraft(), refreshMailerSettings(), initMailerSettings()
- reports-ui.js [51L] Relatório de campanha. Os números vêm das mensagens já enviadas. — reportRate(), renderReports(), loadReports(), downloadReport(), reportsView()
- sequences-ui.js [154L] Fluxo horizontal com um ramo sim/não. Inscrever só grava a fila. — newStepId(), renderSequences(), nodeById(), chain(), appendNode(), drawCards(), bindCards(), drawSequenceSteps(), flowLabel(), loadSequencePage(), saveSequenceForm(), enrollSequenceForm(), +1
- styles.css [25L]
- tsconfig.json [13L]

## .impeccable/
- config.json [18L]

## src/
- audience.ts [137L] Audience queries, workspace tags, contact assignments, and saved segments. — normalized(), recordEvent(), listTags(), listContactSources(), createTag(), deleteTag(), setContactTags(), listContacts(), confirmedAudience(), countEligibleContacts(), listEligibleContactIds(), listSegments(), +3
- campaign-delivery.ts [37L] Envio de um destinatário. Quem chama é o worker da fila, nunca o request HTTP. — escapeHtml(), sendCampaignToContact()
- campaign-queue.test.ts [153L] — clock(), workspace(), campaign(), contact(), messages()
- campaign-queue.ts [117L] Fila de campanha: o request só grava destinatários. O worker envia depois. — dueMessages(), mark(), enqueueCampaign(), enqueueCampaignContact(), enqueueCampaignReview(), frequencyDelay(), processCampaignBatch()
- campaigns.ts [96L] Campaign drafting. Sending is intentionally owned by a later delivery workflow. — withCount(), listCampaignDrafts(), getCampaignDraft(), saveCampaignDraft(), deleteCampaignDraft(), withCurrentCount(), listCampaignReviewEntries(), addCampaignReviewEntry(), deleteCampaignReviewEntry()
- dns-check.test.ts [22L]
- dns-check.ts [41L] Lê SPF, DMARC e DKIM já publicados. O valor continua vindo do provedor. — firstMatch(), judgeDns(), textRecords(), lookupDomainAuth()
- forms.ts [131L] Workspace form configuration and local signup capture. — withTags(), listSignupForms(), getSignupForm(), saveSignupForm(), deleteSignupForm(), submitSignupForm(), issueSignupConfirmation(), confirmSignupToken()
- mailer-settings.ts [79L] Per-workspace mail provider catalog and local connection settings. — readStoredSettings(), isMailProviderId(), getMailSettings(), readMailCredentials(), saveMailSettings()
- mailer.ts [135L] One-recipient email transport adapters ported from the original WordPress plugin — addr(), named(), requestFor(), responseMessageId(), sendWorkspaceEmail()
- outbound.test.ts [81L] — workspace()
- outbound.ts [83L] Entrega eventos gravados para um destino HTTPS, com nova tentativa fora do reque — acceptableUrl(), saveOutboundEndpoint(), listOutboundEndpoints(), deleteOutboundEndpoint(), enqueuePendingDeliveries(), processOutboundBatch()
- personalize.test.ts [20L]
- personalize.ts [18L] Troca {{nome}} e {{email}} no momento do envio. HTML recebe texto escapado. — escapeHtml(), personalize(), withPreheader()
- provider-callback.test.ts [120L] — workspace(), sentMessage(), statusOf(), mailgunBody()
- provider-callback.ts [142L] Callback de provedor: só entra com assinatura e só altera o contato da mensagem  — normalizeProviderMessageId(), same(), fresh(), header(), mailgunEvents(), resendEvents(), mailerSendEvents(), sparkpostEvents(), verifiedEvents(), acceptProviderCallback()
- public-access.test.ts [21L]
- public-access.ts [25L] Caminhos de quem se cadastra. O login administra o sistema e não abre estes ende — isSubscriberRequest(), allowPublicPost()
- secret-store.ts [46L] Protect provider credentials at rest with Windows DPAPI locally, or an env key o — powershell(), envKey(), isProtectedSecret(), protectSecret(), revealSecret()
- sequences.test.ts [121L] — workspace(), campaign(), contact(), messageStatus()
- sequences.ts [176L] Sequência linear. O avanço só grava a fila. Quem envia continua sendo o worker d — cleanSteps(), cleanFlow(), saveSequence(), listSequences(), enrollSequence(), linearToFlow(), asFlow(), conditionMet(), progress(), advanceSequences()
- server.ts [657L] API and static server bound to loopback for personal local use. — equalSecret(), sessionSignature(), hasSession(), sessionCookie(), loginPage(), clientAddress(), isLoginBlocked(), handleLogin(), sendJson(), readJson(), readText(), validDomain(), +4
- smtp-transport.ts [77L] Minimal SMTP transport for the existing generic SMTP configuration. — SmtpConnection, headerValue(), encodeHeader(), address(), base64Lines(), mimeMessage(), connect(), sendSmtpMessage()
- storage.ts [394L] Persistência local do SendMaster: workspaces, briefs reutilizáveis e domínios. — readState(), importLegacy(), createWorkspace(), setActiveWorkspace(), saveBrief(), saveDomains(), recordIntegrationEvent(), createContact(), importContacts(), updateContactStatus(), recordContactResubscription(), linkContactExternalId(), +1
- suppressions.ts [102L] Durable contact suppression, unsubscribe tokens, and normalized provider-event i — hashToken(), recordIntegrationEvent(), issueUnsubscribeToken(), createUnsubscribeUrl(), unsubscribeWithToken(), applyProviderMailEvent()
- templates.test.ts [32L]
- templates.ts [36L] Modelo reutilizável. A campanha guarda a própria cópia do texto. — listEmailTemplates(), saveEmailTemplate(), deleteEmailTemplate()
- tracking.test.ts [87L] — sentMessage()
- tracking.ts [106L] Abertura e clique ligados à mensagem enviada. O destino do clique fica no banco, — hashToken(), issueToken(), safeHttps(), ownPath(), trackMessage(), tokenRow(), recordOpen(), recordClick(), campaignReport(), workspaceOverview(), reportCsv()
