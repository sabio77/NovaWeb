(function () {
  'use strict';

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/$/, '');
  }

  function parseSseBuffer(buffer, onEvent) {
    const chunks = buffer.split('\n\n');
    const remainder = chunks.pop() || '';
    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let type = 'project.updated';
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) type = line.slice(6).trim() || type;
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        const payload = JSON.parse(dataLines.join('\n'));
        onEvent({ type, payload, source: 'sse' });
      } catch (_) {
        onEvent({ type, payload: { message: dataLines.join('\n') }, source: 'sse' });
      }
    }
    return remainder;
  }

  function createProjectEventsClient() {
    let controller = null;
    let stopped = true;
    let pollTimer = null;

    function stop() {
      stopped = true;
      if (controller) controller.abort();
      controller = null;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    }

    async function connect(options) {
      stop();
      stopped = false;
      const backendUrl = normalizeBaseUrl(options.backendUrl);
      const projectKey = options.projectKey;
      const onEvent = typeof options.onEvent === 'function' ? options.onEvent : function () {};
      const onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
      const tokenProvider = typeof options.tokenProvider === 'function' ? options.tokenProvider : async () => '';
      const pollIntervalMs = Math.max(5000, Number(options.pollIntervalMs || 12000));

      async function pollFallback(reason) {
        if (stopped || !projectKey) return;
        onStatus(`Sincronizando por polling${reason ? `: ${reason}` : ''}`);
        try {
          const token = await tokenProvider();
          const response = await fetch(`${backendUrl}/api/v1/projects/${encodeURIComponent(projectKey)}/events`, {
            headers: {
              Accept: 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          });
          const data = await response.json().catch(() => null);
          if (response.ok && data) {
            const events = data.events || (data.data && data.data.events) || [];
            for (const event of events.slice().reverse()) onEvent({ type: event.type || 'project.updated', payload: event, source: 'polling' });
            onStatus('Eventos actualizados por polling.');
          } else {
            onStatus('No fue posible consultar eventos del proyecto.');
          }
        } catch (error) {
          onStatus(`Polling pendiente: ${error.message}`);
        } finally {
          if (!stopped) pollTimer = setTimeout(() => pollFallback('actualización programada'), pollIntervalMs);
        }
      }

      async function openSseStream() {
        if (!backendUrl || !projectKey) return pollFallback('proyecto no disponible');
        controller = new AbortController();
        try {
          const token = await tokenProvider();
          const response = await fetch(`${backendUrl}/api/v1/projects/${encodeURIComponent(projectKey)}/events`, {
            signal: controller.signal,
            headers: {
              Accept: 'text/event-stream',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          });
          if (!response.ok || !response.body) {
            await response.arrayBuffer().catch(() => null);
            return pollFallback(`SSE no disponible (${response.status})`);
          }
          onStatus('Eventos del proyecto conectados por SSE.');
          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';
          while (!stopped) {
            const result = await reader.read();
            if (result.done) break;
            buffer += decoder.decode(result.value, { stream: true });
            buffer = parseSseBuffer(buffer, onEvent);
          }
          if (!stopped) {
            await wait(pollIntervalMs);
            return openSseStream();
          }
        } catch (error) {
          if (!stopped) return pollFallback(error.name === 'AbortError' ? 'conexión reiniciada' : error.message);
        }
        return null;
      }

      return openSseStream();
    }

    return { connect, stop };
  }

  window.NovaProjectEvents = { create: createProjectEventsClient };
}());
