'use strict';

function readJsonStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed === null ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}


const DEFAULT_NOVA_BACKEND_URL = 'https://backendnova-2yx4.onrender.com';
const DEFAULT_FIREBASE_WEB_CONFIG = {
  apiKey: 'AIzaSyDJo46f9sCpXTzfE1DTo1dW3-HCDUrs03Q',
  authDomain: 'xzonev1.firebaseapp.com',
  projectId: 'xzonev1',
  storageBucket: 'xzonev1.appspot.com',
  messagingSenderId: '795659138045',
  appId: '1:795659138045:web:a9bb48de306b58e8b11f94',
  measurementId: 'G-RB07J3B04K'
};

function isLocalNovaDevelopment() {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

function enforceProductionAutolinkDefaults() {
  if (isLocalNovaDevelopment()) return;
  localStorage.removeItem('nova.backendUrl');
  localStorage.removeItem('nova.authToken');
}

function initialBackendUrl() {
  if (isLocalNovaDevelopment()) return localStorage.getItem('nova.backendUrl') || DEFAULT_NOVA_BACKEND_URL;
  return DEFAULT_NOVA_BACKEND_URL;
}

function initialAuthToken() {
  return isLocalNovaDevelopment() ? (localStorage.getItem('nova.authToken') || '') : '';
}

function readTrackedOrders() {
  const parsed = readJsonStorage('nova.trackedOrders', []);
  return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : [];
}

enforceProductionAutolinkDefaults();

const state = {
  backendUrl: initialBackendUrl(),
  authToken: initialAuthToken(),
  firebaseReady: false,
  firebaseUser: null,
  devices: [],
  projects: [],
  activeProjectKey: localStorage.getItem('nova.activeProjectKey') || '',
  activeConversationKey: localStorage.getItem('nova.activeConversationKey') || '',
  trackedOrders: readTrackedOrders(),
  projectEventClient: null,
  projectEventKeys: new Set(),
  lastProjectStatus: null,
  bootstrap: null,
  publicUser: null
};

const API_TIMEOUT_MS = 15000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PRIORITY_WEIGHT = { urgent: 4, high: 3, normal: 2, low: 1 };

function createRequestId(prefix = 'web') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryRequest({ method, response, error, attempt, maxAttempts }) {
  if (attempt >= maxAttempts) return false;
  const safeMethod = String(method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(safeMethod)) return false;
  if (response && RETRYABLE_STATUS_CODES.has(response.status)) return true;
  return Boolean(error && (error.name === 'AbortError' || /network|fetch|timeout/i.test(error.message || '')));
}

const backendUrlInput = document.getElementById('backendUrl');
const authTokenInput = document.getElementById('authToken');
const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const devTokenPanel = document.getElementById('devTokenPanel');
const connectionStatus = document.getElementById('connectionStatus');
const sessionStatus = document.getElementById('sessionStatus');

const publicLanding = document.getElementById('publicLanding');
const appShell = document.getElementById('appShell');
const publicSignInGoogle = document.getElementById('publicSignInGoogle');
const publicCreateGoogle = document.getElementById('publicCreateGoogle');
const heroCreateGoogle = document.getElementById('heroCreateGoogle');
const heroSignInGoogle = document.getElementById('heroSignInGoogle');
const accountName = document.getElementById('accountName');
const accountEmail = document.getElementById('accountEmail');
const accountPhoto = document.getElementById('accountPhoto');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatContextTitle = document.getElementById('chatContextTitle');
const chatContextPill = document.getElementById('chatContextPill');
const governanceBox = document.getElementById('governanceBox');
const pcBox = document.getElementById('pcBox');
const deviceSelect = document.getElementById('deviceSelect');
const pcOrderForm = document.getElementById('pcOrderForm');
const runMainObjectiveButton = document.getElementById('runMainObjective');
const objectiveActionStatus = document.getElementById('objectiveActionStatus');
const pcFileName = document.getElementById('pcFileName');
const pcFileContent = document.getElementById('pcFileContent');
const orderStatusBox = document.getElementById('orderStatusBox');
const continuityBox = document.getElementById('continuityBox');
const finalValidationBox = document.getElementById('finalValidationBox');
const productionActivationBox = document.getElementById('productionActivationBox');
const projectListBox = document.getElementById('projectListBox');
const projectForm = document.getElementById('projectForm');
const projectName = document.getElementById('projectName');
const projectDescription = document.getElementById('projectDescription');
const projectSearch = document.getElementById('projectSearch');
const projectStatusFilter = document.getElementById('projectStatusFilter');
const projectSort = document.getElementById('projectSort');
const projectWorkspace = document.getElementById('projectWorkspace');
const currentProjectTitle = document.getElementById('currentProjectTitle');
const currentProjectMeta = document.getElementById('currentProjectMeta');
const quickProjectSelect = document.getElementById('quickProjectSelect');
const projectStateMetric = document.getElementById('projectStateMetric');
const projectRunsMetric = document.getElementById('projectRunsMetric');
const projectOrdersMetric = document.getElementById('projectOrdersMetric');
const projectCostMetric = document.getElementById('projectCostMetric');
const projectEventStatus = document.getElementById('projectEventStatus');
const projectMessagesBox = document.getElementById('projectMessagesBox');
const projectRunsBox = document.getElementById('projectRunsBox');
const projectEventsBox = document.getElementById('projectEventsBox');
const projectOrdersBox = document.getElementById('projectOrdersBox');
const projectArtifactsBox = document.getElementById('projectArtifactsBox');
const projectCostsBox = document.getElementById('projectCostsBox');
const runProjectButton = document.getElementById('runProjectButton');
const backToProjectsButton = document.getElementById('backToProjects');
const chatInterface = window.NovaChatInterface
  ? window.NovaChatInterface.create({ messagesElement: messages })
  : null;

const novaHeroAvatar = window.NovaAvatar ? window.NovaAvatar.mount('webHero', '#webHeroAvatar', { mode: 'idle' }) : null;
const novaDashboardAvatar = window.NovaAvatar ? window.NovaAvatar.mount('webDashboard', '#webDashboardAvatar', { mode: 'idle' }) : null;

function setNovaAvatarMode(mode, message) {
  if (window.NovaAvatar) window.NovaAvatar.setMode(mode, message);
}

function speakNovaIfPossible(text, endMode = 'idle') {
  if (!window.NovaAvatar) return false;
  const previousMode = typeof window.NovaAvatar.getMode === 'function' ? window.NovaAvatar.getMode() : 'idle';
  return window.NovaAvatar.speak(text, { endMode, previousMode });
}


function cleanBackendUrl() {
  return String(state.backendUrl || '').replace(/\/$/, '');
}

function getRuntimeWebEnvironment() {
  if (window.NovaFirebaseSession && typeof window.NovaFirebaseSession.environment === 'function') {
    return String(window.NovaFirebaseSession.environment() || '').toLowerCase();
  }
  return String(window.NOVA_WEB_ENV || (isLocalNovaDevelopment() ? 'development' : 'production')).toLowerCase();
}

function isDevelopmentFallbackAllowed() {
  const environment = getRuntimeWebEnvironment();
  return environment !== 'production' && isLocalNovaDevelopment();
}

function setText(element, text) {
  if (element) element.textContent = text;
}

function setConnectionStatus(text) {
  setText(connectionStatus, text);
}

function setSessionStatus(text) {
  setText(sessionStatus, text);
}

function renderAuthGate() {
  const user = state.firebaseUser || null;
  const isLoggedIn = Boolean(user);
  if (publicLanding) publicLanding.hidden = isLoggedIn;
  if (appShell) appShell.hidden = !isLoggedIn;
  document.querySelectorAll('.authenticated-area').forEach((element) => { element.hidden = !isLoggedIn; });
  if (accountName) accountName.textContent = user ? (user.displayName || 'Cuenta Nova') : 'Cuenta conectada';
  if (accountEmail) accountEmail.textContent = user ? (user.email || 'Sesión segura activa') : 'Sesión segura activa.';
  if (accountPhoto) {
    if (user && user.photoURL) {
      accountPhoto.src = user.photoURL;
      accountPhoto.hidden = false;
    } else {
      accountPhoto.hidden = true;
      accountPhoto.removeAttribute('src');
    }
  }
  setNovaAvatarMode(isLoggedIn ? 'idle' : 'idle');
}

async function loadPublicBootstrap() {
  const fallback = { backendUrl: DEFAULT_NOVA_BACKEND_URL, firebaseClientConfig: DEFAULT_FIREBASE_WEB_CONFIG, productName: 'Nova IA Nube' };
  try {
    const response = await fetch(`${DEFAULT_NOVA_BACKEND_URL}/api/v1/public/bootstrap`, { headers: { 'X-Request-Id': createRequestId('web-bootstrap') } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok === false) throw new Error('Bootstrap no disponible.');
    const data = payload.data || {};
    state.bootstrap = data;
    state.backendUrl = data.backendUrl || DEFAULT_NOVA_BACKEND_URL;
    window.NOVA_FIREBASE_CONFIG = data.firebaseClientConfig || DEFAULT_FIREBASE_WEB_CONFIG;
    if (backendUrlInput) backendUrlInput.value = state.backendUrl;
    return data;
  } catch (_) {
    state.bootstrap = fallback;
    state.backendUrl = fallback.backendUrl;
    window.NOVA_FIREBASE_CONFIG = fallback.firebaseClientConfig;
    if (backendUrlInput) backendUrlInput.value = state.backendUrl;
    return fallback;
  }
}

async function loadSessionProfile() {
  try {
    const data = await apiFetch('/api/v1/auth/me', { maxAttempts: 1, timeoutMs: 9000 });
    state.publicUser = data.user || null;
    if (state.publicUser && accountName) accountName.textContent = state.publicUser.displayName || accountName.textContent;
    if (state.publicUser && accountEmail) accountEmail.textContent = state.publicUser.email || accountEmail.textContent;
  } catch (_) {
    state.publicUser = null;
  }
}

function hasApiSession() {
  return Boolean(state.firebaseUser || state.authToken || isDevelopmentFallbackAllowed());
}

async function syncAuthToken(forceRefresh = false) {
  if (window.NovaFirebaseSession && window.NovaFirebaseSession.getCurrentUser()) {
    const token = await window.NovaFirebaseSession.getIdToken(forceRefresh);
    state.authToken = token || '';
    return state.authToken;
  }
  return state.authToken || '';
}

async function authHeaders(forceRefresh = false) {
  const token = await syncAuthToken(forceRefresh);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function apiFetch(pathname, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const maxAttempts = Math.max(1, Number(options.maxAttempts || (['GET', 'HEAD'].includes(method) ? 2 : 1)));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestId = createRequestId('web-api');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || API_TIMEOUT_MS));
    let response = null;
    try {
      response = await fetch(`${cleanBackendUrl()}${pathname}`, {
        ...options,
        method,
        signal: controller.signal,
        headers: { ...(await authHeaders(attempt > 1)), 'X-Request-Id': requestId, ...(options.headers || {}) }
      });
      if (shouldRetryRequest({ method, response, attempt, maxAttempts })) {
        await response.arrayBuffer().catch(() => null);
        await wait(300 * attempt);
        continue;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok || (data && data.ok === false)) {
        const message = data && data.error && data.error.message ? data.error.message : 'Nova no pudo completar la solicitud.';
        const backendRequestId = data && data.requestId ? ` Request ID: ${data.requestId}.` : '';
        throw new Error(`${message}${backendRequestId}`);
      }
      if (data && data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
        return { ...data, ...data.data };
      }
      return data || { ok: true, requestId };
    } catch (error) {
      lastError = error;
      if (!shouldRetryRequest({ method, error, attempt, maxAttempts })) throw error;
      await wait(300 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('Nova no pudo completar la solicitud.');
}

function addMessage(role, content) {
  if (chatInterface) {
    chatInterface.addMessage(role, content);
    return;
  }
  const item = document.createElement('div');
  item.className = `message ${role}`;
  item.textContent = content;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}

function getActiveProject() {
  return state.projects.find((project) => project.key === state.activeProjectKey) || null;
}

function persistActiveProject(projectKey = '') {
  state.activeProjectKey = projectKey || '';
  if (state.activeProjectKey) localStorage.setItem('nova.activeProjectKey', state.activeProjectKey);
  else localStorage.removeItem('nova.activeProjectKey');
  state.activeConversationKey = '';
  localStorage.removeItem('nova.activeConversationKey');
}

function projectStatusLabel(status) {
  const labels = {
    draft: 'Borrador',
    active: 'Activo',
    running: 'En ejecución',
    paused: 'Pausado',
    blocked: 'Requiere atención',
    completed: 'Completado',
    archived: 'Archivado',
    deleted: 'Eliminado',
    queued: 'En cola',
    planning: 'Planificando',
    waiting_user: 'Esperando usuario',
    waiting_pc: 'Esperando PC',
    waiting_external_service: 'Esperando servicio externo',
    retrying: 'Reintentando',
    failed: 'Fallido',
    canceled: 'Cancelado',
    expired: 'Expirado',
    claimed: 'Tomada por el PC',
    partial: 'Parcial'
  };
  return labels[status] || status || 'Sin estado';
}

function formatMoney(value) {
  return `USD ${Number(value || 0).toFixed(4)}`;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return 'Sin fecha';
  }
}

function getProjectCost(project) {
  return Number(project && project.summary ? project.summary.finalUserCostUSD || 0 : 0);
}

function getProjectActivityTimestamp(project) {
  const source = project.lastActivityAt || project.updatedAt || project.createdAt || 0;
  const timestamp = new Date(source).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortProjects(projects) {
  const mode = projectSort ? projectSort.value : 'recent';
  const sorted = [...projects];
  sorted.sort((a, b) => {
    if (mode === 'priority') return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0) || getProjectActivityTimestamp(b) - getProjectActivityTimestamp(a);
    if (mode === 'progress') return Number(b.progress || 0) - Number(a.progress || 0) || getProjectActivityTimestamp(b) - getProjectActivityTimestamp(a);
    if (mode === 'cost') return getProjectCost(b) - getProjectCost(a) || getProjectActivityTimestamp(b) - getProjectActivityTimestamp(a);
    if (mode === 'status') return String(a.status || '').localeCompare(String(b.status || '')) || getProjectActivityTimestamp(b) - getProjectActivityTimestamp(a);
    if (mode === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
    return getProjectActivityTimestamp(b) - getProjectActivityTimestamp(a);
  });
  return sorted;
}

function renderQuickProjectSelector() {
  if (!quickProjectSelect) return;
  quickProjectSelect.innerHTML = '';
  if (!state.projects.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sin proyectos disponibles';
    quickProjectSelect.appendChild(option);
    return;
  }
  for (const project of sortProjects(state.projects)) {
    const option = document.createElement('option');
    option.value = project.key;
    option.textContent = `${project.name || 'Proyecto sin nombre'} · ${projectStatusLabel(project.status)}`;
    option.selected = project.key === state.activeProjectKey;
    quickProjectSelect.appendChild(option);
  }
}

function updateChatContext(project) {
  if (!project) {
    setText(chatContextTitle, 'Selecciona un proyecto para conversar con Nova');
    setText(chatContextPill, 'Contexto sin proyecto');
    if (messageInput) messageInput.placeholder = 'Abre un proyecto y escribe una orden para Nova';
    return;
  }
  setText(chatContextTitle, `Chat de ${project.name || 'proyecto abierto'}`);
  setText(chatContextPill, `Project Key ${project.key}`);
  if (messageInput) messageInput.placeholder = 'Escribe una orden para Nova dentro de este proyecto';
}

function renderProjects(projects = []) {
  state.projects = Array.isArray(projects) ? projects : [];
  if (!projectListBox) return;
  projectListBox.innerHTML = '';
  renderQuickProjectSelector();

  if (!state.projects.length) {
    const empty = document.createElement('p');
    empty.className = 'helper-text';
    empty.textContent = hasApiSession()
      ? 'Crea tu primer proyecto para separar conversaciones, órdenes PC, costos y entregables.'
      : 'Inicia sesión para listar y crear proyectos.';
    projectListBox.appendChild(empty);
    renderProjectWorkspace(null);
    return;
  }

  for (const project of sortProjects(state.projects)) {
    const card = document.createElement('article');
    card.className = `project-card ${project.key === state.activeProjectKey ? 'selected' : ''}`;

    const title = document.createElement('strong');
    title.textContent = project.name || 'Proyecto sin nombre';
    const detail = document.createElement('p');
    const summary = project.summary || {};
    detail.textContent = `${projectStatusLabel(project.status)} · Progreso ${project.progress || 0}% · Órdenes pendientes ${summary.pendingOrders || 0} · Consumo ${formatMoney(summary.finalUserCostUSD)}`;

    const meta = document.createElement('span');
    meta.className = 'project-card-meta';
    meta.textContent = `Última actividad: ${formatDate(project.lastActivityAt || project.updatedAt || project.createdAt)}`;

    const actions = document.createElement('div');
    actions.className = 'project-card-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.textContent = project.key === state.activeProjectKey ? 'Proyecto abierto' : 'Abrir proyecto';
    openButton.addEventListener('click', () => openProject(project.key));
    actions.appendChild(openButton);

    if (['active', 'running', 'blocked'].includes(project.status)) {
      const pauseButton = document.createElement('button');
      pauseButton.type = 'button';
      pauseButton.textContent = 'Pausar ejecución';
      pauseButton.addEventListener('click', () => transitionProject(project.key, 'pause'));
      actions.appendChild(pauseButton);
    }
    if (project.status === 'paused') {
      const resumeButton = document.createElement('button');
      resumeButton.type = 'button';
      resumeButton.textContent = 'Reanudar ejecución';
      resumeButton.addEventListener('click', () => transitionProject(project.key, 'resume'));
      actions.appendChild(resumeButton);
    }
    if (!['completed', 'archived'].includes(project.status)) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.textContent = 'Cancelar';
      cancelButton.addEventListener('click', () => transitionProject(project.key, 'cancel'));
      actions.appendChild(cancelButton);
    }
    if (project.status !== 'archived') {
      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.textContent = 'Archivar';
      archiveButton.addEventListener('click', () => transitionProject(project.key, 'archive'));
      actions.appendChild(archiveButton);
    }

    card.appendChild(title);
    card.appendChild(detail);
    card.appendChild(meta);
    card.appendChild(actions);
    projectListBox.appendChild(card);
  }
  renderProjectWorkspace(getActiveProject(), state.lastProjectStatus);
}

function renderProjectMetrics(project, status = {}) {
  const summary = project && project.summary ? project.summary : {};
  const runs = Array.isArray(status.runs) ? status.runs : [];
  const activeRuns = runs.filter((run) => !['completed', 'failed', 'canceled', 'expired'].includes(run.status)).length;
  setText(projectStateMetric, projectStatusLabel(project && project.status));
  setText(projectRunsMetric, String(activeRuns || summary.activeRuns || 0));
  setText(projectOrdersMetric, String(summary.pendingOrders || 0));
  setText(projectCostMetric, formatMoney(summary.finalUserCostUSD));
}

function renderProjectWorkspace(project, status = null) {
  if (!projectWorkspace) return;
  if (!project) {
    projectWorkspace.hidden = true;
    setText(currentProjectTitle, 'Workspace de proyecto');
    setText(currentProjectMeta, 'Abre un proyecto para conversar con Nova en un contexto aislado.');
    updateChatContext(null);
    stopProjectEvents();
    return;
  }
  projectWorkspace.hidden = false;
  setText(currentProjectTitle, project.name || 'Proyecto abierto');
  setText(currentProjectMeta, `${projectStatusLabel(project.status)} · Project Key ${project.key} · Carpeta local aislada por proyecto.`);
  updateChatContext(project);
  renderProjectMetrics(project, status || {});
  if (status && Array.isArray(status.runs)) renderProjectRuns(status.runs);
  if (status && Array.isArray(status.events)) renderProjectEvents(status.events);
  renderQuickProjectSelector();
}

function renderProjectMessages(projectMessages = []) {
  if (!projectMessagesBox) return;
  projectMessagesBox.innerHTML = '';
  if (!projectMessages.length) {
    projectMessagesBox.textContent = 'Este proyecto todavía no tiene mensajes. Escribe en el chat para iniciar una conversación en este contexto.';
    return;
  }
  for (const message of projectMessages.slice(-16)) {
    const item = document.createElement('div');
    item.className = `project-message ${message.role || 'assistant'}`;
    item.textContent = message.content || '';
    projectMessagesBox.appendChild(item);
  }
}

function renderProjectRuns(runs = []) {
  if (!projectRunsBox) return;
  projectRunsBox.innerHTML = '';
  if (!runs.length) {
    projectRunsBox.textContent = 'No hay ejecuciones registradas para este proyecto.';
    return;
  }
  for (const run of runs.slice(0, 6)) {
    const item = document.createElement('p');
    item.textContent = `Run ${run.key}: ${projectStatusLabel(run.status)} · ${run.progress || 0}%`;
    projectRunsBox.appendChild(item);
  }
}

function renderProjectEvents(events = []) {
  if (!projectEventsBox) return;
  projectEventsBox.innerHTML = '';
  if (!events.length) {
    projectEventsBox.textContent = 'Aún no hay eventos recientes.';
    return;
  }
  for (const event of events.slice(0, 8)) {
    const item = document.createElement('p');
    item.className = `event-line ${event.severity || 'info'}`;
    item.textContent = `${formatDate(event.createdAt)} · ${event.type || 'project.updated'} · ${event.message || 'Evento registrado'}`;
    projectEventsBox.appendChild(item);
  }
}

function renderProjectOrders(orders = []) {
  if (!projectOrdersBox) return;
  projectOrdersBox.innerHTML = '';
  if (!orders.length) {
    projectOrdersBox.textContent = 'No hay órdenes locales para este proyecto.';
    return;
  }
  for (const order of orders.slice(0, 6)) {
    const item = document.createElement('p');
    item.textContent = `${order.key}: ${projectStatusLabel(order.status)} · ${order.actionType || 'acción local'} · ${order.destinationRelativePath || (order.payload && order.payload.destinationRelativePath) || 'destino controlado'}`;
    projectOrdersBox.appendChild(item);
  }
}

function renderProjectArtifacts(artifacts = []) {
  if (!projectArtifactsBox) return;
  projectArtifactsBox.innerHTML = '';
  if (!artifacts.length) {
    projectArtifactsBox.textContent = 'No hay artefactos generados todavía.';
    return;
  }
  for (const artifact of artifacts.slice(0, 6)) {
    const item = document.createElement('p');
    item.textContent = `${artifact.name || artifact.key}: ${projectStatusLabel(artifact.status)} · ${artifact.type || 'artefacto'} · ${Number(artifact.sizeBytes || 0)} bytes`;
    projectArtifactsBox.appendChild(item);
  }
}

function renderProjectCosts(costsPayload = {}) {
  if (!projectCostsBox) return;
  projectCostsBox.innerHTML = '';
  const items = Array.isArray(costsPayload.items) ? costsPayload.items : (Array.isArray(costsPayload) ? costsPayload : []);
  const total = Number(costsPayload.totalFinalUserCostUSD || items.reduce((sum, item) => sum + Number(item.finalUserCostUSD || 0), 0));
  const totalLine = document.createElement('strong');
  totalLine.textContent = `Consumo acumulado: ${formatMoney(total)}`;
  projectCostsBox.appendChild(totalLine);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No hay consumos registrados.';
    projectCostsBox.appendChild(empty);
    return;
  }
  for (const cost of items.slice(0, 6)) {
    const item = document.createElement('p');
    item.textContent = `${formatDate(cost.createdAt)} · ${cost.type || 'consumo'} · ${formatMoney(cost.finalUserCostUSD)}`;
    projectCostsBox.appendChild(item);
  }
}

function rememberProjectEvent(event) {
  const payload = event.payload || event;
  const key = payload.key || `${payload.type || event.type}-${payload.requestId || ''}-${payload.createdAt || Date.now()}`;
  if (state.projectEventKeys.has(key)) return;
  state.projectEventKeys.add(key);
  if (!projectEventsBox) return;
  if (projectEventsBox.textContent === 'Aún no hay eventos recientes.') projectEventsBox.innerHTML = '';
  const item = document.createElement('p');
  item.className = `event-line ${(payload.severity || 'info')}`;
  item.textContent = `${formatDate(payload.createdAt)} · ${payload.type || event.type || 'project.updated'} · ${payload.message || 'Evento sincronizado'}`;
  projectEventsBox.prepend(item);
  while (projectEventsBox.children.length > 10) projectEventsBox.removeChild(projectEventsBox.lastChild);
}

function stopProjectEvents() {
  if (state.projectEventClient) state.projectEventClient.stop();
  state.projectEventClient = null;
  state.projectEventKeys = new Set();
  setText(projectEventStatus, 'Eventos del proyecto listos para sincronizar.');
}

async function startProjectEvents(projectKey) {
  if (!projectKey || !window.NovaProjectEvents) return;
  stopProjectEvents();
  state.projectEventClient = window.NovaProjectEvents.create();
  state.projectEventClient.connect({
    backendUrl: cleanBackendUrl(),
    projectKey,
    tokenProvider: () => syncAuthToken(false),
    onEvent: (event) => {
      rememberProjectEvent(event);
      if (['project.updated', 'project.run.progress', 'project.run.completed', 'project.run.failed', 'cost.updated', 'message.created'].includes(event.type)) {
        refreshActiveProject({ silent: true, skipEventsReconnect: true }).catch(() => {});
      }
    },
    onStatus: (text) => setText(projectEventStatus, text),
    pollIntervalMs: 12000
  }).catch((error) => setText(projectEventStatus, `Eventos pendientes: ${error.message}`));
}

async function refreshProjects() {
  if (!hasApiSession()) {
    renderProjects([]);
    if (projectListBox) projectListBox.textContent = 'Inicia sesión para listar tus proyectos.';
    return;
  }
  const query = new URLSearchParams();
  if (projectSearch && projectSearch.value.trim()) query.set('search', projectSearch.value.trim());
  if (projectStatusFilter && projectStatusFilter.value) query.set('status', projectStatusFilter.value);
  const data = await apiFetch(`/api/v1/projects${query.toString() ? `?${query}` : ''}`);
  renderProjects(data.projects || []);
  if (state.activeProjectKey) await refreshActiveProject({ silent: true });
}

async function createProjectFromForm() {
  const name = projectName.value.trim();
  const description = projectDescription.value.trim();
  if (!name) throw new Error('Escribe un nombre para crear el proyecto.');
  const data = await apiFetch('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });
  projectName.value = '';
  projectDescription.value = '';
  persistActiveProject(data.project.key);
  await refreshProjects();
  await startProjectEvents(data.project.key);
}

async function openProject(projectKey) {
  persistActiveProject(projectKey);
  await refreshActiveProject();
  renderProjects(state.projects);
  await startProjectEvents(projectKey);
}

async function refreshActiveProject(options = {}) {
  if (!state.activeProjectKey || !hasApiSession()) return;
  const projectKey = encodeURIComponent(state.activeProjectKey);
  const [status, messagesData, ordersData, artifactsData, costsData] = await Promise.all([
    apiFetch(`/api/v1/projects/${projectKey}/status`),
    apiFetch(`/api/v1/projects/${projectKey}/messages`),
    apiFetch(`/api/v1/projects/${projectKey}/orders`).catch(() => ({ orders: [] })),
    apiFetch(`/api/v1/projects/${projectKey}/artifacts`).catch(() => ({ artifacts: [] })),
    apiFetch(`/api/v1/projects/${projectKey}/costs`).catch(() => ({ costs: { items: [], totalFinalUserCostUSD: 0 } }))
  ]);
  state.lastProjectStatus = status;
  renderProjectWorkspace(status.project || getActiveProject(), status);
  renderProjectMessages(messagesData.messages || []);
  renderProjectOrders(ordersData.orders || []);
  renderProjectArtifacts(artifactsData.artifacts || []);
  renderProjectCosts(costsData.costs || { items: [], totalFinalUserCostUSD: 0 });
  if (!options.skipEventsReconnect && state.projectEventClient === null) await startProjectEvents(state.activeProjectKey);
  if (!options.silent) setText(projectEventStatus, 'Workspace actualizado con datos del proyecto.');
}

async function transitionProject(projectKey, action) {
  const actionLabels = { pause: 'pausar', resume: 'reanudar', cancel: 'cancelar', archive: 'archivar' };
  if (!window.confirm(`¿Quieres ${actionLabels[action] || action} este proyecto? Esta acción afectará solo el proyecto seleccionado.`)) return;
  await apiFetch(`/api/v1/projects/${encodeURIComponent(projectKey)}/${action}`, { method: 'POST', body: '{}' });
  await refreshProjects();
}

async function executeActiveProject() {
  if (!state.activeProjectKey) throw new Error('Abre un proyecto antes de iniciar una ejecución.');
  const data = await apiFetch(`/api/v1/projects/${encodeURIComponent(state.activeProjectKey)}/execute`, { method: 'POST', body: '{}' });
  await refreshActiveProject();
  return data.run;
}

function appendGovernanceList(title, items) {
  if (!Array.isArray(items) || !items.length) return;
  const label = document.createElement('strong');
  label.textContent = title;
  governanceBox.appendChild(label);
  const list = document.createElement('ul');
  for (const item of items.slice(0, 4)) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  governanceBox.appendChild(list);
}

function renderGovernance(governance) {
  if (!governance) return;
  governanceBox.innerHTML = '';
  const lines = [
    `Etapa actual: ${governance.currentStageTitle}`,
    `Propósito: ${governance.currentStagePurpose || 'Continuar la transformación cloud-first de Nova.'}`,
    `Avance de etapa: ${governance.stageCompletionPercentage}%`,
    `Avance del objetivo: ${governance.objectiveDevelopmentPercentage || 0}%`,
    `Decisión recomendada: ${governance.recommendedDecision}`,
    `Siguiente etapa: ${governance.nextStageCandidate}`
  ];
  for (const line of lines) {
    const p = document.createElement('p');
    p.textContent = line;
    governanceBox.appendChild(p);
  }
  appendGovernanceList('Criterios cerrados', governance.completedAcceptanceCriteria);
  appendGovernanceList('Pendientes críticos', governance.pendingCriticalCriteria);
}

function renderContinuity(continuity) {
  if (!continuityBox || !continuity) return;
  const readiness = continuity.readiness || {};
  const config = readiness.config || {};
  const pcAgent = readiness.pcAgent || {};
  const blockers = Array.isArray(continuity.activeBlockers) ? continuity.activeBlockers : [];
  const plan = Array.isArray(readiness.externalValidationPlan) ? readiness.externalValidationPlan : [];

  continuityBox.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = readiness.readyForFinalAudit
    ? 'Preparación final lista para auditoría externa'
    : 'Preparación final pendiente de entorno real';
  const summary = document.createElement('p');
  summary.textContent = `Siguiente etapa: ${continuity.nextStageCandidate}. Configuración lista: ${config.readyForExternalEndToEnd ? 'sí' : 'no'} · PC en línea: ${pcAgent.hasOnlinePc ? 'sí' : 'no'}.`;
  continuityBox.appendChild(title);
  continuityBox.appendChild(summary);

  if (blockers.length) {
    const list = document.createElement('ul');
    for (const blocker of blockers.slice(0, 4)) {
      const li = document.createElement('li');
      li.textContent = blocker.description || blocker;
      list.appendChild(li);
    }
    continuityBox.appendChild(list);
  }

  if (plan.length) {
    const planTitle = document.createElement('strong');
    planTitle.textContent = 'Plan verificable';
    const planList = document.createElement('ul');
    for (const step of plan.slice(0, 4)) {
      const li = document.createElement('li');
      li.textContent = `${step.label} Estado: ${step.status}.`;
      planList.appendChild(li);
    }
    continuityBox.appendChild(planTitle);
    continuityBox.appendChild(planList);
  }
}

function renderFinalValidation(finalValidation) {
  if (!finalValidationBox || !finalValidation) return;
  const pendingCritical = Array.isArray(finalValidation.pendingCriticalCriteria) ? finalValidation.pendingCriticalCriteria : [];
  const pendingExternal = Array.isArray(finalValidation.externalActivationPending) ? finalValidation.externalActivationPending : [];
  const completed = Array.isArray(finalValidation.completedAcceptanceCriteria) ? finalValidation.completedAcceptanceCriteria : [];

  finalValidationBox.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = pendingCritical.length
    ? 'Validación final requiere corrección'
    : (finalValidation.objectiveCompleted ? 'Validación externa aprobada' : 'Validación final cerrada; falta entorno real');
  const summary = document.createElement('p');
  summary.textContent = `Etapa: ${finalValidation.currentStageTitle}. Avance del objetivo: ${finalValidation.objectiveDevelopmentPercentage || 0}%. Objetivo completado: ${finalValidation.objectiveCompleted ? 'sí' : 'no, falta evidencia externa real'}.`;
  finalValidationBox.appendChild(title);
  finalValidationBox.appendChild(summary);

  const status = document.createElement('p');
  status.textContent = `Decisión: ${finalValidation.recommendedDecision}. Siguiente paso: ${finalValidation.nextAction}.`;
  finalValidationBox.appendChild(status);

  const list = document.createElement('ul');
  const items = pendingCritical.length ? pendingCritical : (pendingExternal.length ? pendingExternal : completed.slice(0, 3));
  for (const item of items.slice(0, 4)) {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  }
  finalValidationBox.appendChild(list);
}

function renderProductionActivation(productionActivation) {
  if (!productionActivationBox || !productionActivation) return;
  const readiness = productionActivation.readiness || {};
  const credentials = readiness.credentials || {};
  const pcAgent = readiness.pcAgent || {};
  const evidenceGate = readiness.externalActivationGate || {};
  const requiredEvidence = Array.isArray(evidenceGate.requiredEvidence) ? evidenceGate.requiredEvidence : [];
  const pendingExternal = Array.isArray(productionActivation.externalActivationPending) ? productionActivation.externalActivationPending : [];

  productionActivationBox.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = productionActivation.productionActivationReady
    ? 'Activación externa lista para prueba real'
    : 'Activación externa pendiente de configuración real';
  productionActivationBox.appendChild(title);

  const summary = document.createElement('p');
  summary.textContent = `Credenciales listas: ${credentials.ready ? 'sí' : 'no'} · PC en línea: ${pcAgent.hasOnlinePc ? 'sí' : 'no'} · Avance: ${productionActivation.objectiveDevelopmentPercentage || 0}% · Objetivo completado: ${productionActivation.objectiveCompleted ? 'sí' : 'no'}.`;
  productionActivationBox.appendChild(summary);

  const decision = document.createElement('p');
  decision.textContent = `Decisión: ${productionActivation.recommendedDecision}.`;
  productionActivationBox.appendChild(decision);

  const nextStep = document.createElement('p');
  nextStep.textContent = `Siguiente paso seguro: ${productionActivation.nextAction}.`;
  productionActivationBox.appendChild(nextStep);

  if (requiredEvidence.length) {
    const evidenceTitle = document.createElement('strong');
    evidenceTitle.textContent = evidenceGate.readyForEvidenceCapture
      ? 'Evidencia externa lista para capturar'
      : 'Evidencia externa requerida para cerrar activación';
    productionActivationBox.appendChild(evidenceTitle);
    const evidenceList = document.createElement('ul');
    for (const evidence of requiredEvidence.slice(0, 4)) {
      const li = document.createElement('li');
      li.textContent = `${evidence.title}: ${evidence.guidance}`;
      evidenceList.appendChild(li);
    }
    productionActivationBox.appendChild(evidenceList);
  }

  if (pendingExternal.length) {
    const list = document.createElement('ul');
    for (const item of pendingExternal.slice(0, 4)) {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    }
    productionActivationBox.appendChild(list);
  }
}

async function refreshFinalValidation() {
  if (!hasApiSession()) {
    if (finalValidationBox) finalValidationBox.textContent = 'Inicia sesión para consultar la validación final del objetivo.';
    return;
  }
  const data = await apiFetch('/api/v1/final-validation/readiness');
  renderFinalValidation(data.finalValidation);
}

async function refreshProductionActivation() {
  if (!hasApiSession()) {
    if (productionActivationBox) productionActivationBox.textContent = 'Inicia sesión para consultar la activación externa real.';
    return;
  }
  const data = await apiFetch('/api/v1/production/readiness');
  renderProductionActivation(data.productionActivation);
}

async function refreshContinuity() {
  if (!hasApiSession()) {
    if (continuityBox) continuityBox.textContent = 'Inicia sesión para consultar la preparación final del entorno real.';
    return;
  }
  const data = await apiFetch('/api/v1/continuity/readiness');
  renderContinuity(data.continuity);
}

function renderDevices(devices) {
  state.devices = Array.isArray(devices) ? devices : [];
  pcBox.innerHTML = '';
  deviceSelect.innerHTML = '';

  if (!state.devices.length) {
    pcBox.textContent = 'Todavía no hay un PC vinculado. Abre el agente local, vincúlalo con tu sesión y luego actualiza este estado.';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Sin PC disponible';
    deviceSelect.appendChild(option);
    return;
  }

  for (const device of state.devices) {
    const item = document.createElement('div');
    item.className = `device-card ${device.isOnline ? 'online' : 'offline'}`;
    const lastSeen = device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString() : 'Sin heartbeat registrado';
    const title = document.createElement('strong');
    title.textContent = device.deviceName || 'PC vinculado';
    const detail = document.createElement('span');
    detail.textContent = `${device.isOnline ? 'En línea' : 'Sin conexión reciente'} · ${lastSeen}`;
    item.appendChild(title);
    item.appendChild(detail);
    pcBox.appendChild(item);

    const option = document.createElement('option');
    option.value = device.key;
    option.textContent = `${device.deviceName || 'PC vinculado'} · ${device.isOnline ? 'en línea' : 'sin conexión'}`;
    deviceSelect.appendChild(option);
  }
}

async function refreshDevices() {
  if (!hasApiSession()) {
    renderDevices([]);
    pcBox.textContent = 'Inicia sesión para consultar los PC vinculados a tu cuenta.';
    return;
  }
  const data = await apiFetch('/api/v1/devices');
  renderDevices(data.devices || []);
}

async function sendMessage(message) {
  return apiFetch('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ message, projectKey: state.activeProjectKey, conversationKey: state.activeConversationKey })
  });
}

async function executeMainObjective() {
  return apiFetch('/api/v1/governance/main-objective/execute', {
    method: 'POST',
    body: JSON.stringify({ message: 'Ejecuta el objetivo principal' })
  });
}

async function createPcTextOrder({ deviceKey, destinationRelativePath, content }) {
  if (!state.activeProjectKey) throw new Error('Abre un proyecto antes de enviar una orden al PC.');
  return apiFetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      deviceKey,
      projectKey: state.activeProjectKey,
      actionType: 'SAVE_TEXT_FILE',
      payload: {
        destinationRelativePath,
        content,
        versionPolicy: 'create_version_folder',
        overwritePolicy: 'never_overwrite'
      }
    })
  });
}

