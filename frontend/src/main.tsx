import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/index.css';

/**
 * Development-only primitives showcase, used to satisfy the Phase 2 G5 visual
 * review in `docs/phase-plan.md`. Seven of the thirteen primitives are not
 * rendered anywhere in the application, so they cannot be reached through a
 * route.
 *
 * Two properties make this safe to keep in the tree:
 *
 *  1. It is not a route. `routeConfig.ts` is untouched, so no path, navigation
 *     entry or application behaviour changes.
 *  2. `import.meta.env.DEV` is replaced with `false` when Vite builds for
 *     production, so the branch is dead code, the dynamic import is dropped and
 *     the showcase is absent from the production bundle. Verified by inspecting
 *     `dist/assets/*.js` after `npm run build`.
 *
 * Vite's dev server serves `index.html` for unknown paths, so this is reachable
 * at http://localhost:5173/dev/primitives while `npm run dev` is running.
 */
const SHOWCASE_PATH = '/dev/primitives';

if (import.meta.env.DEV && window.location.pathname === SHOWCASE_PATH) {
  void import('./dev/PrimitivesShowcase').then(({ PrimitivesShowcase }) => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <PrimitivesShowcase />
      </React.StrictMode>,
    );
  });
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
