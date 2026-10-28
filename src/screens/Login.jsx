import { useCallback, useEffect, useRef, useState } from 'react';
import SignInCard, { USERNAME_INPUT_ID } from '../components/landing/SignInCard';
import { StatsMockup, RotationMockup, PracticeMockup } from '../components/landing/Mockups';
import {
  IconChart, IconRotate, IconClipboard, IconUsers, IconPin, IconPlay, IconList, IconHome, IconCheck,
} from '../components/Icons';
import './Login.css';

// The signed-out screen: four tabs (Home, Features, How it works, FAQ) over a
// shared court backdrop. Home is the sign-in card. Every claim here is
// something the app does today; keep it that way when editing copy.

// Each tab is a real URL. The signed-in app has no URL routing, so this page
// switches tabs itself with the History API.
const PAGES = [
  { path: '/', id: 'home', label: 'Home', title: 'VolleyballPal' },
  { path: '/features', id: 'features', label: 'Features', title: 'Features · VolleyballPal' },
  { path: '/how-it-works', id: 'how', label: 'How it works', title: 'How it works · VolleyballPal' },
  { path: '/faq', id: 'faq', label: 'FAQ', title: 'FAQ · VolleyballPal' },
];

function pageFor(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PAGES.find(p => p.path === path) ?? PAGES[0];
}