async function getOrderStatus(orderKey) {
  return apiFetch(`/api/v1/orders/${encodeURIComponent(orderKey)}/status`);
}

function persistTrackedOrders() {
  localStorage.setItem('nova.trackedOrders', JSON.stringify(state.trackedOrders.slice(0, 8)));
}

function rememberTrackedOrder(orderKey) {
  state.trackedOrders = [orderKey, ...state.trackedOrders.filter((item) => item !== orderKey)].slice(0, 8);
  persistTrackedOrders();
}

function renderPcOrderGuidance(pcOrder) {
  if (!orderStatusBox || !pcOrder) return;
  if (pcOrder.created && pcOrder.orderKey) {
    rememberTrackedOrder(pcOrder.orderKey);
    renderOrderStatus({
      order: {
        key: pcOrder.orderKey,
        actionType: pcOrder.actionType,
        status: pcOrder.status || 'pending',
        payloadSummary: pcOrder.payloadSummary || {}
      },
      result: null
    });
    refreshTrackedOrders().catch(() => {});
    return;
  }
  if (pcOrder.status && pcOrder.message) {
    orderStatusBox.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = 'Orden local pendiente de confirmación';
    const detail = document.createElement('p');
    detail.textContent = pcOrder.message;
    orderStatusBox.appendChild(title);
    orderStatusBox.appendChild(detail);
  }
}

