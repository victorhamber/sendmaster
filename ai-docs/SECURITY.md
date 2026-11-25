# Baseline de segurança — SendMaster-App
Atualizado: 2026-11-19. Baseline inicial, não auditoria completa.

## Escopo e evidência
- Node.js 24.19.0; TypeScript; `node:sqlite`; interface HTML/JS/CSS.
- Conferidos `src/server.ts`, `src/storage.ts`, `app.js`, `.gitignore`; `npm run typecheck` concluído.
- API escuta em `127.0.0.1`; caminhos de `data/` e `src/` são bloqueados no servidor estático; Host/Origin são validados.
- Não verificado: exposição por firewall/túnel local, backups, criptografia do volume, análise de dependências, comportamento do browser após reinício.

## Dados e confiança
- Banco local contém nomes, e-mails, telefones, origem e evidência de consentimento dos contatos, briefs, domínios e credenciais de provedor; eventos de integração podem repetir dados de contato. Segredos são protegidos por DPAPI no Windows ou AES-256-GCM com chave de ambiente nos demais sistemas.
- SQLite não é criptografado pela aplicação. Proteção atual depende do usuário/conta do sistema operacional.
- API local não tem login. No modo público, o painel e a API de gestão exigem sessão HMAC. Formulário, cadastro, confirmação e descadastro não pedem sessão. Não há autorização por workspace: existe um administrador.
- Configurações de provedor são isoladas por workspace e a API não devolve os segredos já salvos. Segredos legados em texto claro migram para proteção quando acessados; backups antigos podem ainda conter o valor claro. Segredos DPAPI não são portáveis: ao mover a base para VPS, configure `SENDMASTER_SECRET_KEY` e reinsira as credenciais.
- A rota de formulário exige checkbox de consentimento e usa honeypot simples; não há rate limit nem proteção contra abuso para exposição pública. Telefone pode ser coletado opcional ou obrigatoriamente, mas a coleta do telefone não representa autorização para mensagens por WhatsApp/SMS; o texto precisa explicar esse uso quando aplicável. Double opt-in é opcional por formulário (ligado por padrão); opt-in simples confirma após consentimento. No modo double, o token de 256 bits é armazenado como SHA-256, expira em 24 horas, é invalidado após uso/reemissão e a confirmação exige POST explícito para não ser acionada por scanners de links. A entrega ao provedor ainda precisa de validação operacional.
- A página `/forms/:id` pode ser embutida. Ela, o POST do cadastro, `/forms/confirm` e `/unsubscribe` são públicos. POST anônimo aceita 20 vezes por IP em 10 minutos, na memória do processo. A CSP dessas páginas permite script e estilo inline e `frame-ancestors *`. O campo honeypot `website` continua no cadastro.
- GET `/mail/open` e GET `/mail/click` são públicos. O token aleatório fica só como SHA-256. O clique redireciona para a URL gravada na emissão, não para um parâmetro da query. Token inválido não redireciona. A contagem de abertura pode subir por proxy de imagem. `GET /api/workspaces/:id/reports` e a sequência ficam atrás da sessão. Inscrever só enfileira um contato confirmado.
- Descadastro usa token aleatório de 256 bits armazenado somente como SHA-256; GET apenas apresenta confirmação e POST aplica a supressão, incluindo o formato `List-Unsubscribe=One-Click`. Cada link pode ser usado repetidamente sem duplicar eventos. A emissão do token ainda precisa ser ligada ao envio de campanhas.
- O envio individual inclui o link de descadastro no corpo e os headers. `SENDMASTER_PUBLIC_URL` deve ser HTTPS e publicamente roteável. Confirmação e descadastro abrem sem a sessão do administrador.
- Bounce, reclamação e descadastro não podem ser removidos por uma atualização de status comum; reativação exige endpoint distinto com evidência de novo consentimento explícito.
- A revisão guarda campanha, segmento e contagem. O POST de fila cria um registro por contato e não envia no request. O worker envia lotes de 10 e grava o id devolvido pelo provedor.
- `POST /mail/callbacks/:workspaceId/:provider` é público e não usa a sessão. Só Mailgun (HMAC do timestamp e token, 15 minutos), Resend (Svix, 5 minutos), MailerSend (HMAC do corpo) e SparkPost (Basic Auth com usuário `sendmaster` ou token legado) passam. O segredo fica no workspace. Assinatura inválida responde 401 e não altera contato. O contato mudado é o da `provider_message_id`, não o e-mail cru do payload. Evento repetido não suprime de novo.
- `POST /api/workspaces/:id/mail-events` continua atrás do login e aceita evento normalizado. Não é o webhook dos provedores.
- JSON de entrada tem limite de 1 MB, domínios são validados e SQL usa parâmetros preparados.
- API de contatos valida formato de e-mail, deduplica por workspace, exige evidência ao marcar consentimento confirmado e registra eventos em transação. Tags são únicas por workspace normalizado; atribuições, origens e filtros de segmentos são sempre consultados com workspace_id e SQL parametrizado. CSV é limitado a 700 KB/1.000 linhas, não pode confirmar consentimento e é processado em transação. Estados pendente/descadastro/bounce/reclamação não são confirmados.
- Endpoint de eventos e IDs externos não tem autenticação própria; no modo local permanece em loopback, e no modo público fica atrás da sessão de login do host. Ainda não pode receber webhooks externos diretamente.
- Em produção, `SENDMASTER_PUBLIC_HOST` habilita escuta em `0.0.0.0` somente com host, usuário, senha (mínimo 8 caracteres) e `SENDMASTER_SECRET_KEY` válida. A tela `/login` valida credenciais em tempo constante e emite cookie de sessão HMAC com HttpOnly, Secure, SameSite Strict e validade de 7 dias; trocar a senha invalida sessões existentes. O login bloqueia o IP por 15 minutos após 8 tentativas inválidas. `Host` e `Origin` são permitidos por lista; `/healthz` é a única exceção sem autenticação e retorna somente estado `ok`. TLS depende do proxy HTTPS do Easypanel. A imagem não contém banco local e precisa de volume persistente em `/app/data`.
- Produção pessoal: domínio HTTPS do Easypanel e tela de login responderam; volume `/app/data` está configurado. Persistência após reinício ainda não foi verificada. O limite do formulário público zera quando o processo reinicia.
- `node:sqlite` é API integrada ao runtime, síncrona; considerar compatibilidade do Node ao atualizar ou implantar.

## Próximos passos
- Antes de VPS/MCP remoto: autorização por workspace, gestão de segredos, TLS, logs com dados minimizados, rate limits públicos e revisão de origem/Host. O login protege a ferramenta pessoal, mas não separa papéis por workspace.
- Antes de sincronizar WhatsApp/trackers: definir minimização/retensão de eventos, consentimento de compartilhamento e autenticação por sistema consumidor.
- Antes de ativar IA/envio: decidir quais dados serão transmitidos e obter consentimento operacional explícito por configuração.
