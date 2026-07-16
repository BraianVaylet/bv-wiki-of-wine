import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';

/** Cada cuánto se pregunta al servidor si hay una versión nueva. */
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 h

/**
 * Avisa cuando hay una versión nueva de la app y la aplica con un toque.
 * Además chequea updates periódicamente y cada vez que la PWA vuelve a primer
 * plano: una SPA no navega, así que sin este chequeo el navegador podría no
 * mirar el sw.js por horas y el usuario seguiría con la versión vieja.
 *
 * Mismo patrón que bv-bow-sight / bv-personal-finances / bv-cross.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) registration.update();
      };
      setInterval(check, UPDATE_CHECK_INTERVAL);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-primary bg-surface p-3 shadow-lg">
        <span className="min-w-0 flex-1 text-fg text-sm">Hay una nueva versión disponible.</span>
        <Button className="shrink-0" onClick={() => updateServiceWorker(true)}>
          Actualizar
        </Button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Ahora no"
          title="Ahora no"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
