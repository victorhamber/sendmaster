# Estado atual — SendMaster-App
Atualizado: 2026-11-25.
- Feito: a automação tem caminho sim e não. Entregabilidade consulta SPF, DKIM e DMARC no DNS. O e-mail pode ser montado por blocos.
- Próximo: publicar esta versão no Easypanel. O valor de SPF e DKIM continua saindo do provedor.
- Limite: bounce automático só no Mailgun, Resend, MailerSend e SparkPost. O limite do formulário público fica na memória. Não há construtor livre de fluxo.
