import { useEffect, useRef, useState } from 'react';
import SignInCard, { USERNAME_INPUT_ID } from '../components/landing/SignInCard';
import { StatsMockup, RotationMockup, PracticeMockup } from '../components/landing/Mockups';
import StandingsWidget from '../components/dashboard/StandingsWidget';
import ScheduleWidget from '../components/dashboard/ScheduleWidget';
import RosterPositionWidget from '../components/dashboard/RosterPositionWidget';
import {
  IconChart, IconRotate, IconClipboard, IconUsers, IconPin, IconPlay, IconBolt, IconList, IconHome, IconCheck,
} from '../components/Icons';
import {
  SAMPLE_TEAM, SAMPLE_PLAYERS, SAMPLE_SCHEDULE, SAMPLE_COMPLETED_GAMES,
  SAMPLE_LEAGUE_TEAMS, SAMPLE_LEAGUE_RESULTS,
} from '../components/landing/sampleData';
import './Login.css';

// The signed-out screen: a product page with sign-in built in, dressed in the
// team dashboard's own design system (.dash-page, .dash-widget, .dash-module,
// .ds-*) so it reads as the same app. Every claim here is something the app
// does today; keep it that way when editing copy.

const NAV = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

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

const COURTSIDE = [
  { title: 'Phone, tablet or laptop', body: 'It runs in the browser, so there’s nothing to install.' },
  { title: 'Big, confirming buttons', body: 'Stat buttons flash on every tap, so you know it registered without looking up.' },
  { title: 'Saves as you go', body: 'A live game saves to the server after every change and can be resumed after a refresh.' },
  { title: 'Fullscreen mode', body: 'Hide the browser chrome with one button or the F key, on browsers that support it.' },
  { title: 'Quick corrections', body: 'Undo the last tap, or remove any stat from the action history.' },
  { title: 'In your team colors', body: 'Each team’s color carries through its headers, cards and player badges.' },
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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Bring the sign-in card into view and put the cursor in the username field.
function goToSignIn(e) {
  e?.preventDefault();
  const card = document.getElementById('sign-in');
  const input = document.getElementById(USERNAME_INPUT_ID);
  card?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  input?.focus({ preventScroll: true });
}

function Wordmark() {
  return (
    <span className="vp-home-brand-name">
      Volleyball<span className="vp-home-brand-accent">Pal</span>
    </span>
  );
}

function TopBar() {
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

  return (
    <header className="vp-home-topbar dash-topbar lp-top">
      <a className="vp-home-brand dash-topbar-brand lp-brand" href="#top" aria-label="VolleyballPal, back to top">
        <Wordmark />
      </a>

      <nav className="lp-top__nav" aria-label="Page sections">
        {NAV.map(n => <a key={n.href} className="vp-tl-topbar-btn lp-top__link" href={n.href}>{n.label}</a>)}
      </nav>

      <div className="lp-top__actions">
        <a href="#sign-in" className="ds-btn ds-btn-primary lp-top__signin" onClick={goToSignIn}>Sign in</a>
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

      <nav id="lp-menu" className="lp-menu" aria-label="Page sections" hidden={!open}>
        {NAV.map(n => (
          <a key={n.href} className="lp-menu__link" href={n.href} onClick={() => setOpen(false)}>{n.label}</a>
        ))}
      </nav>
    </header>
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

// Static preview of the team dashboard, rendered through the real widgets with
// fictional data. `inert` keeps its buttons out of the tab order and inactive.
function DashboardPreview() {
  return (
    <figure className="lp-preview" aria-labelledby="lp-preview-caption">
      <div className="lp-preview__grid" inert>
        <StandingsWidget
          team={SAMPLE_TEAM}
          leagueTeams={SAMPLE_LEAGUE_TEAMS}
          leagueResults={SAMPLE_LEAGUE_RESULTS}
        />
        <ScheduleWidget
          team={SAMPLE_TEAM}
          schedule={SAMPLE_SCHEDULE}
          completedGames={SAMPLE_COMPLETED_GAMES}
        />
        <RosterPositionWidget team={SAMPLE_TEAM} players={SAMPLE_PLAYERS} />
      </div>
      <figcaption id="lp-preview-caption" className="lp-preview__caption">
        The team dashboard: standings, schedule and roster. Sample teams and players are fictional.
      </figcaption>
    </figure>
  );
}

export default function Login() {
  return (
    <div className="dash-page lp" id="top">
      <a className="lp-skip" href="#sign-in" onClick={goToSignIn}>Skip to sign in</a>
      <TopBar />

      <main className="lp-main">
        {/* ── Hero: copy and tools left, sign-in panel right ── */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero__copy">
            <h1 id="lp-hero-title" className="lp-hero__title">
              Live stats, legal rotations and practice data, all in one place.
            </h1>
            <p className="lp-hero__lede">
              VolleyballPal tracks every touch courtside, plans your rotations before the first
              serve, and measures practice the way you measure games.
            </p>
          </div>

          <SignInCard id="sign-in" />

          <ul className="dash-modules lp-tiles" aria-label="The three tools">
            {TOOLS.map(t => {
              const { cls, Icon } = TOOL_TILE[t.id];
              return (
                <li key={t.id} className={`dash-module ${cls} lp-tile`}>
                  <span className="dash-module-icon"><Icon size={24} /></span>
                  <span className="dash-module-body">
                    <a className="dash-module-title lp-tile__link" href={`#${t.id}`}>{t.name}</a>
                    <span className="dash-module-sub">{t.summary}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Dashboard preview ── */}
        <section className="lp-section" aria-label="Dashboard preview">
          <DashboardPreview />
        </section>

        {/* ── The three tools ── */}
        <section id="features" className="lp-section" aria-labelledby="lp-features-title">
          <div className="lp-section__head">
            <h2 id="lp-features-title" className="lp-h2">Three tools, one team.</h2>
            <p className="lp-section__lede">Game day, game plan and practice, with the same 0–3 passing scale in StatsPal and PracticePal.</p>
          </div>

          <div className="lp-stack">
            {TOOLS.map(tool => {
              const { cls, Icon } = TOOL_TILE[tool.id];
              return (
                <Panel
                  key={tool.id}
                  id={tool.id}
                  icon={Icon}
                  title={tool.name}
                  className={`lp-tool ${cls}`}
                  bodyClass="lp-tool__body"
                  aria-labelledby={`${tool.id}-title`}
                >
                  <div className="lp-tool__copy">
                    <h3 id={`${tool.id}-title`} className="lp-h3">{tool.title}</h3>
                    <ul className="lp-list">
                      {tool.benefits.map(b => <li key={b}><Check />{b}</li>)}
                    </ul>
                  </div>
                  <div className="lp-tool__visual">
                    <tool.Mockup />
                  </div>
                </Panel>
              );
            })}
          </div>
        </section>

        {/* ── Roles ── */}
        <section className="lp-section" aria-labelledby="lp-roles-title">
          <div className="lp-section__head">
            <h2 id="lp-roles-title" className="lp-h2">Built for your whole team.</h2>
            <p className="lp-section__lede">Everyone signs in to the same app and sees what their role needs.</p>
          </div>
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

        {/* ── How it works ── */}
        <section id="how-it-works" className="lp-section" aria-labelledby="lp-how-title">
          <div className="lp-section__head">
            <h2 id="lp-how-title" className="lp-h2">From setup to game day in three steps.</h2>
          </div>
          <ol className="lp-grid-3 lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Panel icon={IconPlay} title={`Step ${i + 1}`} className="lp-step">
                  <h3 className="lp-h4">{s.title}</h3>
                  <p className="lp-muted">{s.body}</p>
                </Panel>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Courtside-ready ── */}
        <section className="lp-section" aria-labelledby="lp-courtside-title">
          <div className="lp-section__head">
            <h2 id="lp-courtside-title" className="lp-h2">Made for a loud gym and a quick timeout.</h2>
          </div>
          <Panel icon={IconBolt} title="Courtside-ready" meta={`${COURTSIDE.length} details`} bodyClass="lp-courtside">
            <ul className="lp-courtside__grid">
              {COURTSIDE.map(c => (
                <li key={c.title}>
                  <h3 className="lp-h4">{c.title}</h3>
                  <p className="lp-muted">{c.body}</p>
                </li>
              ))}
            </ul>
          </Panel>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="lp-section" aria-labelledby="lp-faq-title">
          <div className="lp-section__head">
            <h2 id="lp-faq-title" className="lp-h2">Questions, answered.</h2>
          </div>
          <Panel icon={IconList} title="FAQ" meta={`${FAQ.length} questions`} bodyClass="lp-faq">
            {FAQ.map(f => (
              <details key={f.q} className="lp-faq__item">
                <summary><h3 className="lp-h4">{f.q}</h3></summary>
                <p className="lp-muted">{f.a}</p>
              </details>
            ))}
          </Panel>
        </section>

        {/* ── Final call to action ── */}
        <section className="lp-section" aria-labelledby="lp-cta-title">
          <Panel icon={IconHome} title="VolleyballPal" bodyClass="lp-cta">
            <div>
              <h2 id="lp-cta-title" className="lp-h2">Ready for game day?</h2>
              <p className="lp-muted">Sign in to track your next match, check the plan, or see your numbers.</p>
            </div>
            <div className="lp-cta__actions">
              <a href="#sign-in" className="ds-btn ds-btn-primary ds-btn-lg lp-cta__button" onClick={goToSignIn}>Sign in</a>
              <p className="lp-cta__help">Need an account? Ask your coach or club admin.</p>
            </div>
          </Panel>
        </section>
      </main>

      <footer className="lp-footer">
        <a className="vp-home-brand dash-topbar-brand lp-brand" href="#top" aria-label="VolleyballPal, back to top">
          <Wordmark />
        </a>
        <nav aria-label="Footer">
          {NAV.map(n => <a key={n.href} className="vp-tl-topbar-btn lp-top__link" href={n.href}>{n.label}</a>)}
        </nav>
        <p className="lp-footer__copy">© 2026 VolleyballPal</p>
      </footer>
    </div>
  );
}
