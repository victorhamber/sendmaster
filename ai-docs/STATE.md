# Estado atual — SendMaster-App
Atualizado: 2026-11-19
- Feito: rascunhos, seleção de segmento e fila de revisão com contagem confirmada registrada e atualizada; supressões e link/headers no caminho interno de entrega.
- Feito: modo de produção no Docker com bind externo condicionado a host público e Basic Auth; armazenamento SQLite persistido via volume.
- Próximo: conectar esta versão no Easypanel, configurar domínio HTTPS, segredos e volume persistente; validar runtime antes de liberar formulários ou envios.
- Limite: webhooks não validados, campanhas não enviam e formulários públicos ainda não passaram por teste de abuso/rate limit.
