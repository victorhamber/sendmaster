# Arquitetura — SendMaster-App
Atualizado: 2026-11-19

## Visão geral
Aplicativo de uso pessoal. O navegador carrega a interface existente; um servidor Node/TypeScript serve os assets e a API; SQLite persiste o estado localmente ou em volume de container. O plugin WordPress original permanece como referência e não é importado nem alterado.

## Componentes
| Módulo | Responsabilidade | Doc |
|---|---|---|
| `src/server.ts` | Servir UI e endpoints locais; validar origem e entrada | `modules/local-app.md` |
| `src/storage.ts` | Schema SQLite, migração inicial e operações de dados | `modules/local-app.md` |
| `src/audience.ts` | Tags, atribuições, consultas filtradas e segmentos salvos | `modules/local-app.md` |
| `src/campaigns.ts` | Rascunhos por workspace e contagem de contatos confirmados | `modules/local-app.md` |
| `src/suppressions.ts` | Tokens de descadastro e aplicação idempotente de eventos de e-mail | `modules/local-app.md` |
| `src/forms.ts` | Formulários por workspace e captura pendente de consentimento | `modules/local-app.md` |
| `src/mailer-settings.ts` | Catálogo e configurações de provedor por workspace | `modules/local-app.md` |
| `src/mailer.ts` | Adaptadores de API para envio por provedor | `modules/local-app.md` |
| `src/smtp-transport.ts` | Transporte SMTP com SSL, STARTTLS e autenticação | `modules/local-app.md` |
| `app.js` / `campaigns-ui.js` | UI, cache legado, chamadas à API e editor de rascunhos | `modules/local-app.md` |

## Fluxo
`index.html/app.js/campaigns-ui.js/providers-ui.js → API same-origin (loopback local ou host com login no container) → src/server.ts → src/forms.ts/src/campaigns.ts/src/suppressions.ts/src/mailer-settings.ts/src/mailer.ts/src/smtp-transport.ts/src/audience.ts/src/storage.ts → data/sendmaster.sqlite`
Mudanças de contato gravam evento na outbox SQLite na mesma transação. Consumidores futuros (webhook/MCP/sistemas pessoais) usarão a API/eventos e IDs externos; nenhum sistema deve abrir o arquivo SQLite.

## Dados e integrações
- Workspaces, briefs, domínios, contatos, tags, segmentos, formulários, configuração de e-mail, IDs externos e eventos de integração ficam no SQLite local ou volume de container. Uma importação única migra os dados já existentes do localStorage.
- No modo local, o servidor escuta somente `127.0.0.1`; no modo Easypanel, escuta em `0.0.0.0` apenas quando host, credenciais e chave de sessão estão configurados, mantendo validação de Host/Origin. Login gera sessão HMAC em cookie de sete dias. A interface e API usam a mesma origem.
- Adaptadores de envio são chamados pelo double opt-in. Rascunhos não disparam campanhas. Tokens de descadastro ficam armazenados como hash; evento normalizado de provedor é idempotente, mas ainda não há validação pública de assinatura por provedor. MCP e sincronização externa seguem fora desta etapa.
- O caminho interno `sendCampaignToContact` gera um token individual de descadastro e injeta o link no HTML/texto e os headers RFC 8058 no formato de cada API/SMTP. Ele requer `SENDMASTER_PUBLIC_URL` HTTPS, mas não há endpoint de campanha/fila; o app público está atrás de Basic Auth e não está pronto para envio a destinatários externos.
- A revisão salva o segmento selecionado e a contagem de destinatários confirmados no momento da entrada. A UI também mostra a elegibilidade atualizada; ela não é uma fila de envio nem agenda mensagens.

## Invariantes
- Briefs, domínios, tags e segmentos pertencem a um workspace.
- Formulários só aplicam tags do próprio workspace. Checkbox de consentimento é exigida nos dois modos; double opt-in é opcional e ligado por padrão para preservar dados antigos. Opt-in simples confirma no cadastro; double opt-in envia confirmação e deixa pendente até a ação explícita da pessoa.
- Cada workspace guarda um único provedor selecionado. Campanhas ficam em rascunho; nenhum envio real é iniciado nesta etapa.
- E-mails de contato são únicos por workspace; estados pendente/descadastrado/bounce/reclamação ficam inelegíveis para envio.
- O banco e o diretório `data/` nunca são servidos como assets estáticos.
- O plugin WordPress original permanece fora do escopo de edição.
