// The live stat-tracking button set, shared by StatsPal's LiveGame and
// PracticePal's scrimmage tracker.
//
// This lived inside LiveGame until PracticePal grew a scrimmage — an
// intrasquad practice match tracked with the same full stat set. Copying the
// array would have let the two drift the first time a button changed, so it
// moved here and both import it. LiveGame's behaviour is unchanged: this is
// the same literal it always had.
//
// Field meanings:
//   stat     the counter a press increments
//   also     a second counter incremented by the same press (the pass grade)
//   autoAtt  the press also counts an attack attempt
//   autoSrv  the press also counts a serve attempt
//   err      renders red; it is a mistake, not an achievement
//   tone     overrides the red/green colouring: 'r0'…'r3' for a graded
//            receive, 'neutral' for a tally that is neither good nor bad
//   hist     the label used in the action history, where more words fit
export const CATEGORIES = [
  { label: 'ATTACK', actions: [
    { key:'kill',         abbr:'K',   label:'Kill',    stat:'kills',              autoAtt:true, err:false },
    { key:'attack_error', abbr:'E',   label:'Atk Err', stat:'errors',             autoAtt:true, err:true  },
    { key:'attempt',      abbr:'Att', label:'Attempt', stat:'attempts',      tone:'neutral',     err:false },
  ]},
  // Serving mirrors attacking: an ace and a service error are both SERVES, so
  // each press counts its outcome and the attempt behind it. "In" is the third
  // outcome — the serve landed and the rally went on — and it is what makes
  // serve-in % derivable here at all. Without it a tracker records what went
  // wrong and never how often anything went right.
  { label: 'SERVE', actions: [
    { key:'ace',          abbr:'SA',  label:'Ace',     stat:'aces',         autoSrv:true, err:false },
    { key:'serve_in',     abbr:'In',  label:'Serve In', stat:'serve_attempts', tone:'neutral', err:false },
    { key:'serve_error',  abbr:'SE',  label:'Srv Err', stat:'serve_errors', autoSrv:true, err:true  },
  ]},
  // Every receive is graded: one press logs the receive AND its pass rating.
  // `also` is the rating counter; `stat` stays receives so the R total is
  // unchanged no matter which grade is pressed.
  // The four grades render as one segmented RECEIVE control, ascending 0·1·2·3,
  // so they read as a single stat with four grades rather than four tiles — and
  // in the same direction as the grade counts everywhere else in the app.
  { label: 'DEFENSE', actions: [
    { key:'dig',          abbr:'D',   label:'Dig',     stat:'digs',                              err:false },
    { key:'receive_grp', group:'RECEIVE', actions: [
      { key:'pass_0',     abbr:'0',   label:'Aced',    stat:'receives', also:'pass_0', tone:'r0', hist:'Pass 0 (Aced)',    err:false },
      { key:'pass_1',     abbr:'1',   label:'Poor',    stat:'receives', also:'pass_1', tone:'r1', hist:'Pass 1 (Poor)',    err:false },
      { key:'pass_2',     abbr:'2',   label:'Good',    stat:'receives', also:'pass_2', tone:'r2', hist:'Pass 2 (Good)',    err:false },
      { key:'pass_3',     abbr:'3',   label:'Perfect', stat:'receives', also:'pass_3', tone:'r3', hist:'Pass 3 (Perfect)', err:false },
    ]},
    { key:'dig_error',    abbr:'DE',  label:'Dig Err', stat:'digging_errors',                    err:true  },
  ]},
  { label: 'BLOCKING', actions: [
    { key:'block_solo',   abbr:'BS',  label:'Block',   stat:'blocks',                            err:false },
    { key:'block_assist', abbr:'BA',  label:'Blk Ast', stat:'block_assists',                     err:false },
    { key:'block_error',  abbr:'BE',  label:'Blk Err', stat:'blocking_errors',                   err:true  },
  ]},
  { label: 'BALL HANDLING', actions: [
    { key:'assist',       abbr:'A',   label:'Assist',  stat:'assists',                           err:false },
    { key:'bhe',          abbr:'BHE', label:'BH Err',  stat:'ball_handling_errors',              err:true  },
  ]},
];

// Flattened list of every pressable action, with the segmented RECEIVE group
// unwrapped. The scrimmage tracker's undo and history walk this.
export const ALL_ACTIONS = CATEGORIES.flatMap(c =>
  c.actions.flatMap(a => (a.group ? a.actions : [a]))
);
