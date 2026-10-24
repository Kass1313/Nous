/* Only the public static shell and Vite's fingerprinted assets enter these caches.
   Account records, API responses, shared links and media never enter this worker's cache. */
const SCOPE = new URL(self.registration.scope);
const CACHE_OWNER = `nous-public-${encodeURIComponent(SCOPE.pathname)}-`;
const CACHE_PREFIX = `${CACHE_OWNER}v1-`;
const SHELL_CACHE = `${CACHE_PREFIX}shell`;
const ASSET_CACHE = `${CACHE_PREFIX}assets`;
const SHELL_URL = new URL("index.html", SCOPE).href;
const ASSET_PATH = `${SCOPE.pathname}assets/`;

function staticAsset(url) {
  return (
    url.origin === SCOPE.origin &&
    url.pathname.startsWith(ASSET_PATH) &&
    !url.search &&
    /-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg|gif)$/i.test(
      url.pathname,
    )
  );
}

function cacheable(response) {
  return (
    response.ok &&
    response.status === 200 &&
    response.type === "basic" &&
    !/(?:private|no-store)/i.test(response.headers.get("cache-control") || "")
  );
}

function shellAssets(html) {
  const matches = html.matchAll(/(?:src|href)=["']([^"']+)["']/g);
  return [
    ...new Set(
      [...matches]
        .map((match) => new URL(match[1], SHELL_URL))
        .filter(staticAsset)
        .map((url) => url.href),
    ),
  ];
}

async function warmPublicShell() {
  // credentials: omit makes the shell independent from every signed-in account.
  const response = await fetch(SHELL_URL, {
    cache: "no-cache",
    credentials: "omit",
    redirect: "error",
  });
  if (
    !cacheable(response) ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    return;
  const html = await response.clone().text();
  // Never accept login/error pages or a development entry as an offline shell.
  const assets = shellAssets(html);
  const hasInlineApp = /<html\b[^>]*\bdata-repere-inline=["']true["'][^>]*>/i.test(html) &&
    /<script\b(?=[^>]*\bdata-repere-app=["']true["'])(?![^>]*\bsrc\s*=)[^>]*>\s*\S[\s\S]*?<\/script>/i.test(html);
  if (!html.includes('id="root"') || (!assets.some((url) => url.endsWith(".js")) && !hasInlineApp)) return;
  const assetCache = await caches.open(ASSET_CACHE);
  await Promise.all(
    assets.map(async (url) => {
      const cached = await assetCache.match(url);
      if (cached) return;
      const asset = await fetch(url, { credentials: "omit" });
      if (!cacheable(asset)) throw new Error("Static asset unavailable");
      await assetCache.put(url, asset);
    }),
  );
  // Commit the shell only after its referenced bundles are ready for offline use.
  await (await caches.open(SHELL_CACHE)).put(SHELL_URL, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmPublicShell());
  // A new worker waits for existing tabs to close; no forced mid-session reload.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Preserve every cache belonging to another application on the same origin.
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_OWNER) && !key.startsWith(CACHE_PREFIX),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    request.headers.has("authorization") ||
    url.origin !== SCOPE.origin ||
    !url.pathname.startsWith(SCOPE.pathname)
  )
    return;

  // Only the exact static app entry uses a navigation fallback. Auth callbacks,
  // API routes, third-party hosts and arbitrary deep URLs pass straight through.
  const isShell =
    url.pathname === SCOPE.pathname ||
    url.pathname === new URL(SHELL_URL).pathname;
  if (request.mode === "navigate" && isShell) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
          const fallback = await (
            await caches.open(SHELL_CACHE)
          ).match(SHELL_URL);
          return fallback || response;
        } catch {
          const fallback = await (
            await caches.open(SHELL_CACHE)
          ).match(SHELL_URL);
          return (
            fallback ||
            new Response(
              "Repère est momentanément hors connexion. Ouvrez l’application une fois avec Internet.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
      })(),
    );
    // Refresh only the anonymous public shell, never this navigation's query/body.
    event.waitUntil(warmPublicShell().catch(() => {}));
    return;
  }

  if (staticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request.url);
        if (cached) return cached;
        const response = await fetch(request.url, { credentials: "omit" });
        if (cacheable(response)) await cache.put(request.url, response.clone());
        return response;
      })(),
    );
  }
});

function safeNotificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "./", SCOPE);
    return url.origin === SCOPE.origin &&
      url.pathname.startsWith(SCOPE.pathname) &&
      !url.username &&
      !url.password
      ? url.href
      : SCOPE.href;
  } catch {
    return SCOPE.href;
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data?.json() || {};
      } catch {
        /* Keep the discreet default. */
      }
      const title =
        typeof payload.title === "string"
          ? payload.title.slice(0, 80)
          : "Repère";
      const body =
        typeof payload.body === "string"
          ? payload.body.slice(0, 180)
          : "Un rappel vous attend dans Repère.";
      await self.registration.showNotification(title || "Repère", {
        body,
        icon: new URL("icon-192.png", SCOPE).href,
        badge: new URL("icon-192.png", SCOPE).href,
        tag:
          typeof payload.tag === "string" &&
          /^[A-Za-z0-9._:-]{1,120}$/.test(payload.tag)
            ? payload.tag
            : `repere-${self.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(36).slice(2, 10)}`,
        data: { url: safeNotificationUrl(payload.url) },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find((client) => {
        try {
          const url = new URL(client.url);
          return (
            url.origin === SCOPE.origin &&
            url.pathname.startsWith(SCOPE.pathname)
          );
        } catch {
          return false;
        }
      });
      if (existing) {
        if ("navigate" in existing) await existing.navigate(target);
        await existing.focus();
      } else await self.clients.openWindow(target);
    })(),
  );
});
