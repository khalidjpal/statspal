// RotationPal layout harness: the gameplan builder in Playground mode with a
// fictional team, no login and no network (Supabase is stubbed by the
// harness Vite config). Dev-only; not part of the app build.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../../src/contexts/ToastContext';
import GameplanBuilderModal from '../../src/components/modals/GameplanBuilderModal';
import { TEAM, PLAYERS, SESSION_ROW } from './fixtures';
import '../../src/styles.css';
import '../../src/modules/rotationpal/rotationpal.css';

const params = new URLSearchParams(location.search);
const mode = params.get('mode');

// Screenshot helpers: ?open=subs,roster expands the phone sections and
// ?menu=1 opens the ⋯ menu once the builder has loaded.
const poke = setInterval(() => {
  if (!document.querySelector('.gpb-msec-toggle')) return;
  clearInterval(poke);
  for (const which of (params.get('open') || '').split(',').filter(Boolean)) {
    document.querySelector(`.gpb-msec.gpb-col-${which} .gpb-msec-toggle`)?.click();
  }
  if (params.get('menu')) document.querySelector('.gpb-slim-more > button')?.click();
}, 200);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <div className="rotationpal-module">
        {mode === 'gameplan' ? (
          <GameplanBuilderModal
            team={TEAM}
            game={{ id: 'game-harness', opponent: 'Cedar Ridge', game_date: '2026-10-29', location: 'Away' }}
            players={PLAYERS}
            onClose={() => {}}
          />
        ) : (
          <GameplanBuilderModal
            team={TEAM}
            players={PLAYERS}
            playgroundSession={{ id: SESSION_ROW.id, name: SESSION_ROW.name }}
            onClose={() => {}}
          />
        )}
      </div>
    </ToastProvider>
  </StrictMode>,
);
