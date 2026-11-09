// Minimal offline support: cache the app shell, always go to the network for the API.
const CACHE = "foodtrack-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) return;
  // Network first, fall back to cache (so updates show up immediately when online).
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((r) => r ?? caches.match("/"))),
  );
});

// ---- Meal reminders (web push) ----

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "FoodTrack", {
      body: data.body || "Time to log your meal.",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: data.tag || "foodtrack",
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping a reminder opens the app (on the scan screen), reusing an open window if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(url).then((nav) => (nav || w).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
