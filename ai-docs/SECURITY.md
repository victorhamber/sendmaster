# Baseline de segurança — SendMaster-App
Atualizado: 2026-11-18. Baseline inicial, não auditoria completa.

## Escopo e evidência
- Node.js 24.19.0; TypeScript; `node:sqlite`; interface HTML/JS/CSS.
- Conferidos `src/server.ts`, `src/storage.ts`, `app.js`, `.gitignore`; `npm run typecheck` concluído.
- API escuta em `127.0.0.1`; caminhos de `data/` e `src/` são bloqueados no servidor estático; Host/Origin são validados.
- Não verificado: exposição por firewall/túnel local, backups, criptografia do volume, análise de dependências, comportamento do browser após reinício.

## Dados e confiança
- Banco local contém nomes, e-mails, origem e evidência de consentimento dos contatos, briefs, domínios e credenciais de provedor; eventos de integração podem repetir dados de contato. Segredos são protegidos por DPAPI no Windows ou AES-256-GCM com chave de ambiente nos demais sistemas.
- SQLite não é criptografado pela aplicação. Proteção atual depende do usuário/conta do sistema operacional.
- API local não tem login nem autorização de usuário; não expor em interface de rede, VPS, túnel ou porta pública sem adicionar autenticação e controles.
- Configurações de provedor são isoladas por workspace e a API não devolve os segredos já salvos. Segredos legados em texto claro migram para proteção quando acessados; backups antigos podem ainda conter o valor claro. Segredos DPAPI não são portáveis: ao mover a base para VPS, configure `SENDMASTER_SECRET_KEY` e reinsira as credenciais.
- A rota de formulário exige checkbox de consentimento e usa honeypot simples; não há rate limit nem proteção contra abuso para exposição pública. Double opt-in é opcional por formulário (ligado por padrão); opt-in simples confirma após consentimento. No modo double, o token de 256 bits é armazenado como SHA-256, expira em 24 horas, é invalidado após uso/reemissão e a confirmação exige POST explícito para não ser acionada por scanners de links. A entrega ao provedor ainda precisa de validação operacional.
- A prévia `/forms/:id` serve para iframe same-origin, mas só é acessível no host local. Não publique fora do loopback até implementar HTTPS, rate limits, política de frame/CSP e proteção contra abuso.
- Descadastro usa token aleatório de 256 bits armazenado somente como SHA-256; GET apenas apresenta confirmação e POST aplica a supressão, incluindo o formato `List-Unsubscribe=One-Click`. Cada link pode ser usado repetidamente sem duplicar eventos. A emissão do token ainda precisa ser ligada ao envio de campanhas.
- O seam interno de envio individual inclui o link individual no corpo e os headers de descadastro. `SENDMASTER_PUBLIC_URL` deve ser HTTPS e publicamente roteável; a aplicação ainda escuta e aceita Host de loopback somente, então o seam não pode ser usado em envios reais antes da etapa de VPS/autenticação/roteamento.
- Bounce, reclamação e descadastro não podem ser removidos por uma atualização de status comum; reativação exige endpoint distinto com evidência de novo consentimento explícito.
- A fila de revisão registra apenas campanha, segmento/filtros e contagens; destinatários não são copiados para uma fila de envio, e nenhum e-mail é enviado por essa etapa.
- `POST /api/workspaces/:id/mail-events` aceita somente eventos normalizados de bounce/complaint no servidor local de loopback e deduplica por provedor + ID do evento. Não é um endpoint público de webhook: validar assinatura e adaptar payloads de cada provedor antes de exposição remota.
- JSON de entrada tem limite de 1 MB, domínios são validados e SQL usa parâmetros preparados.
- API de contatos valida formato de e-mail, deduplica por workspace, exige evidência ao marcar consentimento confirmado e registra eventos em transação. Tags são únicas por workspace normalizado; atribuições, origens e filtros de segmentos são sempre consultados com workspace_id e SQL parametrizado. CSV é limitado a 700 KB/1.000 linhas, não pode confirmar consentimento e é processado em transação. Estados pendente/descadastro/bounce/reclamação não são confirmados.
- Endpoint de eventos e IDs externos não é autenticado; está disponível apenas enquanto o servidor permanece em loopback. Não o exponha a rede/VPS.
- `node:sqlite` é API integrada ao runtime, síncrona; considerar compatibilidade do Node ao atualizar ou implantar.

## Próximos passos
- Antes de VPS/MCP remoto: autenticação, autorização por workspace, gestão de segredos, TLS, logs com dados minimizados, rate limits e revisão de origem/Host.
- Antes de sincronizar WhatsApp/trackers: definir minimização/retensão de eventos, consentimento de compartilhamento e autenticação por sistema consumidor.
- Antes de ativar IA/envio: decidir quais dados serão transmitidos e obter consentimento operacional explícito por configuração.
