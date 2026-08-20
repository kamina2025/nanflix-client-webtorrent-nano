// sw.js - Service Worker Básico para PWA NanFlix
const CACHE_NAME = 'nanflix-v1';

self.addEventListener('install', (event) => {
  console.log('🌱 Service Worker instalado');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activo');
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Manejador de peticiones por defecto (network first)
  event.respondWith(fetch(event.request));
});