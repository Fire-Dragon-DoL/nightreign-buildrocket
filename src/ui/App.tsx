import { BuildsViewer } from './pages/BuildsViewer.tsx';
import { MissingRelics } from './pages/MissingRelics.tsx';
import { NeedsConfig } from './pages/NeedsConfig.tsx';
import { SecondaryPicks } from './pages/SecondaryPicks.tsx';
import { SellPlanner } from './pages/SellPlanner.tsx';
import { PlanBar } from './plan/PlanBar.tsx';
import { PrimaryBar } from './primary/PrimaryBar.tsx';
import { type Route, useHashRoute } from './useHashRoute.ts';
import { WindowDrop } from './WindowDrop.tsx';

const MENU: { route: Route; label: string }[] = [
  { route: 'builds', label: 'Builds Viewer' },
  { route: 'missing', label: 'Relics Diff' },
  { route: 'sell', label: 'Sell Planner' },
  { route: 'picks', label: 'Secondary Pool Picks' },
];

export function App() {
  const route = useHashRoute();
  return (
    <main className="app">
      <WindowDrop />
      <header className="app__header">
        <h1>Nightreign Buildrocket</h1>
        <nav className="menu" aria-label="Pages">
          {MENU.map((item) => (
            <a
              key={item.route}
              href={`#/${item.route}`}
              className="menu__item"
              aria-current={route === item.route ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        {/* The Primary Save File and the relic needs plan are global: always here, for every page. */}
        <div className="app__plan">
          <div className="app__files">
            <PrimaryBar />
            <PlanBar />
          </div>
          <a
            href="#/needs"
            className="menu__item menu__item--needs"
            aria-current={route === 'needs' ? 'page' : undefined}
            data-testid="menu-needs"
          >
            Needs Config
          </a>
        </div>
      </header>

      {/* Pages stay mounted (just hidden) so loaded files survive switching pages. */}
      <div className="page" hidden={route !== 'builds'}>
        <BuildsViewer />
      </div>
      <div className="page" hidden={route !== 'missing'}>
        <MissingRelics />
      </div>
      <div className="page" hidden={route !== 'sell'}>
        <SellPlanner />
      </div>
      <div className="page" hidden={route !== 'picks'}>
        <SecondaryPicks />
      </div>
      <div className="page" hidden={route !== 'needs'}>
        <NeedsConfig />
      </div>

      <footer className="app__footer muted">
        Nightreign Buildrocket v{__APP_VERSION__} · Free software under the{' '}
        <a href="https://github.com/Fire-Dragon-DoL/nightreign-buildrocket">AGPL-3.0 (source)</a>.
        Not affiliated with FromSoftware or Bandai Namco.
      </footer>
    </main>
  );
}
