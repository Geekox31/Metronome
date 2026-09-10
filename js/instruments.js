/* =====================================================================
   Accordeur d'Harmonie — Base de données des instruments
   ---------------------------------------------------------------------
   transpose : demi-tons à AJOUTER à la note réelle (concert) pour obtenir
               la note ÉCRITE sur la partition de l'instrument.
               Ex. clarinette en Si♭ : Do écrit = Si♭ réel  →  +2
   low / high : tessiture RÉELLE (numéros MIDI, La4 = 69) utilisée pour
                borner la détection et éviter les erreurs d'octave.
   tip : famille de conseils d'accord (voir TIPS).
   ===================================================================== */

const FAMILY_LABELS = {
  bois: 'Bois',
  cuivres: 'Cuivres',
  cordes: 'Cordes',
  percussions: 'Percussions',
  autres: 'Autres'
};

const INSTRUMENTS = [
  // ---------------- Bois ----------------
  { id: 'piccolo',        family: 'bois', label: 'Piccolo',                          transpose: -12, low: 72, high: 108, tip: 'tete' },
  { id: 'flute',          family: 'bois', label: 'Flûte traversière',                transpose: 0,   low: 59, high: 98,  tip: 'tete' },
  { id: 'flute-alto',     family: 'bois', label: 'Flûte alto (Sol)',                 transpose: 5,   low: 55, high: 91,  tip: 'tete' },
  { id: 'hautbois',       family: 'bois', label: 'Hautbois',                         transpose: 0,   low: 57, high: 93,  tip: 'anche' },
  { id: 'cor-anglais',    family: 'bois', label: 'Cor anglais (Fa)',                 transpose: 7,   low: 51, high: 84,  tip: 'anche' },
  { id: 'basson',         family: 'bois', label: 'Basson',                           transpose: 0,   low: 33, high: 77,  tip: 'bocal' },
  { id: 'contrebasson',   family: 'bois', label: 'Contrebasson',                     transpose: 12,  low: 21, high: 60,  tip: 'bocal' },
  { id: 'clar-mib',       family: 'bois', label: 'Petite clarinette (Mi♭)',          transpose: -3,  low: 54, high: 99,  tip: 'baril' },
  { id: 'clar-sib',       family: 'bois', label: 'Clarinette (Si♭)',                 transpose: 2,   low: 49, high: 95,  tip: 'baril' },
  { id: 'clar-alto',      family: 'bois', label: 'Clarinette alto (Mi♭)',            transpose: 9,   low: 41, high: 84,  tip: 'bocal' },
  { id: 'clar-basse',     family: 'bois', label: 'Clarinette basse (Si♭)',           transpose: 14,  low: 33, high: 79,  tip: 'bocal' },
  { id: 'clar-cb',        family: 'bois', label: 'Clarinette contrebasse (Si♭)',     transpose: 26,  low: 21, high: 67,  tip: 'bocal' },
  { id: 'sax-soprano',    family: 'bois', label: 'Saxophone soprano (Si♭)',          transpose: 2,   low: 55, high: 89,  tip: 'bocal-sax' },
  { id: 'sax-alto',       family: 'bois', label: 'Saxophone alto (Mi♭)',             transpose: 9,   low: 48, high: 82,  tip: 'bocal-sax' },
  { id: 'sax-tenor',      family: 'bois', label: 'Saxophone ténor (Si♭)',            transpose: 14,  low: 43, high: 77,  tip: 'bocal-sax' },
  { id: 'sax-baryton',    family: 'bois', label: 'Saxophone baryton (Mi♭)',          transpose: 21,  low: 35, high: 70,  tip: 'bocal-sax' },
  { id: 'sax-basse',      family: 'bois', label: 'Saxophone basse (Si♭)',            transpose: 26,  low: 30, high: 64,  tip: 'bocal-sax' },

  // ---------------- Cuivres ----------------
  { id: 'trompette-sib',  family: 'cuivres', label: 'Trompette (Si♭)',               transpose: 2,   low: 51, high: 90,  tip: 'coulisse' },
  { id: 'trompette-ut',   family: 'cuivres', label: 'Trompette (Ut)',                transpose: 0,   low: 53, high: 92,  tip: 'coulisse' },
  { id: 'cornet',         family: 'cuivres', label: 'Cornet (Si♭)',                  transpose: 2,   low: 51, high: 88,  tip: 'coulisse' },
  { id: 'bugle',          family: 'cuivres', label: 'Bugle (Si♭)',                   transpose: 2,   low: 51, high: 86,  tip: 'coulisse' },
  { id: 'cor',            family: 'cuivres', label: 'Cor d’harmonie (Fa)',      transpose: 7,   low: 34, high: 79,  tip: 'coulisse' },
  { id: 'saxhorn-alto',   family: 'cuivres', label: 'Saxhorn alto (Mi♭)',            transpose: 9,   low: 41, high: 80,  tip: 'coulisse' },
  { id: 'trombone',       family: 'cuivres', label: 'Trombone',                      transpose: 0,   low: 33, high: 79,  tip: 'coulisse-trb' },
  { id: 'trombone-basse', family: 'cuivres', label: 'Trombone basse',                transpose: 0,   low: 28, high: 72,  tip: 'coulisse-trb' },
  { id: 'euph-fa',        family: 'cuivres', label: 'Euphonium (clé de Fa, en Ut)',  transpose: 0,   low: 33, high: 75,  tip: 'coulisse' },
  { id: 'euph-sol',       family: 'cuivres', label: 'Euphonium / Saxhorn basse (clé de Sol, Si♭)', transpose: 14, low: 33, high: 75, tip: 'coulisse' },
  { id: 'tuba-fa',        family: 'cuivres', label: 'Tuba (clé de Fa, en Ut)',       transpose: 0,   low: 24, high: 67,  tip: 'coulisse' },
  { id: 'tuba-sib',       family: 'cuivres', label: 'Tuba Si♭ (clé de Sol)',         transpose: 14,  low: 24, high: 64,  tip: 'coulisse' },
  { id: 'tuba-mib',       family: 'cuivres', label: 'Tuba Mi♭ (clé de Sol)',         transpose: 21,  low: 28, high: 67,  tip: 'coulisse' },

  // ---------------- Cordes ----------------
  { id: 'contrebasse',    family: 'cordes', label: 'Contrebasse',                    transpose: 12,  low: 26, high: 69,  tip: 'corde' },
  { id: 'violoncelle',    family: 'cordes', label: 'Violoncelle',                    transpose: 0,   low: 36, high: 84,  tip: 'corde' },
  { id: 'guitare',        family: 'cordes', label: 'Guitare',                        transpose: 12,  low: 40, high: 84,  tip: 'corde' },
  { id: 'guitare-basse',  family: 'cordes', label: 'Guitare basse',                  transpose: 12,  low: 26, high: 67,  tip: 'corde' },

  // ---------------- Percussions ----------------
  { id: 'timbales',       family: 'percussions', label: 'Timbales',                  transpose: 0,   low: 36, high: 62,  tip: 'pedale' },
  { id: 'glockenspiel',   family: 'percussions', label: 'Glockenspiel',              transpose: -24, low: 79, high: 108, tip: 'lame' },
  { id: 'xylophone',      family: 'percussions', label: 'Xylophone',                 transpose: -12, low: 65, high: 108, tip: 'lame' },
  { id: 'marimba',        family: 'percussions', label: 'Marimba',                   transpose: 0,   low: 36, high: 96,  tip: 'lame' },
  { id: 'vibraphone',     family: 'percussions', label: 'Vibraphone',                transpose: 0,   low: 53, high: 89,  tip: 'lame' },

  // ---------------- Autres ----------------
  { id: 'chromatique',    family: 'autres', label: 'Chromatique (instrument en Ut)', transpose: 0,   low: 28, high: 108, tip: 'generique' },
  { id: 'voix',           family: 'autres', label: 'Voix',                           transpose: 0,   low: 36, high: 84,  tip: 'voix' }
];