function useLandingRoute() {
  const [page, setPage] = useState(() => pageFor(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPage(pageFor(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // `query` is an optional "?…" suffix, e.g. "?tool=rotationpal".
  const go = useCallback((path, query = '') => {
    const next = pageFor(path);
    const url = next.path + query;
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, '', url);
    setPage(next);
  }, []);

  return [page, go];
}

// A plain link that switches tabs in place; modified clicks (new tab, etc.)
// fall through to the browser.
function PageLink({ to, query = '', go, onNavigate, children, ...rest }) {
  const onClick = e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onNavigate?.();
    go(to, query);
  };
  return <a href={to + query} onClick={onClick} {...rest}>{children}</a>;
}

const TOOLS = [
  {
    id: 'statspal',
    name: 'StatsPal',
    summary: 'Live match stats',
    title: 'Track every touch, live from the bench.',
    benefits: [
      'Tap to log kills, attack errors, aces, digs, blocks, assists and ball-handling errors for each player.',
      'Grade every serve receive 0–3 with one tap, and the pass average updates as you go.',
      'Keep score to 25 with a 15-point deciding set, win by two, in best-of-3 or best-of-5 matches.',
      'Undo or remove any stat from the action history, and resume a live game after a refresh.',
    ],
    Mockup: StatsMockup,
  },
  {
    id: 'rotationpal',
    name: 'RotationPal',
    summary: 'Game plans and legal rotations',
    title: 'Plan legal rotations before the first serve.',
    benefits: [
      'Drag players onto the court for all six rotations, in both serve and serve receive.',
      'A built-in overlap check flags illegal alignments and blocks saving until they are fixed.',
      'Pair your libero with the middles and track substitutions against the 12-per-set limit.',
      'Save several named plans for each game, or sketch ideas in the Playground.',
    ],
    Mockup: RotationMockup,
  },
  {
    id: 'practicepal',
    name: 'PracticePal',
    summary: 'Drills, scrimmages and player development',
    title: 'Measure practice the way you measure games.',
    benefits: [
      'Run Serve-Receive, Hitting and Serving drills, or name your own made-or-missed drill.',
      'Track intrasquad scrimmages, Team A vs Team B, with the full StatsPal button set.',
      'See each player’s passing, hitting and serving side by side across drills, scrimmage and games.',
      'Practice numbers are kept separate, so they never change match stats.',
    ],
    Mockup: PracticeMockup,
  },
];

const ROLES = [
  {
    role: 'Coaches',
    lede: 'Run the team from the bench and the practice gym.',
    can: [
      'Track live games and fix results afterward',
      'Build game plans and run practice drills',
      'Manage the roster, schedule and tournaments',
      'Create player logins and message the team',
    ],
  },
  {
    role: 'Players',
    lede: 'Your own numbers, any time you sign in.',
    can: [
      'Season totals, hitting % and pass average',
      'Single-game bests and a full game log',
      'The team schedule and league standings',
      'Messages from your coaches',
    ],
  },
  {
    role: 'Admins',
    lede: 'For the athletic director or club admin who runs the program.',
    can: [
      'Create teams and coach accounts',
      'Assign coaches, and set each team to high school or club format',
      'Archive and restore teams, keeping all their data',
      'Export season stats and game logs as CSV',
    ],
  },
];

const STEPS = [
  {
    title: 'Your admin sets up the team',
    body: 'Teams, rosters and coach accounts are created by your program’s admin. Coaches then add player logins.',
  },
  {
    title: 'Sign in with the login you’re given',
    body: 'There’s no public sign-up. Use the username and password from your coach or admin, on any device with a browser.',
  },
  {
    title: 'Go courtside',
    body: 'Track stats live, pull up the game plan, run drills, and review the numbers after every match.',
  },
];

const FAQ = [
  {
    q: 'Who is VolleyballPal for?',
    a: 'Volleyball programs: the coaches who track games and run practice, the players who want to see their numbers, and the admin who sets up teams and accounts. It supports high school, middle school and club teams.',
  },
  {
    q: 'Does it work for club teams as well as high school?',
    a: 'Yes. Each team is set to High School or Club. High school teams get league standings on their dashboard; club teams see what’s next, with tournaments that group games under one shared roster and their own tournament stats.',
  },
  {
    q: 'Can players see their own stats?',
    a: 'Yes. A player with a login sees their season totals, hitting percentage, pass average, single-game bests, game log, the schedule and the standings. Live game tracking is for coaches and admins.',
  },
  {
    q: 'What devices does it work on?',
    a: 'Any modern browser on a phone, tablet or computer. It needs an internet connection, because live games save to the server as you track them.',
  },
  {
    q: 'How do I get an account?',
    a: 'Accounts aren’t self-serve. Your program’s admin creates coach accounts, and coaches or the admin create player logins, then share the username and password with you.',
  },
  {
    q: 'Can I get our stats out of VolleyballPal?',
    a: 'Admins can export a team’s season stats and game log as CSV files, ready for a spreadsheet.',
  },
];

// Dashboard tool tiles: same classes, icons and tool colours as TeamLaunch.
const TOOL_TILE = {
  statspal: { cls: 'dash-module-stats', Icon: IconChart },
  rotationpal: { cls: 'dash-module-rotation', Icon: IconRotate },
  practicepal: { cls: 'dash-module-practice', Icon: IconClipboard },
};

const ROLE_ICON = { Coaches: IconClipboard, Players: IconUsers, Admins: IconPin };

// Home's floating tool chips: one short line and a sample stat each.
// The stats are decorative sample numbers.
const TOOL_CHIP = {
  statspal: { line: 'Live stats, every touch, courtside', stat: '.412 kill % · Set 2' },
  rotationpal: { line: 'Game plans and legal rotations', stat: 'Rotation 4 ✓ Legal' },
  practicepal: { line: 'Drills, scrimmages and player growth', stat: 'Pass rating 2.31' },
};

// Player spots on the court as [x, y] % of its length and depth. The court
// runs left to right: the left half is our side, the right half the opponent's.
const OUR_SPOTS = [[12, 20], [12, 70], [28, 45], [40, 15], [40, 50], [40, 82]];
const OPP_SPOTS = [[58, 22], [58, 55], [58, 84], [74, 40], [86, 18], [86, 72]];

// The backdrop behind every tab: a CSS-3D court tilted away from the viewer,
// both teams' spots and a ball rallying over the net. Purely decorative.
function CourtScene() {
  return (
    <div className="lp-court" aria-hidden="true">
      <div className="lp-court__floor">
        {OUR_SPOTS.map(([x, y]) => (
          <span key={`us-${x}-${y}`} className="lp-court__dot" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        {OPP_SPOTS.map(([x, y]) => (
          <span key={`opp-${x}-${y}`} className="lp-court__dot lp-court__dot--opp" style={{ left: `${x}%`, top: `${y}%` }} />
        ))}
        <span className="lp-court__ball" />
      </div>
      <div className="lp-court__fade" />
    </div>
  );
}

function BallLogo() {
  return (
    <svg className="lp-logo" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20M2.5 9.5c5 1 10 0 14.5-5M4 18c4-4 10-6 17-5" />
    </svg>
  );
}

function Check() {
  return <IconCheck size={15} className="lp-check" />;
}

// A dashboard panel: .dash-widget with the icon + small label header.
function Panel({ icon: Icon, title, meta, className = '', bodyClass = '', children, ...rest }) {
  return (
    <section className={`dash-widget lp-panel ${className}`} {...rest}>
      <header className="dash-widget-head">
        <span className="dash-widget-title">{Icon && <Icon size={13} />} {title}</span>
        {meta && <span className="dash-widget-meta">{meta}</span>}
      </header>
      <div className={`dash-widget-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

function Wordmark() {
  return (
    <span className="vp-home-brand-name">
      Volleyball<span className="vp-home-brand-accent">Pal</span>
    </span>
  );
}

function TopBar({ page, go, onSignIn }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const tab = (p, className) => (
    <PageLink
      key={p.path}
      to={p.path}
      go={go}
      onNavigate={() => setOpen(false)}
      className={`${className}${p.id === page.id ? ' is-active' : ''}`}
      aria-current={p.id === page.id ? 'page' : undefined}
    >
      {p.label}
    </PageLink>
  );

  return (
    <header className="vp-home-topbar dash-topbar lp-top">
      <PageLink to="/" go={go} className="vp-home-brand dash-topbar-brand lp-brand" aria-label="VolleyballPal home">
        <BallLogo />
        <Wordmark />
      </PageLink>

      <nav className="lp-top__nav" aria-label="Main">
        {PAGES.map(p => tab(p, 'lp-tab'))}
      </nav>

      <div className="lp-top__actions">
        {page.id !== 'home' && (
          <PageLink to="/" go={go} onNavigate={onSignIn} className="ds-btn lp-glow-btn lp-top__signin">Sign in</PageLink>
        )}
        <button
          ref={menuButton}
          type="button"
          className="vp-tl-topbar-btn lp-top__menu"
          aria-expanded={open}
          aria-controls="lp-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(o => !o)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {open
              ? <path d="M6.4 19 5 17.6 10.6 12 5 6.4 6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4z" />
              : <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" />}
          </svg>
        </button>
      </div>

      <nav id="lp-menu" className="lp-menu" aria-label="Main" hidden={!open}>
        {PAGES.map(p => tab(p, 'lp-menu__link'))}
      </nav>
    </header>
  );
}

// Each tab's heading takes focus after a tab switch, so screen readers land
// on the new page.
function PageTitle({ className = 'lp-h1', children }) {
  return <h1 id="lp-page-title" className={className} tabIndex={-1}>{children}</h1>;
}

function HomePage({ go }) {
  return (
    <section className="lp-page lp-home" aria-labelledby="lp-page-title">
      <PageTitle className="lp-hero__title">
        Every touch. <span className="lp-hero__gradient">Every rotation.</span>
      </PageTitle>

      <div className="lp-stage">
        <SignInCard id="sign-in" />

        <ul className="lp-toolchips" aria-label="The three tools">
          {TOOLS.map(t => {
            const { Icon } = TOOL_TILE[t.id];
            return (
              <li key={t.id} className={`lp-toolchip-slot lp-toolchip-slot--${t.id}`}>
                <PageLink to="/features" query={`?tool=${t.id}`} go={go} className="lp-toolchip">
                  <span className="lp-toolchip__head">
                    <Icon size={16} />
                    <b>{t.name}</b>
                  </span>
                  <span className="lp-toolchip__line">{TOOL_CHIP[t.id].line}</span>
                  <span className="lp-toolchip__stat">{TOOL_CHIP[t.id].stat}</span>
                </PageLink>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// The Features tab opens on the tool named in ?tool=, defaulting to StatsPal.
function toolFromUrl() {
  const id = new URLSearchParams(window.location.search).get('tool');
  return TOOLS.some(t => t.id === id) ? id : TOOLS[0].id;
}

function FeaturesPage() {
  const [view, setView] = useState(toolFromUrl);
  const tool = TOOLS.find(t => t.id === view);

  const choose = id => {
    setView(id);
    window.history.replaceState(null, '', `/features?tool=${id}`);
  };

  return (
    <section className="lp-page" aria-labelledby="lp-page-title">
      <header className="lp-page__head">
        <PageTitle>Three tools, one team.</PageTitle>
        <p className="lp-section__lede">Game day, game plan and practice, with the same 0–3 passing scale in StatsPal and PracticePal.</p>
      </header>

      <div className="lp-seg" role="group" aria-label="Show feature">
        {TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`lp-seg__btn${t.id === view ? ' is-active' : ''}`}
            aria-pressed={t.id === view}
            onClick={() => choose(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <Panel
        key={tool.id}
        icon={TOOL_TILE[tool.id].Icon}
        title={tool.name}
        className={`lp-tool ${TOOL_TILE[tool.id].cls}`}
        bodyClass="lp-tool__body"
        aria-labelledby={`${tool.id}-title`}
      >
        <div className="lp-tool__copy">
          <h2 id={`${tool.id}-title`} className="lp-h3">{tool.title}</h2>
          <ul className="lp-list">
            {tool.benefits.map(b => <li key={b}><Check />{b}</li>)}
          </ul>
        </div>
        <div className="lp-tool__visual">
          <tool.Mockup />
        </div>
      </Panel>
    </section>
  );
}

function HowPage() {
  return (
    <section className="lp-page" aria-labelledby="lp-page-title">
      <header className="lp-page__head">
        <PageTitle>From setup to game day in three steps.</PageTitle>
      </header>
      <ol className="lp-grid-3 lp-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Panel icon={IconPlay} title={`Step ${i + 1}`} className="lp-step">
              <h2 className="lp-h4">{s.title}</h2>
              <p className="lp-muted">{s.body}</p>
            </Panel>
          </li>
        ))}
      </ol>

      <header className="lp-page__head lp-page__head--sub">
        <h2 className="lp-h2">Built for your whole team.</h2>
        <p className="lp-section__lede">Everyone signs in to the same app and sees what their role needs.</p>
      </header>
      <div className="lp-grid-3">
        {ROLES.map(r => (
          <Panel key={r.role} icon={ROLE_ICON[r.role]} title={r.role} aria-label={r.role}>
            <h3 className="lp-h4">{r.lede}</h3>
            <ul className="lp-list lp-list--compact">
              {r.can.map(c => <li key={c}><Check />{c}</li>)}
            </ul>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function FaqPage({ go, onSignIn }) {
  return (
    <section className="lp-page" aria-labelledby="lp-page-title">
      <header className="lp-page__head">
        <PageTitle>Questions, answered.</PageTitle>
      </header>
      <Panel icon={IconList} title="FAQ" meta={`${FAQ.length} questions`} bodyClass="lp-faq">
        {FAQ.map(f => (
          <details key={f.q} className="lp-faq__item">
            <summary><h2 className="lp-h4">{f.q}</h2></summary>
            <p className="lp-muted">{f.a}</p>
          </details>
        ))}
      </Panel>

      <Panel icon={IconHome} title="VolleyballPal" className="lp-cta-panel" bodyClass="lp-cta">
        <div>
          <h2 className="lp-h3">Ready for game day?</h2>
          <p className="lp-muted">Sign in to track your next match, check the plan, or see your numbers.</p>
        </div>
        <div className="lp-cta__actions">
          <PageLink to="/" go={go} onNavigate={onSignIn} className="ds-btn ds-btn-lg lp-glow-btn lp-cta__button">Sign in</PageLink>
          <p className="lp-cta__help">Need an account? Ask your coach or club admin.</p>
        </div>
      </Panel>
    </section>
  );
}

export default function Login() {
  const [page, go] = useLandingRoute();
  const wantsSignIn = useRef(false);
  const shown = useRef(page.id);

  // Sign-in links on the other tabs land on Home with the cursor in the form.
  const onSignIn = useCallback(() => { wantsSignIn.current = true; }, []);

  useEffect(() => { document.title = page.title; }, [page]);
  useEffect(() => () => { document.title = 'VolleyballPal'; }, []);

  // After a tab switch: back to the top, focus on the new page.
  useEffect(() => {
    if (shown.current === page.id) return;
    shown.current = page.id;
    window.scrollTo(0, 0);
    const target = wantsSignIn.current
      ? document.getElementById(USERNAME_INPUT_ID)
      : document.getElementById('lp-page-title');
    wantsSignIn.current = false;
    target?.focus({ preventScroll: true });
  }, [page]);

  return (
    <div className={`dash-page lp lp--${page.id}`}>
      <a className="lp-skip" href="#lp-main">Skip to content</a>
      <CourtScene />
      <TopBar page={page} go={go} onSignIn={onSignIn} />

      <main id="lp-main" className="lp-main" tabIndex={-1}>
        {page.id === 'home' && <HomePage go={go} />}
        {page.id === 'features' && <FeaturesPage />}
        {page.id === 'how' && <HowPage />}
        {page.id === 'faq' && <FaqPage go={go} onSignIn={onSignIn} />}
      </main>
    </div>
  );
}
