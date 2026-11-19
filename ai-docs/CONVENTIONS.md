# Convenções — SendMaster-App

## Onde guardar arquivo novo
- `src/`: servidor e persistência TypeScript local.
- Raiz: interface atual (`index.html`, `app.js`, `styles.css`) e configuração Node.
- `ai-docs/modules/`: contratos de módulo e fontes cobertas.
- `data/`: banco SQLite runtime; não versionar nem servir ao navegador.

## Padrões
- A API local responde JSON e usa parâmetros preparados no SQLite.
- Servidor de desenvolvimento fica preso a `127.0.0.1`; API mantém mesma origem.
- `app.js` usa localStorage como cache e ponte de migração; SQLite é a fonte persistente.
- Configuração de runtime por ambiente; não gravar segredos no código nem no banco sem projeto de proteção.
- Alterações de schema devem usar migração compatível e atualizar `src/storage.ts`.

## Comandos
- `npm run dev`: iniciar app local.
- `npm run typecheck`: validar TypeScript.
