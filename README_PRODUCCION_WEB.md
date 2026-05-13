# FrontedWEB — Guía de producción Nova IA Nube v3

`FrontedWEB` es la PWA para usuario final: login, dashboard de proyectos, workspace por `projectKey`, chat aislado, estado de ejecuciones, órdenes PC, artefactos y costos.

## Instalación local

```bash
cd FrontedWEB
npm install
npm run check
npm start
```

## Configuración de backend

La interfaz usa por defecto `https://backendnova-2yx4.onrender.com` y consulta `/api/v1/public/bootstrap` para recibir la configuración pública no sensible. En producción usa HTTPS y limita CORS en backend mediante `ALLOWED_ORIGIN`; el usuario final no debe escribir URL de backend ni token manual.

## Firebase Web

La configuración pública de Firebase Web llega desde bootstrap y conserva fallback local con los datos públicos suministrados. Si necesitas sobrescribirla en un entorno controlado de desarrollo, usa:

```html
<script>
  window.NOVA_WEB_ENV = 'production';
  window.NOVA_FIREBASE_CONFIG = {
    apiKey: 'TU_FIREBASE_WEB_API_KEY',
    authDomain: 'tu-proyecto.firebaseapp.com',
    projectId: 'tu-proyecto',
    appId: 'TU_FIREBASE_APP_ID'
  };
</script>
```

Esta configuración es pública del cliente. Las credenciales privadas de Firebase Admin van solo en `backendRENDER`.

## Flujo productivo

1. El usuario inicia sesión.
2. La PWA obtiene `firebaseIdToken`.
3. Cada request al backend usa `Authorization: Bearer <firebaseIdToken>`.
4. El usuario crea o abre un proyecto.
5. El chat y las acciones se envían con contexto de `projectKey`.
6. Los eventos se reciben por SSE o fallback polling.

## Textos visibles

Los textos de interfaz deben ser de producto final. No usar etiquetas de depuración como “debug”, “test interno” o “demo creador” como experiencia principal.

## Límites

La PWA no calcula costos finales autoritativos, no guarda secretos, no ejecuta acciones locales y no se comunica directamente con `frontedPC`. Todo pasa por `backendRENDER`.


## Parte 3 — Landing pública y Google-only

La primera vista de `FrontedWEB` ahora es una landing pública de Nova IA Nube con diseño claro, CTA “Iniciar sesión” y “Crear cuenta”. Ambas acciones usan Google Sign-In mediante Firebase Web Auth. La interfaz personal y el dashboard multiproyecto solo se muestran después de una sesión válida.

La web consulta `https://backendnova-2yx4.onrender.com/api/v1/public/bootstrap` para obtener la configuración pública. Si el bootstrap no responde, usa como respaldo seguro el backend público y la configuración pública Firebase Web suministrada. En producción no se solicita al usuario URL de backend ni token manual. El panel de diagnóstico local queda oculto fuera de desarrollo.

Se agregó `FrontedWEB/components/novaAvatar.js` para mostrar el avatar Nova en landing y dashboard. El modo `speaking` solo se activa mediante eventos reales de `speechSynthesis` y vuelve a `idle` cuando la voz termina, se cancela o falla.


## Iteración 2 — Criterio cerrado

La referencia `components/novaAvatar.js` ahora tiene módulo real en el entregable. El componente expone `NovaAvatar.mount`, `NovaAvatar.setMode`, `NovaAvatar.speak` y `NovaAvatar.stopSpeaking`; la boca solo entra en modo `speaking` con eventos reales de `speechSynthesis.onstart` y vuelve a `idle` cuando `onend`, cancelación o error detienen la voz.
