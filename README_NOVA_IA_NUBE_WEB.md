# FrontedWEB — WebApp/PWA multiproyecto de Nova IA Nube v3

> Guía productiva actualizada: ver `FrontedWEB/README_PRODUCCION_WEB.md`. Esta documentación se conserva como descripción funcional del avance multiproyecto Web.

`FrontedWEB` es la interfaz principal para usuario final. Permite iniciar sesión, listar proyectos, crear proyectos, abrir un workspace aislado por `projectKey`, conversar con Nova dentro del proyecto activo, revisar ejecuciones, órdenes PC, artefactos, costos y eventos, y solicitar acciones locales que siempre pasan por `backendRENDER`.

## Uso inicial

Puedes servir esta carpeta como estática o ejecutar:

```bash
npm install
npm start
npm run check
```

La WebApp usa por defecto `https://backendnova-2yx4.onrender.com`, consulta `/api/v1/public/bootstrap` para recibir configuración pública no sensible y usa Firebase Web Auth con Google. El backend sigue validando el ID token con Firebase Admin.

## Configuración Firebase Web

La configuración pública de Firebase Web queda resuelta automáticamente mediante `/api/v1/public/bootstrap` y tiene fallback local con los datos públicos del proyecto Firebase. `window.NOVA_FIREBASE_CONFIG` puede seguir existiendo como override controlado del hosting, pero no es requisito para que el usuario final inicie sesión.

Esta configuración no reemplaza Firebase Admin del backend. El backend debe seguir verificando el ID token recibido en `Authorization: Bearer <firebaseIdToken>`.

## Flujo multiproyecto implementado

- Dashboard con búsqueda, filtro por estado y ordenamiento local por actividad, prioridad, progreso, consumo, estado o nombre.
- Creación y apertura de proyectos mediante `/api/v1/projects`.
- Persistencia del proyecto activo en `localStorage` por `projectKey`.
- Workspace aislado por proyecto con conversación, ejecuciones, eventos, órdenes PC, artefactos y costos.
- Chat de proyecto enviando `projectKey` y `conversationKey` al backend.
- Acciones sensibles con confirmación: pausar, reanudar, cancelar y archivar.
- Órdenes PC enviadas solo cuando hay proyecto activo; cada orden incluye `projectKey`.
- Eventos de proyecto por streaming `fetch` con `Accept: text/event-stream` y fallback automático a polling.

## Responsabilidad

- Enviar texto o voz del navegador al backend.
- Mostrar respuestas, estado de Nova, avance, eventos y siguiente etapa.
- Mostrar estado del PC vinculado y de órdenes locales.
- Solicitar al backend la creación de órdenes como `SAVE_TEXT_FILE` dentro del proyecto activo.
- Mantener instalabilidad PWA mediante `manifest.json` y `service-worker.js`.
- Delegar toda decisión sensible al backend.

## Límites de seguridad

`FrontedWEB` no debe:

- Crear archivos físicos directamente.
- Contener claves OpenAI, Stripe, Firebase Admin ni secretos de agente PC.
- Calcular costos finales de usuario como fuente autoritativa.
- Ejecutar gobernanza local del objetivo principal.
- Saltarse `backendRENDER` para comunicarse con `frontedPC`.
- Aceptar `userKey`, permisos, saldo o ownership desde el navegador como fuente de verdad.

## Fallback de desarrollo

El campo de token manual queda disponible solo fuera de producción, determinado por `window.NOVA_WEB_ENV !== 'production'` o por ejecución local (`localhost`, `127.0.0.1`, `.local`). En producción se debe configurar Firebase Web y autenticar con sesión real.

## Contrato con backendRENDER

- `GET /health`: estado básico del backend.
- `POST /api/v1/chat`: conversación centralizada con Nova y `projectKey`.
- `GET /api/v1/projects`: dashboard multiproyecto.
- `POST /api/v1/projects`: creación de proyecto.
- `GET /api/v1/projects/:projectKey/status`: estado, límites, runs y eventos recientes.
- `GET /api/v1/projects/:projectKey/messages`: mensajes por proyecto.
- `GET /api/v1/projects/:projectKey/orders`: órdenes PC por proyecto.
- `GET /api/v1/projects/:projectKey/artifacts`: artefactos por proyecto.
- `GET /api/v1/projects/:projectKey/costs`: costos por proyecto.
- `GET /api/v1/projects/:projectKey/events`: SSE por `fetch` con Authorization y fallback polling.
- `GET /api/v1/governance/snapshot`: estado gobernado del objetivo principal.
- `POST /api/v1/governance/main-objective/execute`: ejecución gobernada del objetivo principal.
- `GET /api/v1/devices`: estado de PC vinculados.
- `POST /api/v1/orders`: solicitud de orden PC con `projectKey`.
- `GET /api/v1/orders/:orderKey/status`: seguimiento de orden.

## Estado de entrega

La iteración FrontedWEB multiproyecto cierra un avance verificable de ETAPA 2.5: sesión Firebase preparada, dashboard y workspace multiproyecto funcionales, chat por proyecto, métricas por proyecto, eventos SSE con fallback polling y documentación de uso productivo.