function renderOrderStatus({ order, result } = {}) {
  if (!orderStatusBox || !order) return;
  const statusLabels = {
    pending: 'Pendiente de tomar por el PC',
    queued: 'En cola para el PC',
    claimed: 'Tomada por el agente PC',
    downloading: 'Descargando artefactos',
    validating: 'Validando seguridad local',
    executing: 'Ejecutando en carpeta controlada',
    reporting: 'Reportando resultado',
    completed: 'Completada correctamente',
    failed: 'Falló durante la ejecución',
    partial: 'Completada parcialmente',
    expired: 'Expirada sin ejecución',
    rejected: 'Rechazada por seguridad'
  };
  const statusText = statusLabels[order.status] || order.status || 'Sin estado';
  const resultLine = result
    ? `Resultado: ${result.status}${result.versionFolder ? ` · Carpeta de versión: ${result.versionFolder}` : ''}${result.error && result.error.message ? ` · Error: ${result.error.message}` : ''}`
    : 'Resultado: pendiente de reporte del agente local.';

  orderStatusBox.innerHTML = '';
  const title = document.createElement('strong');
  title.textContent = `Orden ${order.key}: ${statusText}`;
  const detail = document.createElement('p');
  detail.textContent = `Acción: ${order.actionType} · Proyecto: ${order.projectKey || state.activeProjectKey || 'proyecto activo'} · Destino: ${(order.payloadSummary && order.payloadSummary.destinationRelativePath) || order.destinationRelativePath || 'sin destino local'}`;
  const resultElement = document.createElement('p');
  resultElement.textContent = resultLine;
  orderStatusBox.appendChild(title);
  orderStatusBox.appendChild(detail);
  orderStatusBox.appendChild(resultElement);
}

