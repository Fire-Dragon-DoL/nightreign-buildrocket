import { BuildsViewer } from './pages/BuildsViewer.tsx';
import { MissingRelics } from './pages/MissingRelics.tsx';
import { SellPlanner } from './pages/SellPlanner.tsx';
import { type Route, useHashRoute } from './useHashRoute.ts';

const MENU: { route: Route; label: string }[] = [
  { route: 'builds', label: 'Builds Viewer' },
  { route: 'missing', label: 'Relics Needs' },
  { route: 'sell', label: 'Sell Planner' },
];

export function App() {
  const route = useHashRoute();
  return (
    <main className="app">
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

      <footer className="app__footer muted">
        Nightreign Buildrocket v{__APP_VERSION__} · Free software under the{' '}
        <a href="https://github.com/Fire-Dragon-DoL/nightreign-buildrocket">AGPL-3.0 (source)</a>.
        Not affiliated with FromSoftware or Bandai Namco.
      </footer>
    </main>
  );
}
