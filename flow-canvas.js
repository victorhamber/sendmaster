// Casca da página. O quadro em si é o React Flow.
function mountFlowStudio() {
  const root = document.querySelector('#sequence-steps');
  if (!root || typeof mountSendmasterFlow !== 'function') return;
  root.innerHTML = `<div class="flow-studio"><aside class="flow-palette"><h2>Mensagens</h2><button type="button" draggable="true" data-flow-kind="email">E-mail</button><button type="button" draggable="true" data-flow-kind="wait">Espera</button><h2>Lógica</h2><button type="button" draggable="true" data-flow-kind="condition">Condição</button><p>Arraste para o quadro. Ligue a saída no próximo bloco. Sim sai de cima. Não sai de baixo.</p><form id="sequence-enroll" class="flow-enroll"><label>Sequência<select name="sequenceId" id="sequence-picker" required></select></label><label>Contato<select name="contactId" id="sequence-contact" required></select></label><button type="submit" class="button primary">Inscrever</button></form><div id="sequence-list" class="flow-list"></div></aside><div class="flow-stage" id="flow-stage"></div></div>`;
  root.querySelectorAll('[data-flow-kind]').forEach(button => button.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', button.dataset.flowKind)));
  mountSendmasterFlow(root.querySelector('#flow-stage'), {
    getDraft: () => sequenceDraft,
    setDraft: draft => { sequenceDraft = draft; },
    getCampaigns: () => sequenceCampaigns,
  });
}