async function refreshTrackedOrders() {
  if (!hasApiSession() || !state.trackedOrders.length) return;
  for (const orderKey of state.trackedOrders.slice(0, 3)) {
    try {
      const status = await getOrderStatus(orderKey);
      renderOrderStatus(status);
      if (status.order && ['completed', 'failed', 'partial', 'expired', 'rejected'].includes(status.order.status)) break;
    } catch (error) {
      if (orderStatusBox) orderStatusBox.textContent = error.message;
      break;
    }
  }
}

async function checkHealth() {
  try {
    const data = await apiFetch('/health', { maxAttempts: 2, timeoutMs: 8000 });
    setConnectionStatus(data.ok ? 'Backend conectado' : 'Backend sin respuesta');
  } catch (_) {
    setConnectionStatus('Sin conectar');
  }
}

async function refreshAuthenticatedPanels() {
  await checkHealth();
  try {
    await Promise.allSettled([
      refreshDevices(),
      refreshContinuity(),
      refreshFinalValidation(),
      refreshProductionActivation(),
      refreshProjects(),
      refreshTrackedOrders()
    ]);
  } catch (error) {
    addMessage('assistant', error.message);
  }
}

function updateDevelopmentTokenVisibility() {
  const allowed = isDevelopmentFallbackAllowed();
  if (devTokenPanel) devTokenPanel.hidden = !allowed;
  if (authTokenInput) authTokenInput.disabled = !allowed;
}