/* Conseils d'accord : que faire si l'on joue trop HAUT (sharp) / trop BAS (flat) */
const TIPS = {
  tete:         { sharp: 'Tirez légèrement la tête de la flûte.',          flat: 'Enfoncez un peu la tête de la flûte.' },
  anche:        { sharp: 'Sortez légèrement l’anche, détendez l’embouchure.', flat: 'Enfoncez l’anche, soutenez davantage l’air.' },
  bocal:        { sharp: 'Tirez le bocal, détendez l’embouchure.',    flat: 'Enfoncez le bocal, soutenez la colonne d’air.' },
  'bocal-sax':  { sharp: 'Tirez le bec sur le bocal.',                     flat: 'Enfoncez le bec sur le bocal.' },
  baril:        { sharp: 'Tirez le baril (ou le pavillon pour le grave).', flat: 'Rentrez le baril, soutenez davantage.' },
  coulisse:     { sharp: 'Tirez la coulisse d’accord.',               flat: 'Rentrez la coulisse d’accord.' },
  'coulisse-trb': { sharp: 'Allongez la coulisse d’accord (ou la position).', flat: 'Raccourcissez la coulisse d’accord (ou la position).' },
  corde:        { sharp: 'Détendez la corde.',                              flat: 'Tendez la corde.' },
  pedale:       { sharp: 'Relâchez la pédale pour détendre la peau.',      flat: 'Appuyez la pédale pour tendre la peau.' },
  lame:         { sharp: 'Instrument non accordable : vérifiez le diapason de référence.', flat: 'Instrument non accordable : vérifiez le diapason de référence.' },
  voix:         { sharp: 'Détendez, baissez très légèrement.',             flat: 'Soutenez davantage le souffle, pensez plus haut.' },
  generique:    { sharp: 'Vous êtes trop haut : allongez / détendez.',     flat: 'Vous êtes trop bas : raccourcissez / tendez.' }
};

const INTERVAL_NAMES = {
  1: 'une seconde mineure', 2: 'une seconde majeure', 3: 'une tierce mineure', 4: 'une tierce majeure',
  5: 'une quarte', 6: 'un triton', 7: 'une quinte', 8: 'une sixte mineure', 9: 'une sixte majeure',
  10: 'une septième mineure', 11: 'une septième majeure', 12: 'une octave'
};

function describeTransposition(t) {
  if (t === 0) return 'Instrument en Ut : la note écrite est la note réelle.';
  const abs = Math.abs(t);
  const octaves = Math.floor(abs / 12);
  const rest = abs % 12;
  let name;
  if (octaves === 0) name = INTERVAL_NAMES[rest];
  else if (rest === 0) name = octaves === 1 ? 'une octave' : `${octaves} octaves`;
  else name = `${octaves === 1 ? 'une octave' : octaves + ' octaves'} + ${INTERVAL_NAMES[rest]}`;
  return `Instrument transpositeur : la note réelle sonne ${name} plus ${t > 0 ? 'bas' : 'haut'} que la note écrite.`;
}

function getInstrument(id) {
  return INSTRUMENTS.find(i => i.id === id) || INSTRUMENTS[0];
}
