(function () {
  'use strict';

  const FIREBASE_VERSION = '10.12.5';
  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseModules = null;
  let currentUser = null;
  let statusHandler = null;

  function isLocalDevelopment() {
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  }

  function getWebEnvironment() {
    return String(window.NOVA_WEB_ENV || (isLocalDevelopment() ? 'development' : 'production')).toLowerCase();
  }

  function isProduction() {
    return getWebEnvironment() === 'production';
  }

  function getFirebaseConfig() {
    const config = window.NOVA_FIREBASE_CONFIG || null;
    if (!config || typeof config !== 'object') return null;
    if (!config.apiKey || !config.authDomain || !config.projectId) return null;
    return config;
  }

  function emitStatus(message, details) {
    if (typeof statusHandler === 'function') statusHandler(message, details || {});
  }

  async function loadFirebaseModules() {
    if (firebaseModules) return firebaseModules;
    const [appModule, authModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`)
    ]);
    firebaseModules = { appModule, authModule };
    return firebaseModules;
  }

  async function init(options) {
    statusHandler = options && options.onStatus;
    const onAuthChange = options && options.onAuthChange;
    const config = getFirebaseConfig();
    if (!config) {
      emitStatus(
        isProduction()
          ? 'Configura Firebase Web para iniciar sesión en producción.'
          : 'Firebase Web no está configurado. Puedes usar el acceso de desarrollo controlado.',
        { ready: false, production: isProduction() }
      );
      if (typeof onAuthChange === 'function') onAuthChange(null);
      return { ready: false, production: isProduction(), reason: 'missing_firebase_config' };
    }

    try {
      const { appModule, authModule } = await loadFirebaseModules();
      firebaseApp = firebaseApp || appModule.initializeApp(config);
      firebaseAuth = firebaseAuth || authModule.getAuth(firebaseApp);
      authModule.onAuthStateChanged(firebaseAuth, (user) => {
        currentUser = user || null;
        if (typeof onAuthChange === 'function') onAuthChange(currentUser);
      });
      emitStatus('Firebase listo para sesión segura.', { ready: true, production: isProduction() });
      return { ready: true, production: isProduction() };
    } catch (error) {
      emitStatus('No fue posible inicializar Firebase Web.', { ready: false, error: error.message });
      if (typeof onAuthChange === 'function') onAuthChange(null);
      return { ready: false, production: isProduction(), reason: 'firebase_init_failed' };
    }
  }

  async function signInWithEmail(email, password) {
    if (!firebaseAuth || !firebaseModules) {
      await init({ onStatus: statusHandler });
    }
    if (!firebaseAuth || !firebaseModules) throw new Error('Firebase Web no está configurado para iniciar sesión.');
    if (!email || !password) throw new Error('Escribe correo y contraseña para iniciar sesión.');
    const credential = await firebaseModules.authModule.signInWithEmailAndPassword(firebaseAuth, email, password);
    currentUser = credential.user;
    return currentUser;
  }

  async function signOutSession() {
    if (!firebaseAuth || !firebaseModules) return;
    await firebaseModules.authModule.signOut(firebaseAuth);
    currentUser = null;
  }

  async function getIdToken(forceRefresh) {
    if (!currentUser) return '';
    return currentUser.getIdToken(Boolean(forceRefresh));
  }

  function getCurrentUser() {
    return currentUser;
  }

  window.NovaFirebaseSession = {
    init,
    signInWithEmail,
    signOut: signOutSession,
    getIdToken,
    getCurrentUser,
    hasConfig: () => Boolean(getFirebaseConfig()),
    isProduction,
    environment: getWebEnvironment
  };
}());