async function initializeFirebaseSession() {
  updateDevelopmentTokenVisibility();
  renderAuthGate();
  if (!window.NovaFirebaseSession) {
    setSessionStatus('Google no está disponible en este navegador.');
    return;
  }
  const result = await window.NovaFirebaseSession.init({
    firebaseConfig: (state.bootstrap && state.bootstrap.firebaseClientConfig) || DEFAULT_FIREBASE_WEB_CONFIG,
    onStatus: (message) => setSessionStatus(message),
    onAuthChange: async (user) => {
      state.firebaseUser = user || null;
      renderAuthGate();
      if (user) {
        state.authToken = await window.NovaFirebaseSession.getIdToken(false);
        localStorage.removeItem('nova.authToken');
        if (authTokenInput) authTokenInput.value = '';
        setSessionStatus(`Sesión activa: ${user.email || 'usuario verificado'}`);
        setNovaAvatarMode('idle', 'Nova está lista para trabajar en tus proyectos.');
        await loadSessionProfile();
        await refreshAuthenticatedPanels();
      } else {
        state.authToken = isDevelopmentFallbackAllowed() ? (localStorage.getItem('nova.authToken') || '') : '';
        setSessionStatus(state.authToken ? 'Sesión de desarrollo activa' : 'Inicia sesión con Google para continuar.');
        if (window.NovaAvatar) window.NovaAvatar.stopSpeaking('idle');
        renderProjects([]);
        renderDevices([]);
      }
    }
  });
  state.firebaseReady = Boolean(result && result.ready);
  updateDevelopmentTokenVisibility();
}

