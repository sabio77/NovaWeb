(function () {
  'use strict';

  const VALID_MODES = new Set(['idle', 'listening', 'thinking', 'executing', 'speaking', 'error']);
  const DEFAULT_LABELS = {
    idle: 'Nova está lista para ayudarte.',
    listening: 'Nova está escuchando.',
    thinking: 'Nova está pensando.',
    executing: 'Nova está ejecutando una acción segura.',
    speaking: 'Nova está hablando.',
    error: 'Nova necesita tu atención.'
  };

  const instances = new Map();
  const listeners = new Map();
  let currentMode = 'idle';
  let activeUtterance = null;
  let activeSpeechId = 0;
  let speechActive = false;
  let cancelRequested = false;
  let modeBeforeSpeech = 'idle';
  let pendingModeAfterSpeech = '';
  let pendingMessageAfterSpeech = '';

  function normalizeMode(mode) {
    const normalized = String(mode || 'idle').toLowerCase();
    return VALID_MODES.has(normalized) ? normalized : 'idle';
  }

  function resolveElement(target) {
    if (typeof target === 'string') return document.querySelector(target);
    return target && target.nodeType === 1 ? target : null;
  }

  function emit(type, detail) {
    const payload = { type, mode: currentMode, speaking: speechActive, ...(detail || {}) };
    const callbacks = listeners.get(type) || [];
    callbacks.forEach((callback) => {
      try { callback(payload); } catch (_) {}
    });
    try {
      window.dispatchEvent(new CustomEvent(`nova-avatar:${type}`, { detail: payload }));
    } catch (_) {}
  }

  function on(type, callback) {
    if (!type || typeof callback !== 'function') return () => {};
    const key = String(type);
    const callbacks = listeners.get(key) || [];
    callbacks.push(callback);
    listeners.set(key, callbacks);
    return () => off(key, callback);
  }

  function off(type, callback) {
    const key = String(type || '');
    const callbacks = listeners.get(key) || [];
    listeners.set(key, callbacks.filter((item) => item !== callback));
  }

  function createAvatarElement(initialMode, label) {
    const root = document.createElement('div');
    const mode = normalizeMode(initialMode);
    root.className = 'nova-avatar nova-avatar--ported-from-pet';
    root.dataset.mode = mode;
    root.dataset.speaking = 'false';
    root.setAttribute('role', 'img');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', label || DEFAULT_LABELS[mode]);
    root.innerHTML = [
      '<div class="nova-avatar__orb" aria-hidden="true">',
      '  <div class="nova-avatar__face">',
      '    <span class="nova-avatar__eye nova-avatar__eye--left"></span>',
      '    <span class="nova-avatar__eye nova-avatar__eye--right"></span>',
      '    <span class="nova-avatar__mouth"></span>',
      '  </div>',
      '</div>',
      `<p class="nova-avatar__label">${label || DEFAULT_LABELS[mode]}</p>`
    ].join('');
    return root;
  }

  function mount(id, target, options) {
    const host = resolveElement(target);
    if (!host) return null;
    const key = String(id || target || `nova-avatar-${instances.size + 1}`);
    host.classList.add('nova-avatar-host');
    host.innerHTML = '';
    const mode = normalizeMode(options && options.mode);
    const avatar = createAvatarElement(mode, options && options.label);
    host.appendChild(avatar);
    const instance = { id: key, host, avatar };
    instances.set(key, instance);
    updateInstance(instance, currentMode || mode, options && options.label);
    return instance;
  }

  function updateInstance(instance, mode, message) {
    if (!instance || !instance.avatar) return;
    const normalized = normalizeMode(mode);
    const label = message || DEFAULT_LABELS[normalized];
    instance.avatar.dataset.mode = normalized;
    instance.avatar.dataset.speaking = normalized === 'speaking' && speechActive ? 'true' : 'false';
    instance.avatar.classList.toggle('nova-avatar--speaking', normalized === 'speaking' && speechActive);
    instance.avatar.setAttribute('aria-label', label);
    const labelElement = instance.avatar.querySelector('.nova-avatar__label');
    if (labelElement) labelElement.textContent = label;
  }

  function applyMode(mode, message) {
    const normalized = normalizeMode(mode);
    currentMode = normalized;
    instances.forEach((instance) => updateInstance(instance, normalized, message));
    emit('modechange', { mode: normalized, message: message || DEFAULT_LABELS[normalized] });
    return normalized;
  }

  function setMode(mode, message, options) {
    const normalized = normalizeMode(mode);
    const force = Boolean(options && options.force);
    if (speechActive && normalized !== 'speaking' && !force) {
      pendingModeAfterSpeech = normalized;
      pendingMessageAfterSpeech = message || DEFAULT_LABELS[normalized];
      return currentMode;
    }
    if (normalized !== 'speaking') {
      pendingModeAfterSpeech = '';
      pendingMessageAfterSpeech = '';
    }
    return applyMode(normalized, message);
  }

  function finishSpeaking(endMode, reason) {
    const finalMode = normalizeMode(pendingModeAfterSpeech || endMode || modeBeforeSpeech || 'idle');
    const finalMessage = pendingMessageAfterSpeech || DEFAULT_LABELS[finalMode];
    activeUtterance = null;
    activeSpeechId = 0;
    speechActive = false;
    cancelRequested = false;
    pendingModeAfterSpeech = '';
    pendingMessageAfterSpeech = '';
    applyMode(finalMode, finalMessage);
    emit(reason || 'speechend', { mode: finalMode });
  }

  function stopSpeaking(endMode) {
    const hadSpeech = Boolean(activeUtterance || speechActive);
    cancelRequested = hadSpeech;
    if (hadSpeech) activeSpeechId = 0;
    if (window.speechSynthesis && activeUtterance) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    if (hadSpeech) finishSpeaking(endMode || modeBeforeSpeech || 'idle', 'speechcancel');
    else setMode(endMode || 'idle', null, { force: true });
  }

  function beginSpeaking(options) {
    modeBeforeSpeech = normalizeMode((options && options.previousMode) || (currentMode === 'speaking' ? 'idle' : currentMode));
    speechActive = true;
    setMode('speaking', (options && options.message) || DEFAULT_LABELS.speaking, { force: true });
    emit('speechstart', { mode: 'speaking' });
  }

  function endSpeaking(endMode) {
    finishSpeaking(endMode || 'idle', 'speechend');
  }

  function failSpeaking() {
    finishSpeaking('error', 'speecherror');
  }

  function speak(text, options) {
    const content = String(text || '').trim();
    const endMode = normalizeMode(options && options.endMode ? options.endMode : 'idle');
    if (!content || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      setMode(endMode, null, { force: true });
      return false;
    }

    const previousMode = normalizeMode(options && options.previousMode ? options.previousMode : (currentMode === 'speaking' ? 'idle' : currentMode));
    if (activeUtterance || speechActive) stopSpeaking(previousMode);
    modeBeforeSpeech = previousMode;

    const utterance = new window.SpeechSynthesisUtterance(content);
    const speechId = Date.now() + Math.random();
    activeSpeechId = speechId;
    activeUtterance = utterance;
    cancelRequested = false;

    utterance.lang = (options && options.lang) || document.documentElement.lang || 'es-ES';
    utterance.rate = Number(options && options.rate) || 1;
    utterance.pitch = Number(options && options.pitch) || 1;
    utterance.onstart = () => {
      if (activeSpeechId !== speechId) return;
      beginSpeaking({ previousMode, message: DEFAULT_LABELS.speaking });
    };
    utterance.onend = () => {
      if (activeSpeechId !== speechId || cancelRequested) return;
      finishSpeaking(endMode, 'speechend');
    };
    utterance.oncancel = () => {
      if (activeSpeechId !== speechId) return;
      finishSpeaking(endMode, 'speechcancel');
    };
    utterance.onerror = () => {
      if (activeSpeechId !== speechId || cancelRequested) return;
      finishSpeaking('error', 'speecherror');
    };

    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (_) {
      finishSpeaking('error', 'speecherror');
      return false;
    }
  }

  function bindExternalSpeechEvents() {
    window.addEventListener('nova-voice:start', (event) => beginSpeaking((event && event.detail) || {}));
    window.addEventListener('nova-voice:end', (event) => endSpeaking(event && event.detail && event.detail.endMode));
    window.addEventListener('nova-voice:cancel', (event) => stopSpeaking(event && event.detail && event.detail.endMode));
    window.addEventListener('nova-voice:error', () => failSpeaking());
  }

  bindExternalSpeechEvents();

  window.NovaAvatar = {
    mount,
    setMode,
    speak,
    stopSpeaking,
    beginSpeaking,
    endSpeaking,
    failSpeaking,
    on,
    off,
    getMode: () => currentMode,
    isSpeaking: () => speechActive,
    modes: Array.from(VALID_MODES),
    labels: { ...DEFAULT_LABELS }
  };
}());
