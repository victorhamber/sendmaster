# Email marketing
Fontes: `src/campaigns.ts`, `src/campaign-delivery.ts`, `src/campaign-queue.ts`, `src/campaign-queue.test.ts`, `src/provider-callback.ts`, `src/provider-callback.test.ts`, `src/outbound.ts`, `src/outbound.test.ts`, `src/public-access.ts`, `src/public-access.test.ts`, `src/personalize.ts`, `src/personalize.test.ts`, `src/templates.ts`, `src/templates.test.ts`, `src/tracking.ts`, `src/tracking.test.ts`, `src/sequences.ts`, `src/sequences.test.ts`, `src/dns-check.ts`, `src/dns-check.test.ts`, `src/suppressions.ts`, `src/forms.ts`, `src/mailer.ts`
Propósito: contrato para o SendMaster virar email marketing completo, sem fork do Mautic.

## Escopo
- Entra: contatos, segmentos, formulário com consentimento, provedor, campanha em fila sem reenvio, agendamento, personalização, frequência, descadastro/bounce/reclamação ligados ao envio, modelos, abertura/clique/relatório, sequência com espera, condição e próximo e-mail.
- Fora: páginas, pop-up, pontuação, estágios, SMS, social, CRM, conteúdo dinâmico e o grafo de execução do Mautic. O zip `mautic-7.x.zip` é referência de comportamento; código GPL não entra no app.
- O quadro liga e-mail, espera e condição. Não executa o grafo livre do Mautic.

## Já no código
- Contatos, tags, segmentos, CSV pendente e double opt-in: `src/audience.ts`, `src/forms.ts`, `src/storage.ts`.
- Catálogo de provedor, SMTP e confirmação de opt-in: `src/mailer.ts`, `src/smtp-transport.ts`.
- Rascunho e revisão com contagem: `src/campaigns.ts`. A fila e o worker estão em `src/campaign-queue.ts`; `src/campaign-delivery.ts` envia um destinatário só quando o worker chama. `{{nome}}` e `{{email}}` são trocados nesse envio. Um horário futuro grava `next_attempt_at`. Modelos ficam em `src/templates.ts`.
- Bounce e reclamação: `src/suppressions.ts`. O callback assinado está em `src/provider-callback.ts` e grava o id do provedor na mensagem enviada.
- `integration_events` grava na mesma transação. `src/outbound.ts` entrega depois, com retry.

## Ordem
1. Feito: fila com estado por destinatário. Um registro por campanha e contato impede segundo envio.
2. Feito: worker em lote. Falha transitória reagenda até 5 vezes; endereço inválido vira bounce.
3. Feito no disparo: recusa quem não está confirmado. Frequência padrão de 5 envios em 7 dias. A confirmação de opt-in não entra na cota.
4. Feito: callback com assinatura, idempotente, apontando para o id da mensagem. Mailgun, Resend, MailerSend e SparkPost.
5. Feito: outbox com retry. Entrega para uma URL HTTPS configurada, não abre webhook público.
6. Feito: agendamento, personalização de nome e e-mail, e modelos reutilizáveis. O modelo não reescreve a campanha já salva.
7. Feito: abertura, clique e relatório. O token aponta para a mensagem. O clique não aceita URL solta.
8. Feito: quadro com e-mail, espera e ramo sim/não. O avanço só enfileira. O DNS publicado é lido em `src/dns-check.ts`.

## Invariantes
- Envio de campanha não acontece dentro do request HTTP. O clique em Enfileirar só grava a fila. Data futura espera; data vazia ou passada entra no próximo ciclo. A sequência também só enfileira. Mensagem presa em `sending` por mais de 2 minutos volta para a fila. O rodapé troca `{{descadastro}}` pelo link real.
- A revisão guarda contagem; não é fila nem trava de destinatário.
- Reativar suprimido continua exigindo evidência de novo consentimento.
- O login administra o app. Formulário, confirmação e descadastro são públicos, com limite de repetição e CSP. O painel e a API de gestão continuam na sessão.
- Testes: `npm test`. Tipos: `npm run typecheck`.