async function saveManualConnection() {
  state.backendUrl = backendUrlInput ? backendUrlInput.value.trim() : state.backendUrl;
  if (isDevelopmentFallbackAllowed()) localStorage.setItem('nova.backendUrl', state.backendUrl);
  if (isDevelopmentFallbackAllowed() && authTokenInput) {
    state.authToken = authTokenInput.value.trim();
    if (state.authToken) localStorage.setItem('nova.authToken', state.authToken);
    else localStorage.removeItem('nova.authToken');
  } else if (!window.NovaFirebaseSession || !window.NovaFirebaseSession.getCurrentUser()) {
    state.authToken = '';
    localStorage.removeItem('nova.authToken');
  }
  await refreshAuthenticatedPanels();
}

if (backendUrlInput) backendUrlInput.value = state.backendUrl;
if (authTokenInput) authTokenInput.value = state.authToken;
if (pcFileName) pcFileName.value = 'reports/respuesta.txt';

async function signInWithGoogleFromUi() {
  if (!window.NovaFirebaseSession || !window.NovaFirebaseSession.hasConfig()) {
    throw new Error('El acceso con Google no está disponible en este momento.');
  }
  setNovaAvatarMode('thinking', 'Nova está abriendo el acceso seguro con Google.');
  await window.NovaFirebaseSession.signInWithGoogle();
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginButton) loginButton.disabled = true;
    try {
      await signInWithGoogleFromUi();
    } catch (error) {
      setNovaAvatarMode('error', 'Nova necesita tu atención.');
      setSessionStatus(error.message);
      addMessage('assistant', error.message);
    } finally {
      if (loginButton) loginButton.disabled = false;
    }
  });
}

