# Estado atual — SendMaster-App
Atualizado: 2026-11-21
- Feito: rascunhos, seleção de segmento e fila de revisão com contagem confirmada registrada e atualizada; supressões e link/headers no caminho interno de entrega.
- Feito: modo de produção no Docker com bind externo condicionado a host público; formulário de login com sessão segura por sete dias, senha mínima de 8 caracteres e bloqueio temporário após falhas; SQLite persistido via volume.
- Próximo: atualizar serviço Easypanel e validar domínio HTTPS e login.
- Limite: webhooks não validados, campanhas não enviam e formulários públicos ainda não passaram por teste de abuso/rate limit.
