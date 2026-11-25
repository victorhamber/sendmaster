# Decisões — SendMaster-App
## 2026-11-25 — Sequência linear
- Decisão: lista de e-mail, espera e condição. O avanço só enfileira. Se a condição falha, para.
- Consequência: sem ramo paralelo. O worker envia.

## 2026-11-25 — Abertura e clique
- Decisão: pixel e link HTTPS usam token por mensagem. O destino do clique fica gravado. O relatório conta mensagens enviadas.
- Consequência: `/mail/open` e `/mail/click` são públicos. Relatório fica na sessão.

## 2026-11-25 — Agenda, tokens e modelos
- Decisão: enfileirar com data futura só atrasa `next_attempt_at`. `{{nome}}` e `{{email}}` entram no envio; no HTML o valor é escapado. O modelo é uma cópia.
- Consequência: mudar o modelo não altera campanha já salva. Agendamento acima de um ano é recusado. Reenfileirar quem já está na fila não muda o horário.

## 2026-11-24 — Login só da administração
- Decisão: a sessão protege o painel e a API de gestão. Formulário, envio do cadastro, confirmação e descadastro funcionam sem conta. A outbox entrega eventos para uma URL HTTPS do workspace, com HMAC e até 5 tentativas.
- Consequência: POST público aceita 20 vezes por IP em 10 minutos. A página do assinante pode ser embutida. Destino local ou HTTP é recusado. Só existe o administrador.

## 2026-11-24 — Callback assinado por mensagem
- Decisão: o webhook público só aceita Mailgun, Resend, MailerSend e SparkPost com o segredo do workspace. O efeito usa o id da mensagem enviado, não o e-mail do payload.
- Consequência: assinatura inválida responde 401 e não grava supressão. Provedor sem esquema de assinatura continua fora dessa rota. SparkPost usa Basic Auth com usuário `sendmaster`.

## 2026-11-24 — Fila de campanha fora do request
- Decisão: `POST .../campaign-review/:id/queue` só grava destinatários. Um worker no processo envia lotes de 10 a cada 15 segundos. O padrão é 5 e-mails de marketing por contato a cada 7 dias.
- Consequência: a confirmação de opt-in não entra nessa cota. Falha transitória reagenda até 5 tentativas; endereço inválido vira bounce.

## 2026-11-24 — Email marketing no SendMaster, sem fork
- Decisão: completar o email marketing no app Node/SQLite. O Mautic 7 serve só de referência de comportamento; o código GPL não entra.
- Consequência: entram fila, métricas e sequência linear. Ficam de fora páginas, pop-up, pontuação, estágios, SMS, social, CRM e grafo livre. Contrato em `modules/email-marketing.md`.

## 2026-11-21 — Campos e tema dos formulários
- Decisão: manter telefone desligado por padrão e permitir que seja opcional ou obrigatório; salvar cores de página, cartão, texto e botão por formulário.
- Consequência: migrações aditivas preservam formulários existentes; armazenar telefone não concede consentimento para WhatsApp/SMS.

## 2026-11-19 — Publicação pessoal atrás de autenticação
- Decisão: publicar o app em container Node 24 com SQLite em volume persistente; habilitar bind externo só com host permitido e login web.
- Consequência: domínio HTTPS termina no proxy Easypanel; sessão segura dura sete dias e senha mínima é 8 caracteres. Formulários públicos e campanhas ficam fora até revisão operacional.

## 2026-11-18 — Portar o transporte conforme o plugin
- Decisão: implementar um adaptador API por provedor e SMTP genérico; adiar testes de conexão/envio até os fluxos de campanhas e double opt-in estarem ligados.
- Consequência: payloads seguem as classes do plugin como referência; validação operacional fica para a fase final.

## 2026-11-18 — Proteger credenciais conforme o ambiente
- Decisão: DPAPI CurrentUser no Windows local; AES-256-GCM via `SENDMASTER_SECRET_KEY` em outros sistemas.
- Consequência: segredos DPAPI exigem reinserção ao migrar para VPS; segredos antigos migram quando acessados.

## 2026-11-18 — Catálogo de provedores por workspace
- Decisão: trazer os 13 adaptadores de API e SMTP genérico listados no plugin; cada workspace seleciona um provedor.
- Consequência: esta etapa persiste configurações locais, sem teste ou envio; segredos são protegidos pelo módulo local de credenciais.

## 2026-11-18 — Double opt-in configurável por formulário
- Decisão: manter checkbox de consentimento obrigatória; double opt-in opcional e ligado por padrão (inclusive para formulários existentes), opt-in simples confirma após o envio.
- Consequência: o modo double manda link de uso único por 24 horas e só confirma no clique. Falha no envio deixa o cadastro pendente.

## 2026-11-18 — Supressões antes de campanhas
- Decisão: separar tokens de descadastro e registrar bounce/complaint idempotentemente; links GET nunca alteram consentimento e eventos normalizados só podem ser ingeridos pelo servidor local.
- Consequência: adaptadores de webhook e validação de assinatura de cada provedor devem ser concluídos antes de expor a rota ou liberar envio real.

## 2026-11-18 — Tags e segmentos isolados por workspace
- Decisão: aplicar tags por contato e persistir segmentos como filtros de busca, status, origem e tag, sempre vinculados ao workspace.
- Consequência: segmentos são consultas dinâmicas reutilizáveis; não duplicam listas de destinatários.

## 2026-11-13 — Importação CSV sem promover consentimento
- Decisão: validar e-mails, deduplicar por workspace, limitar a 1.000 linhas/700 KB e criar tudo como pendente.
- Consequência: a importação nunca trata a presença no arquivo como prova de autorização de envio.

<!-- Uma entrada de ≤5 linhas por decisão não óbvia. Mais recente no topo. Evita rediscutir/reanalisar. -->

## 2026-11-13 — Documentação modular para IA
- Decisão: AGENTS.md + ai-docs/. Mudança relevante atualiza o módulo e o STATE.

## 2026-11-13 — Aplicação local com persistência
- Decisão: UI atual com API TypeScript e SQLite. O banco é a fonte persistente.
- Consequência: briefs, workspaces e domínios não dependem do navegador.

## 2026-11-13 — Contatos como ponto de integração
- Decisão: ID canônico por workspace, IDs externos e outbox append-only.
- Consequência: eventos podem ter PII. Sistema externo não abre o SQLite.