for (const button of [publicSignInGoogle, publicCreateGoogle, heroCreateGoogle, heroSignInGoogle]) {
  if (!button) continue;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await signInWithGoogleFromUi();
    } catch (error) {
      setNovaAvatarMode('error', 'Nova necesita tu atención.');
      setSessionStatus(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      if (window.NovaFirebaseSession) await window.NovaFirebaseSession.signOut();
      state.firebaseUser = null;
      state.authToken = '';
      localStorage.removeItem('nova.authToken');
      persistActiveProject('');
      stopProjectEvents();
      renderProjects([]);
      renderDevices([]);
      setSessionStatus('Sesión cerrada');
      if (window.NovaAvatar) window.NovaAvatar.stopSpeaking('idle');
      renderAuthGate();
      addMessage('assistant', 'Sesión cerrada. Tus proyectos volverán a mostrarse al iniciar sesión.');
    } catch (error) {
      addMessage('assistant', error.message);
    }
  });
}

document.getElementById('saveConnection').addEventListener('click', async () => {
  try {
    await saveManualConnection();
  } catch (error) {
    pcBox.textContent = error.message;
    if (continuityBox) continuityBox.textContent = error.message;
    if (finalValidationBox) finalValidationBox.textContent = error.message;
    if (productionActivationBox) productionActivationBox.textContent = error.message;
  }
});

