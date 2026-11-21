# SendMaster

Aplicativo local de marketing por e-mail para uso pessoal, construído com Node.js, TypeScript, HTML, CSS e SQLite.

## Requisitos

- Node.js 24 ou superior
- npm

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://127.0.0.1:4173` no navegador. O banco local é criado em `data/sendmaster.sqlite` e fica fora do Git.

## Easypanel

O `Dockerfile` usa Node.js 24 e expõe a porta `4173`. Configure no serviço:

- Domínio `email.trajettu.com` com HTTPS habilitado.
- Persistência montada em `/app/data`.
- `PORT=4173` e `SENDMASTER_PUBLIC_HOST=email.trajettu.com`.
- `SENDMASTER_AUTH_USERNAME` e `SENDMASTER_AUTH_PASSWORD` (senha com pelo menos 8 caracteres).
- `SENDMASTER_SECRET_KEY` com uma chave Base64 de 32 bytes, para proteger credenciais de provedores.

Sem domínio, senha e chave configurados, o app não inicia em modo público. O acesso usa formulário de login e cookie seguro com sessão de sete dias; `/healthz` responde para o health check. O servidor deve receber tráfego externo somente pelo proxy HTTPS do Easypanel.

## Estado e segurança

Este projeto ainda está em desenvolvimento. No modo local, a API não tem autenticação e fica vinculada ao loopback. No Easypanel, habilite o modo público somente com HTTPS, domínio e login configurados, conforme [`ai-docs/SECURITY.md`](ai-docs/SECURITY.md).

Credenciais e dados de contatos são armazenados localmente. Não publique arquivos `.env`, bancos de dados ou chaves. Para contexto do projeto e próximos passos, consulte [`ai-docs/STATE.md`](ai-docs/STATE.md).
