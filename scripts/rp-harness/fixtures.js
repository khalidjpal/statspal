// Fictional team for the RotationPal layout harness.
export const TEAM = { id: 'team-harness', name: 'Harbor Point Varsity', color: '#58a6ff' };

export const PLAYERS = [
  { id: 'p1', team_id: TEAM.id, name: 'Maya Okafor', jersey_number: '12', position: 'OH' },
  { id: 'p2', team_id: TEAM.id, name: 'Jess Tran', jersey_number: '4', position: 'S' },
  { id: 'p3', team_id: TEAM.id, name: 'Riley Castellanos-Whitmore', jersey_number: '9', position: 'MB' },
  { id: 'p4', team_id: TEAM.id, name: 'Ana Lindqvist', jersey_number: '7', position: 'OPP' },
  { id: 'p5', team_id: TEAM.id, name: 'Sofia Reyes', jersey_number: '15', position: 'OH' },
  { id: 'p6', team_id: TEAM.id, name: 'Kenzie Park', jersey_number: '', position: 'MB' },
  { id: 'p7', team_id: TEAM.id, name: 'Nora Castellanos', jersey_number: '18', position: 'L' },
  { id: 'p8', team_id: TEAM.id, name: 'Tess Albright', jersey_number: '10', position: 'DS' },
  { id: 'p9', team_id: TEAM.id, name: 'Priya Natarajan', jersey_number: '21', position: 'S' },
];

export const SESSION_ROW = {
  id: 'session-harness',
  team_id: TEAM.id,
  name: 'Five-one vs the big outside hitter',
  plans: {
    assigned_players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
    set_number: 1,
  },
};
