# Baseline de segurança — SendMaster-App
Atualizado: 2026-11-19. Baseline inicial, não auditoria completa.

## Escopo e evidência
- Node.js 24.19.0; TypeScript; `node:sqlite`; interface HTML/JS/CSS.
- Conferidos `src/server.ts`, `src/storage.ts`, `app.js`, `.gitignore`; `npm run typecheck` concluído.
- API escuta em `127.0.0.1`; caminhos de `data/` e `src/` são bloqueados no servidor estático; Host/Origin são validados.
- Não verificado: exposição por firewall/túnel local, backups, criptografia do volume, análise de dependências, comportamento do browser após reinício.

## Dados e confiança
- Banco local contém nomes, e-mails, origem e evidência de consentimento dos contatos, briefs, domínios e credenciais de provedor; eventos de integração podem repetir dados de contato. Segredos são protegidos por DPAPI no Windows ou AES-256-GCM com chave de ambiente nos demais sistemas.
- SQLite não é criptografado pela aplicação. Proteção atual depende do usuário/conta do sistema operacional.
- API local não tem login; no modo público todas as rotas do domínio configurado exigem Basic Auth, sem autorização por usuário ou workspace.
- Configurações de provedor são isoladas por workspace e a API não devolve os segredos já salvos. Segredos legados em texto claro migram para proteção quando acessados; backups antigos podem ainda conter o valor claro. Segredos DPAPI não são portáveis: ao mover a base para VPS, configure `SENDMASTER_SECRET_KEY` e reinsira as credenciais.
- A rota de formulário exige checkbox de consentimento e usa honeypot simples; não há rate limit nem proteção contra abuso para exposição pública. Double opt-in é opcional por formulário (ligado por padrão); opt-in simples confirma após consentimento. No modo double, o token de 256 bits é armazenado como SHA-256, expira em 24 horas, é invalidado após uso/reemissão e a confirmação exige POST explícito para não ser acionada por scanners de links. A entrega ao provedor ainda precisa de validação operacional.
- A prévia `/forms/:id` serve para iframe same-origin. No modo público requer Basic Auth como o restante do app; não remova a proteção para publicar formulários sem implementar rate limits, política de frame/CSP e proteção contra abuso.
- Descadastro usa token aleatório de 256 bits armazenado somente como SHA-256; GET apenas apresenta confirmação e POST aplica a supressão, incluindo o formato `List-Unsubscribe=One-Click`. Cada link pode ser usado repetidamente sem duplicar eventos. A emissão do token ainda precisa ser ligada ao envio de campanhas.
- O seam interno de envio individual inclui o link individual no corpo e os headers de descadastro. `SENDMASTER_PUBLIC_URL` deve ser HTTPS e publicamente roteável; como o host público exige Basic Auth, links de opt-in/descadastro não estão prontos para destinatários externos.
- Bounce, reclamação e descadastro não podem ser removidos por uma atualização de status comum; reativação exige endpoint distinto com evidência de novo consentimento explícito.
- A fila de revisão registra apenas campanha, segmento/filtros e contagens; destinatários não são copiados para uma fila de envio, e nenhum e-mail é enviado por essa etapa.
- `POST /api/workspaces/:id/mail-events` aceita somente eventos normalizados de bounce/complaint e deduplica por provedor + ID do evento. A rota pública fica atrás da Basic Auth e não pode receber webhooks externos diretamente; validar assinatura e adaptar payloads de cada provedor antes de expor uma rota dedicada.
- JSON de entrada tem limite de 1 MB, domínios são validados e SQL usa parâmetros preparados.
- API de contatos valida formato de e-mail, deduplica por workspace, exige evidência ao marcar consentimento confirmado e registra eventos em transação. Tags são únicas por workspace normalizado; atribuições, origens e filtros de segmentos são sempre consultados com workspace_id e SQL parametrizado. CSV é limitado a 700 KB/1.000 linhas, não pode confirmar consentimento e é processado em transação. Estados pendente/descadastro/bounce/reclamação não são confirmados.
- Endpoint de eventos e IDs externos não tem autenticação própria; no modo local permanece em loopback, e no modo público fica atrás da Basic Auth do host. Ainda não pode receber webhooks externos diretamente.
- Em produção, `SENDMASTER_PUBLIC_HOST` habilita escuta em `0.0.0.0` somente com host válido e Basic Auth configurada; usuário/senha são exigidos para todo o host público e senha mínima de 24 caracteres. `Host` e `Origin` são permitidos por lista; `/healthz` é a única exceção sem autenticação e retorna somente estado `ok`. TLS depende do proxy HTTPS do Easypanel. A imagem não contém banco local e precisa de volume persistente em `/app/data`.
- Não configurado/verificado: deploy Easypanel, HTTPS, secrets/volume e controles de abuso nos formulários ainda dependem da implantação.
- `node:sqlite` é API integrada ao runtime, síncrona; considerar compatibilidade do Node ao atualizar ou implantar.

## Próximos passos
- Antes de VPS/MCP remoto: autorização por workspace, gestão de segredos, TLS, logs com dados minimizados, rate limits e revisão de origem/Host. Basic Auth protege a ferramenta de uso pessoal, mas não separa papéis por workspace.
- Antes de sincronizar WhatsApp/trackers: definir minimização/retensão de eventos, consentimento de compartilhamento e autenticação por sistema consumidor.
- Antes de ativar IA/envio: decidir quais dados serão transmitidos e obter consentimento operacional explícito por configuração.
