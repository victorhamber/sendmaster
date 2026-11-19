# Decisões — SendMaster-App
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
- Consequência: o modo double envia link com token de uso único válido por 24 horas e só confirma após ação explícita. Se o envio falhar, o cadastro fica pendente e uma nova tentativa de inscrição pode emitir novo link.

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
- Contexto: reduzir tokens gastos relendo o código.
- Decisão: AGENTS.md + ai-docs/ (MAP gerado, STATE, modules/).
- Alternativas descartadas: (—)
- Consequência: toda mudança relevante atualiza o módulo e o STATE.

## 2026-11-13 — Aplicação local com persistência
- Contexto: protótipo front-end dependia do armazenamento de um navegador.
- Decisão: manter UI atual e servir API TypeScript com SQLite local; SQLite é fonte persistente.
- Consequência: briefs, workspaces e domínios sincronizam entre navegadores deste computador; app permanece apenas em loopback até a fase VPS.

## 2026-11-13 — Contatos como ponto de integração
- Decisão: manter ID canônico de contato por workspace, tabela de IDs externos e outbox append-only de eventos.
- Sistemas externos futuros consomem API/eventos; não recebem acesso direto ao SQLite.
- Consequência: eventos podem conter PII; entrega externa e autenticação ficam para etapa própria.


