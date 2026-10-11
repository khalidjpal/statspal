import { useEffect, useRef, useState } from 'react';
import VolleyballMark from '../components/landing/VolleyballMark';
import SignInCard, { USERNAME_INPUT_ID } from '../components/landing/SignInCard';
import { StatsMockup, RotationMockup, PracticeMockup } from '../components/landing/Mockups';
import './Login.css';

// The signed-out screen: a product page with sign-in built in. Every claim
// here is something the app does today; keep it that way when editing copy.

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
    <header className="lp-top">
      <div className="lp-top__inner">
        <a className="lp-brand" href="#top" aria-label="VolleyballPal, back to top">
          <VolleyballMark />
          <span className="lp-wordmark">Volleyball<span>Pal</span></span>
        </a>

        <nav className="lp-top__nav" aria-label="Page sections">
          {NAV.map(n => <a key={n.href} className="lp-top__link" href={n.href}>{n.label}</a>)}
        </nav>

        <div className="lp-top__actions">
          <a href="#sign-in" className="md-button md-button--filled lp-top__signin" onClick={goToSignIn}>Sign in</a>
          <button
            ref={menuButton}
            type="button"
            className="lp-top__menu"
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
      </div>

      <nav id="lp-menu" className="lp-menu" aria-label="Page sections" hidden={!open}>
        {NAV.map(n => (
          <a key={n.href} className="lp-menu__link" href={n.href} onClick={() => setOpen(false)}>{n.label}</a>
        ))}
      </nav>
    </header>
  );
}

// Small line icons for the three tools: a bar chart, a court, a stopwatch.
const TOOL_ICONS = {
  statspal: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z',
  rotationpal: 'M3 4h18v16H3V4Zm2 2v5h14V6H5Zm0 7v5h14v-5H5Zm4.5-6.5h1.5v4H9.5v-4Zm3.5 0h1.5v4H13v-4Zm-3.5 7h1.5v4H9.5v-4Zm3.5 0h1.5v4H13v-4Z',
  practicepal: 'M9 1h6v2H9V1Zm2 8h2v5h-2V9Zm8.03-1.39 1.42-1.42-1.41-1.41-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 7.03 3.61ZM12 20a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
};

function ToolIcon({ id }) {
  return (
    <svg className="lp-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={TOOL_ICONS[id]} />
    </svg>
  );
}

function Check() {
  return (
    <svg className="lp-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
}

export default function Login() {
  return (
    <div className="lp md-scope" id="top">
      <a className="lp-skip" href="#sign-in" onClick={goToSignIn}>Skip to sign in</a>
      <TopBar />

      <main>
        {/* ── Hero ── */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero__copy">
            <h1 id="lp-hero-title" className="lp-hero__title">
              Live stats, legal rotations and practice data, all in one place.
            </h1>
            <p className="lp-hero__lede">
              VolleyballPal tracks every touch courtside, plans your rotations before the first
              serve, and measures practice the way you measure games.
            </p>
            <ul className="lp-hero__tools" aria-label="The three tools">
              {TOOLS.map(t => (
                <li key={t.id}>
                  <ToolIcon id={t.id} />
                  <a href={`#${t.id}`}><strong>{t.name}</strong></a>
                  <span>{t.summary}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-hero__panel">
            <SignInCard id="sign-in" />
          </div>
        </section>

        {/* ── The three tools ── */}
        <section id="features" className="lp-section lp-tools" aria-labelledby="lp-features-title">
          <div className="lp-section__head">
            <h2 id="lp-features-title" className="lp-h2">Three tools, one team.</h2>
            <p className="lp-section__lede">Game day, game plan and practice, with the same 0–3 passing scale in StatsPal and PracticePal.</p>
          </div>

          {TOOLS.map((tool, i) => (
            <article key={tool.id} id={tool.id} className={`lp-tool${i % 2 ? ' lp-tool--flip' : ''}`} aria-labelledby={`${tool.id}-title`}>
              <div className="lp-tool__copy">
                <p className="lp-tool__name"><ToolIcon id={tool.id} />{tool.name}</p>
                <h3 id={`${tool.id}-title`} className="lp-h3">{tool.title}</h3>
                <ul className="lp-list">
                  {tool.benefits.map(b => <li key={b}><Check />{b}</li>)}
                </ul>
              </div>
              <div className="lp-tool__visual">
                <tool.Mockup />
              </div>
            </article>
          ))}
        </section>

        {/* ── Roles ── */}
        <section className="lp-section lp-roles" aria-labelledby="lp-roles-title">
          <div className="lp-section__head">
            <h2 id="lp-roles-title" className="lp-h2">Built for your whole team.</h2>
            <p className="lp-section__lede">Everyone signs in to the same app and sees what their role needs.</p>
          </div>
          <div className="lp-roles__grid">
            {ROLES.map(r => (
              <article key={r.role} className="lp-card">
                <h3 className="lp-h3">{r.role}</h3>
                <p className="lp-card__lede">{r.lede}</p>
                <ul className="lp-list lp-list--compact">
                  {r.can.map(c => <li key={c}><Check />{c}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section id="how-it-works" className="lp-section" aria-labelledby="lp-how-title">
          <div className="lp-section__head">
            <h2 id="lp-how-title" className="lp-h2">From setup to game day in three steps.</h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step__num" aria-hidden="true">{i + 1}</span>
                <h3 className="lp-h3">{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Courtside-ready ── */}
        <section className="lp-section lp-courtside" aria-labelledby="lp-courtside-title">
          <div className="lp-courtside__panel">
            <div className="lp-section__head">
              <h2 id="lp-courtside-title" className="lp-h2">Made for a loud gym and a quick timeout.</h2>
            </div>
            <ul className="lp-courtside__grid">
              {COURTSIDE.map(c => (
                <li key={c.title}>
                  <h3 className="lp-h4">{c.title}</h3>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="lp-section lp-faq" aria-labelledby="lp-faq-title">
          <div className="lp-faq__inner">
            <div className="lp-section__head">
              <h2 id="lp-faq-title" className="lp-h2">Questions, answered.</h2>
            </div>
            <div className="lp-faq__list">
              {FAQ.map(f => (
                <details key={f.q} className="lp-faq__item">
                  <summary><h3 className="lp-h4">{f.q}</h3></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final call to action ── */}
        <section className="lp-cta" aria-labelledby="lp-cta-title">
          <div className="lp-cta__inner">
            <h2 id="lp-cta-title" className="lp-h2">Ready for game day?</h2>
            <p>Sign in to track your next match, check the plan, or see your numbers.</p>
            <a href="#sign-in" className="md-button md-button--filled lp-cta__button" onClick={goToSignIn}>Sign in</a>
            <p className="lp-cta__help">Need an account? Ask your coach or club admin.</p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <a className="lp-brand" href="#top" aria-label="VolleyballPal, back to top">
            <VolleyballMark />
            <span className="lp-wordmark">Volleyball<span>Pal</span></span>
          </a>
          <nav aria-label="Footer">
            {NAV.map(n => <a key={n.href} className="lp-top__link" href={n.href}>{n.label}</a>)}
          </nav>
          <p className="lp-footer__copy">© 2026 VolleyballPal</p>
        </div>
      </footer>
    </div>
  );
}
