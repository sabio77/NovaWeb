(function () {
  'use strict';

  const FIREBASE_VERSION = '10.12.5';
  const DEFAULT_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDJo46f9sCpXTzfE1DTo1dW3-HCDUrs03Q',
    authDomain: 'xzonev1.firebaseapp.com',
    projectId: 'xzonev1',
    storageBucket: 'xzonev1.appspot.com',
    messagingSenderId: '795659138045',
    appId: '1:795659138045:web:a9bb48de306b58e8b11f94',
    measurementId: 'G-RB07J3B04K'
  };

  let firebaseApp = null;
  let firebaseAuth = null;
  let firebaseModules = null;
  let currentUser = null;
  let statusHandler = null;
  let authChangeHandler = null;
  let activeConfig = null;

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

  function hasValidFirebaseConfig(config) {
    return Boolean(config && typeof config === 'object' && config.apiKey && config.authDomain && config.projectId && config.appId);
  }

  function getFirebaseConfig() {
    const configured = window.NOVA_FIREBASE_CONFIG || activeConfig || DEFAULT_FIREBASE_CONFIG;
    return hasValidFirebaseConfig(configured) ? configured : null;
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
    authChangeHandler = options && options.onAuthChange;
    if (options && options.firebaseConfig && hasValidFirebaseConfig(options.firebaseConfig)) {
      activeConfig = options.firebaseConfig;
      window.NOVA_FIREBASE_CONFIG = options.firebaseConfig;
    }

    const config = getFirebaseConfig();
    if (!config) {
      emitStatus('Nova no encontró la configuración pública de Google.', { ready: false, production: isProduction() });
      if (typeof authChangeHandler === 'function') authChangeHandler(null);
      return { ready: false, production: isProduction(), reason: 'missing_firebase_config' };
    }

    try {
      const { appModule, authModule } = await loadFirebaseModules();
      firebaseApp = firebaseApp || appModule.initializeApp(config);
      firebaseAuth = firebaseAuth || authModule.getAuth(firebaseApp);
      authModule.onAuthStateChanged(firebaseAuth, async (user) => {
        currentUser = user || null;
        if (typeof authChangeHandler === 'function') await authChangeHandler(currentUser);
      });
      emitStatus('Google está listo para proteger tu sesión de Nova.', { ready: true, production: isProduction() });
      return { ready: true, production: isProduction() };
    } catch (error) {
      emitStatus('No fue posible inicializar el acceso con Google.', { ready: false, error: error.message });
      if (typeof authChangeHandler === 'function') authChangeHandler(null);
      return { ready: false, production: isProduction(), reason: 'firebase_init_failed' };
    }
  }

  async function ensureAuthReady() {
    if (!firebaseAuth || !firebaseModules) await init({ onStatus: statusHandler, onAuthChange: authChangeHandler });
    if (!firebaseAuth || !firebaseModules) throw new Error('El acceso con Google no está disponible en este momento.');
  }

  async function signInWithGoogle() {
    await ensureAuthReady();
    const provider = new firebaseModules.authModule.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const credential = await firebaseModules.authModule.signInWithPopup(firebaseAuth, provider);
      currentUser = credential.user;
      return currentUser;
    } catch (error) {
      if (/popup|blocked|closed|cancelled|operation-not-supported/i.test(error.code || error.message || '')) {
        await firebaseModules.authModule.signInWithRedirect(firebaseAuth, provider);
        return currentUser;
      }
      throw error;
    }
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
    signInWithGoogle,
    signOut: signOutSession,
    getIdToken,
    getCurrentUser,
    hasConfig: () => Boolean(getFirebaseConfig()),
    isProduction,
    environment: getWebEnvironment,
    getFirebaseConfig: () => ({ ...(getFirebaseConfig() || {}) })
  };
}());
