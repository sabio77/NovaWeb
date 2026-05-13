(function () {
  'use strict';

  function createMessageElement(role, content) {
    const item = document.createElement('div');
    item.className = `message ${role}`;
    item.textContent = String(content || '');
    return item;
  }

  function createChatInterface({ messagesElement }) {
    if (!messagesElement) throw new Error('NovaChatInterface requiere un contenedor de mensajes.');

    function addMessage(role, content) {
      const item = createMessageElement(role, content);
      messagesElement.appendChild(item);
      messagesElement.scrollTop = messagesElement.scrollHeight;
      return item;
    }

    function clearMessages() {
      messagesElement.innerHTML = '';
    }

    return { addMessage, clearMessages };
  }

  window.NovaChatInterface = { create: createChatInterface };
}());
