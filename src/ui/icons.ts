/** Inline SVG glyphs for the skill bar (original shapes; see storyboard). */
export const ICONS: Record<string, string> = {
  generic: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="none" stroke="#8e8577" stroke-width="3"/></svg>',
  // Sepulcher Knight
  cleave: '<svg viewBox="0 0 40 40"><path d="M6 30 A16 16 0 0 1 34 30" fill="none" stroke="#cfe3ff" stroke-width="4" stroke-linecap="round"/><path d="M20 8v18" stroke="#6fa8dc" stroke-width="4" stroke-linecap="round"/></svg>',
  judgement: '<svg viewBox="0 0 40 40"><path d="M20 3 L20 30" stroke="#fff3d6" stroke-width="5" stroke-linecap="round"/><path d="M8 34 h24" stroke="#6fa8dc" stroke-width="5" stroke-linecap="round"/><path d="M12 12 h16" stroke="#6fa8dc" stroke-width="4"/></svg>',
  shieldRush: '<svg viewBox="0 0 40 40"><path d="M20 4 L32 9 V20 C32 28 26 33 20 36 C14 33 8 28 8 20 V9 Z" fill="#6fa8dc"/><path d="M4 20 h8" stroke="#fff" stroke-width="3"/></svg>',
  ironWard: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="none" stroke="#cfe3ff" stroke-width="3"/><path d="M20 8 L28 12 V21 C28 27 24 30 20 32 C16 30 12 27 12 21 V12 Z" fill="#6fa8dc"/></svg>',
  graveStomp: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="30" rx="15" ry="5" fill="none" stroke="#6fa8dc" stroke-width="3"/><path d="M14 6 h12 v14 h-12z" fill="#cfe3ff"/></svg>',
  bulwark: '<svg viewBox="0 0 40 40"><path d="M6 8 Q20 20 34 8 M6 32 Q20 20 34 32" fill="none" stroke="#6fa8dc" stroke-width="3.5" stroke-linecap="round"/><circle cx="20" cy="20" r="4" fill="#fff3d6"/></svg>',
  // Grave Hunter
  boltShot: '<svg viewBox="0 0 40 40"><path d="M6 20 h24" stroke="#c8e6a0" stroke-width="4" stroke-linecap="round"/><path d="M26 13 L34 20 L26 27z" fill="#7ed957"/></svg>',
  fanOfBolts: '<svg viewBox="0 0 40 40"><path d="M6 32 L30 8 M6 32 L34 20 M6 32 L20 4" stroke="#7ed957" stroke-width="3.5" stroke-linecap="round"/></svg>',
  vault: '<svg viewBox="0 0 40 40"><path d="M32 30 C26 8 14 8 8 30" fill="none" stroke="#c8e6a0" stroke-width="4" stroke-linecap="round"/><path d="M8 30 l6 -2 M8 30 l0 -6" stroke="#7ed957" stroke-width="3.5" stroke-linecap="round"/></svg>',
  caltrops: '<svg viewBox="0 0 40 40"><path d="M20 20 L20 6 M20 20 L8 30 M20 20 L32 30" stroke="#7ed957" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="20" r="3.5" fill="#c8e6a0"/></svg>',
  mark: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="12" fill="none" stroke="#7ed957" stroke-width="3"/><circle cx="20" cy="20" r="4" fill="#ff3ab0"/><path d="M20 3v6M20 31v6M3 20h6M31 20h6" stroke="#c8e6a0" stroke-width="3"/></svg>',
  rainOfBolts: '<svg viewBox="0 0 40 40"><path d="M10 6 v14 M20 4 v18 M30 6 v14" stroke="#7ed957" stroke-width="3.5" stroke-linecap="round"/><path d="M7 18 l3 6 l3 -6 M17 20 l3 6 l3 -6 M27 18 l3 6 l3 -6" fill="#c8e6a0"/><ellipse cx="20" cy="33" rx="14" ry="3" fill="none" stroke="#7ed957" stroke-width="2"/></svg>',
  // Pale Reaver
  rend: '<svg viewBox="0 0 40 40"><path d="M8 8 L32 32 M12 30 L30 12" stroke="#ff6b6b" stroke-width="4" stroke-linecap="round"/></svg>',
  whirl: '<svg viewBox="0 0 40 40"><path d="M20 6 A14 14 0 1 1 6 20" fill="none" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/><path d="M20 2 l6 4 l-6 4z" fill="#ff9a8a"/></svg>',
  leap: '<svg viewBox="0 0 40 40"><path d="M6 32 C12 6 28 6 34 32" fill="none" stroke="#c0392b" stroke-width="4" stroke-linecap="round"/><ellipse cx="34" cy="33" rx="5" ry="2" fill="#ff9a8a"/></svg>',
  frenzy: '<svg viewBox="0 0 40 40"><path d="M20 4 L14 20 h8 L16 36 L28 16 h-8 Z" fill="#ff6b6b"/></svg>',
  bleedStorm: '<svg viewBox="0 0 40 40"><path d="M12 6 c0 6 -5 8 -5 13 a5 5 0 0 0 10 0 c0 -5 -5 -7 -5 -13z M28 14 c0 6 -5 8 -5 13 a5 5 0 0 0 10 0 c0 -5 -5 -7 -5 -13z" fill="#c0392b"/></svg>',
  harvest: '<svg viewBox="0 0 40 40"><path d="M10 34 C10 14 26 8 34 6 C32 18 26 30 10 34z" fill="#c0392b"/><path d="M12 32 C18 22 24 16 30 12" stroke="#ff9a8a" stroke-width="2" fill="none"/></svg>',
  bolt: '<svg viewBox="0 0 40 40"><path d="M6 34 L34 6" stroke="#b89bff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="8" r="6" fill="#e8f7ff"/></svg>',
  orb: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#8b5cf6"/><circle cx="16" cy="16" r="6" fill="#dff6ff"/></svg>',
  nova: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="none" stroke="#ff7a1a" stroke-width="4"/><circle cx="20" cy="20" r="6" fill="#ffd27a"/></svg>',
  frost: '<svg viewBox="0 0 40 40"><path d="M20 4v32M4 20h32M9 9l22 22M31 9L9 31" stroke="#9cf1ff" stroke-width="3.5" stroke-linecap="round"/></svg>',
  rift: '<svg viewBox="0 0 40 40"><path d="M6 20 L20 6 L20 14 L34 20 L20 26 L20 34 Z" fill="#37d2f0"/><path d="M6 20 L14 20" stroke="#b89bff" stroke-width="4"/></svg>',
  cataclysm: '<svg viewBox="0 0 40 40"><path d="M22 2 L10 22 h9 L14 38 L30 16 h-9 L26 2z" fill="#dff6ff" stroke="#8b5cf6" stroke-width="2"/></svg>',
  potion: '<svg viewBox="0 0 40 40"><path d="M15 4h10v8l7 10v12a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V22l7-10z" fill="#c8283a"/><rect x="14" y="2" width="12" height="5" fill="#d9b56a"/></svg>',
};
