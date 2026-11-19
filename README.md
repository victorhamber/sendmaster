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

## Estado e segurança

Este projeto ainda está em desenvolvimento e foi pensado para uso local. A API não tem autenticação e deve permanecer vinculada ao loopback; não exponha a rede, uma VPS ou um túnel público sem implementar os controles descritos em [`ai-docs/SECURITY.md`](ai-docs/SECURITY.md).

Credenciais e dados de contatos são armazenados localmente. Não publique arquivos `.env`, bancos de dados ou chaves. Para contexto do projeto e próximos passos, consulte [`ai-docs/STATE.md`](ai-docs/STATE.md).