if (projectForm) {
  projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await createProjectFromForm();
      addMessage('assistant', 'Proyecto creado y abierto. Nova separará conversaciones, costos y órdenes PC dentro de este contexto.');
    } catch (error) {
      addMessage('assistant', error.message);
    }
  });
}

let projectSearchTimer = null;
if (projectSearch) projectSearch.addEventListener('input', () => {
  clearTimeout(projectSearchTimer);
  projectSearchTimer = setTimeout(() => refreshProjects().catch(() => {}), 250);
});
if (projectStatusFilter) projectStatusFilter.addEventListener('change', () => refreshProjects().catch(() => {}));
if (projectSort) projectSort.addEventListener('change', () => renderProjects(state.projects));
if (quickProjectSelect) quickProjectSelect.addEventListener('change', () => {
  if (quickProjectSelect.value) openProject(quickProjectSelect.value).catch((error) => addMessage('assistant', error.message));
});
if (backToProjectsButton) backToProjectsButton.addEventListener('click', () => {
  persistActiveProject('');
  renderProjects(state.projects);
});
if (runProjectButton) runProjectButton.addEventListener('click', async () => {
  runProjectButton.disabled = true;
  try {
    const run = await executeActiveProject();
    addMessage('assistant', `Ejecución iniciada para el proyecto abierto. Run: ${run.key}.`);
  } catch (error) {
    addMessage('assistant', error.message);
  } finally {
    runProjectButton.disabled = false;
  }
});

runMainObjectiveButton.addEventListener('click', async () => {
  if (!hasApiSession()) {
    objectiveActionStatus.textContent = 'Inicia sesión para ejecutar el objetivo principal desde backendRENDER.';
    return;
  }
  runMainObjectiveButton.disabled = true;
  objectiveActionStatus.textContent = 'Nova está preparando la decisión gobernada desde backendRENDER.';
  try {
    const data = await executeMainObjective();
    renderGovernance(data.execution.governance);
    renderContinuity(data.execution.governance);
    renderFinalValidation(data.execution.governance);
    objectiveActionStatus.textContent = `Decisión aplicada: ${data.execution.decision}. Siguiente paso: ${data.execution.nextAction}.`;
    addMessage('assistant', data.execution.criterionToClose);
  } catch (error) {
    objectiveActionStatus.textContent = error.message;
    addMessage('assistant', error.message);
  } finally {
    runMainObjectiveButton.disabled = false;
  }
});

document.getElementById('refreshDevices').addEventListener('click', async () => {
  try {
    await refreshDevices();
    await refreshContinuity();
    await refreshFinalValidation();
    await refreshProductionActivation();
    addMessage('assistant', 'Estado del PC vinculado actualizado.');
  } catch (error) {
    addMessage('assistant', error.message);
  }
});

pcOrderForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const deviceKey = deviceSelect.value;
  const destinationRelativePath = pcFileName.value.trim();
  const content = pcFileContent.value.trim();
  if (!state.activeProjectKey) {
    addMessage('assistant', 'Abre un proyecto antes de enviar una orden al PC.');
    return;
  }
  if (!deviceKey) {
    addMessage('assistant', 'Selecciona un PC vinculado antes de enviar una orden.');
    return;
  }
  if (!destinationRelativePath || !content) {
    addMessage('assistant', 'Indica el nombre del archivo y el contenido que Nova guardará en la carpeta controlada.');
    return;
  }
  try {
    const data = await createPcTextOrder({ deviceKey, destinationRelativePath, content });
    rememberTrackedOrder(data.order.key);
    addMessage('assistant', `Orden segura enviada al PC para el proyecto activo. ID de orden: ${data.order.key}`);
    renderOrderStatus({ order: { ...data.order, payloadSummary: { destinationRelativePath } }, result: null });
    pcFileContent.value = '';
    refreshTrackedOrders().catch(() => {});
    refreshActiveProject({ silent: true }).catch(() => {});
  } catch (error) {
    addMessage('assistant', error.message);
  }
});

document.getElementById('chatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  if (!state.activeProjectKey) {
    addMessage('assistant', 'Abre o crea un proyecto para que Nova mantenga la conversación, costos y órdenes en un contexto aislado.');
    return;
  }
  messageInput.value = '';
  addMessage('user', message);
  setNovaAvatarMode('thinking');
  try {
    const data = await sendMessage(message);
    if (data.conversationKey) {
      state.activeConversationKey = data.conversationKey;
      localStorage.setItem('nova.activeConversationKey', data.conversationKey);
    }
    addMessage('assistant', data.message);
    speakNovaIfPossible(data.message, 'idle');
    renderGovernance(data.governance);
    renderContinuity(data.governance);
    renderFinalValidation(data.governance);
    renderPcOrderGuidance(data.pcOrder);
    refreshActiveProject({ silent: true }).catch(() => {});
  } catch (error) {
    setNovaAvatarMode('error', 'Nova necesita tu atención.');
    addMessage('assistant', error.message);
  }
});

document.getElementById('voiceButton').addEventListener('click', () => {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    addMessage('assistant', 'Tu navegador no tiene reconocimiento de voz disponible. Puedes escribir tu solicitud.');
    return;
  }
  const recognition = new Recognition();
  recognition.lang = 'es-ES';
  recognition.interimResults = false;
  let recognitionFailed = false;
  recognition.onstart = () => setNovaAvatarMode('listening');
  recognition.onend = () => { if (!recognitionFailed) setNovaAvatarMode('idle'); };
  recognition.onresult = (event) => { messageInput.value = event.results[0][0].transcript; };
  recognition.onerror = () => {
    recognitionFailed = true;
    setNovaAvatarMode('error', 'Nova no pudo escuchar con claridad.');
    addMessage('assistant', 'No pude escuchar con claridad. Intenta de nuevo o escribe tu solicitud.');
  };
  recognition.start();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

async function bootNovaWeb() {
  renderAuthGate();
  await loadPublicBootstrap();
  await initializeFirebaseSession();
  await checkHealth();
  if (state.firebaseUser || state.authToken) {
    refreshDevices().catch(() => {});
    refreshProjects().catch(() => {});
    refreshContinuity().catch(() => {});
    refreshFinalValidation().catch(() => {});
    refreshProductionActivation().catch(() => {});
    refreshTrackedOrders().catch(() => {});
  }
  setInterval(() => { if (state.firebaseUser || state.authToken) refreshTrackedOrders().catch(() => {}); }, 7000);
  addMessage('assistant', 'Hola, soy Nova IA Nube. Crea o abre un proyecto para trabajar con conversación, costos y órdenes PC completamente separados.');
}

bootNovaWeb().catch((error) => setSessionStatus(error.message));
