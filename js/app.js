/* =====================================================================
   Accordeur d'Harmonie — application principale
   ===================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const HOLD_MS = 2000;            // durée à tenir juste pour valider une note
  const VOICED_TIMEOUT = 250;      // ms sans détection avant de considérer le silence

  /* ------------------------------------------------------------------
     Réglages persistants
     ------------------------------------------------------------------ */
  const STORAGE_KEY = 'accordeur-harmonie-v1';
  const DEFAULTS = {
    instrument: 'clar-sib', a4: 442, notation: 'fr', octaves: 'fr', accidentals: 'flat',
    tolerance: 5, gate: -58, targetMode: 'auto', targetPc: 10, timbre: 'cuivre', volume: 0.5,
    sounds: true, strobe: true, haptics: true, tonePc: 0, toneOctave: null,
    bestStreak: 0, bestChallenge: null, panels: null
  };
  const S = Object.assign({}, DEFAULTS);
  try { Object.assign(S, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch (e) { /* ignore */ }
  if (!INSTRUMENTS.some(i => i.id === S.instrument)) S.instrument = DEFAULTS.instrument;
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  /* ------------------------------------------------------------------
     Noms de notes
     ------------------------------------------------------------------ */
  const NAMES = {
    fr: {
      sharp: ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'],
      flat:  ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si']
    },
    int: {
      sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
      flat:  ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
    }
  };
  const pcName = pc => NAMES[S.notation][S.accidentals][MusicMath.mod12(pc)];
  const sciOctave = midi => Math.floor(midi / 12) - 1;
  const octaveOf = midi => S.octaves === 'fr' ? sciOctave(midi) - 1 : sciOctave(midi);
  const noteLabel = midi => pcName(midi) + octaveOf(midi);
  const inst = () => getInstrument(S.instrument);
  const written = concertMidi => concertMidi + inst().transpose;
  const fmt1 = n => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* ------------------------------------------------------------------
     Éléments DOM
     ------------------------------------------------------------------ */
  const el = {
    chipInstrument: $('#chipInstrument'), chipA4: $('#chipA4'),
    targetLabel: $('#targetLabel'), levelFill: $('#levelFill'), levelGate: $('#levelGate'),
    gauge: $('#gauge'), fx: $('#fx'), trace: $('#trace'), holdFill: $('#holdFill'),
    readout: $('#readout'), noteName: $('#noteName'), noteOctave: $('#noteOctave'), noteConcert: $('#noteConcert'),
    centsValue: $('#centsValue'), hzText: $('#hzText'), verdict: $('#verdict'), advice: $('#advice'),
    startOverlay: $('#startOverlay'), btnStart: $('#btnStart'), startError: $('#startError'),
    instrumentSelect: $('#instrumentSelect'), transposeInfo: $('#transposeInfo'),
    a4Input: $('#a4Input'), a4Range: $('#a4Range'), btnCalibrate: $('#btnCalibrate'),
    targetMode: $('#targetMode'), customTarget: $('#customTarget'), targetPc: $('#targetPc'), targetHint: $('#targetHint'),
    btnPlayA: $('#btnPlayA'), btnPlayBb: $('#btnPlayBb'), toneInstrumentName: $('#toneInstrumentName'),
    pcGrid: $('#pcGrid'), toneOctave: $('#toneOctave'), timbreSelect: $('#timbreSelect'),
    btnPlayNote: $('#btnPlayNote'), btnDrone: $('#btnDrone'), volume: $('#volume'),
    statStreak: $('#statStreak'), statBest: $('#statBest'), statAccuracy: $('#statAccuracy'), statGrade: $('#statGrade'),
    challengeBest: $('#challengeBest'), challengeSteps: $('#challengeSteps'), challengeCurrent: $('#challengeCurrent'),
    btnChallenge: $('#btnChallenge'), btnChallengeStop: $('#btnChallengeStop'),
    toleranceSeg: $('#toleranceSeg'), gate: $('#gate'), notationSeg: $('#notationSeg'), accidentalSeg: $('#accidentalSeg'),
    octaveSeg: $('#octaveSeg'), chkSound: $('#chkSound'), chkHaptics: $('#chkHaptics'), chkStrobe: $('#chkStrobe'), btnStop: $('#btnStop'), btnReset: $('#btnReset'),
    btnFullscreen: $('#btnFullscreen'), qbInstrument: $('#qbInstrument'), qbInstrumentLabel: $('#qbInstrumentLabel'), qbA4: $('#qbA4'),
    qbA4Value: $('#qbA4Value'), qbTarget: $('#qbTarget'), qbPlayBb: $('#qbPlayBb'), qbDrone: $('#qbDrone')
  };
  const isMobileLayout = () => window.matchMedia('(max-width: 1039px)').matches;

  /* ------------------------------------------------------------------
     Audio
     ------------------------------------------------------------------ */
  let audioCtx = null, analyser = null, stream = null, detector = null, timeBuf = null, running = false;
  let worker = null, workerBusy = false, workerId = 0, pendingNow = 0;

  /* Le calcul YIN tourne dans un Web Worker (fil séparé) : l'interface reste fluide
     même sur un smartphone modeste. Repli sur le fil principal si le worker est indisponible. */
  function initWorker() {
    if (worker || typeof Worker === 'undefined') return;
    try {
      worker = new Worker('js/pitch-worker.js');
      worker.onmessage = e => { workerBusy = false; onDetected(e.data, pendingNow); };
      worker.onerror = () => { worker = null; workerBusy = false; };
    } catch (e) { worker = null; }
  }

  /* Maintien de l'écran allumé pendant l'accordage (Android / Chrome / Safari 16.4+) */
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  const getCtx = () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    return audioCtx;
  };
  const tone = new ToneGenerator(getCtx);

  function showStartError(msg) { el.startError.textContent = msg; el.startError.hidden = false; }

  async function startMic() {
    el.startError.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showStartError('Ce navigateur ne permet pas l’accès au micro. Ouvrez la page en HTTPS (ou sur localhost) avec une version récente de Chrome, Edge, Firefox ou Safari.');
      return;
    }
    try {
      const ctx = getCtx();
      await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false
      });
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 20; hp.Q.value = 0.7;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      src.connect(hp);
      hp.connect(analyser);
      timeBuf = new Float32Array(analyser.fftSize);
      detector = new YinDetector(ctx.sampleRate, analyser.fftSize, 0.15);
      initWorker();
      running = true;
      el.startOverlay.classList.add('hidden');
      requestWakeLock();
    } catch (e) {
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      showStartError(denied
        ? 'Accès au micro refusé. Autorisez le micro pour ce site dans les réglages du navigateur, puis réessayez.'
        : 'Impossible d’ouvrir le micro : ' + (e && e.message ? e.message : e));
    }
  }

  function stopMic() {
    running = false;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; analyser = null;
    det.lastVoiced = -1e9;
    releaseWakeLock();
    el.startOverlay.classList.remove('hidden');
  }

  /* ------------------------------------------------------------------
     Détection & état
     ------------------------------------------------------------------ */
  const det = { freq: null, midi: null, cents: 0, lastVoiced: -1e9, rmsDb: -100, history: [] };
  const smooth = { needle: 0, cents: 0, strobe: 0 };
  const recent = [];
  let lastDetect = 0, lastFrame = 0;

  function currentTargetPc() {
    if (challenge.active) return challenge.pcs[challenge.index];
    if (S.targetMode === 'bb') return 10;
    if (S.targetMode === 'a') return 9;
    if (S.targetMode === 'custom') return S.targetPc;
    return null;
  }

  function resolveTarget(freq) {
    const m = MusicMath.freqToMidi(freq, S.a4);
    const pc = currentTargetPc();
    const target = pc === null ? Math.round(m) : pc + 12 * Math.round((m - pc) / 12);
    return { midi: target, cents: (m - target) * 100 };
  }

  function detectStep(now) {
    const i = inst();
    const fmin = Math.max(24, MusicMath.midiToFreq(i.low - 3, S.a4));
    const fmax = Math.min(4600, MusicMath.midiToFreq(i.high + 3, S.a4));
    const gateRms = Math.pow(10, (S.gate - 6) / 20);   // pré-filtre : pas d'analyse en silence
    if (worker) {
      if (workerBusy) return;
      const buf = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buf);
      workerBusy = true; pendingNow = now;
      worker.postMessage({ buf, sampleRate: audioCtx.sampleRate, fmin, fmax, gateRms, id: ++workerId }, [buf.buffer]);
    } else {
      analyser.getFloatTimeDomainData(timeBuf);
      onDetected(detector.detect(timeBuf, fmin, fmax, gateRms), now);
    }
  }

  function onDetected(r, now) {
    if (!running) return;
    const i = inst();
    const fmin = Math.max(24, MusicMath.midiToFreq(i.low - 3, S.a4));
    const fmax = Math.min(4600, MusicMath.midiToFreq(i.high + 3, S.a4));
    det.rmsDb = 20 * Math.log10(r.rms + 1e-9);
    let freq = null;
    if (det.rmsDb > S.gate && r.freq && r.clarity > 0.6 && r.freq >= fmin && r.freq <= fmax) freq = r.freq;
    if (freq) {
      recent.push(freq);
      if (recent.length > 3) recent.shift();
      const sorted = recent.slice().sort((a, b) => a - b);
      det.freq = sorted[sorted.length >> 1];
      const res = resolveTarget(det.freq);
      det.midi = res.midi;
      det.cents = res.cents;
      det.lastVoiced = now;
    } else {
      recent.length = 0;
    }
    det.history.push({ t: now, cents: freq ? det.cents : null });
    while (det.history.length && now - det.history[0].t > 8000) det.history.shift();
  }

  /* ------------------------------------------------------------------
     Jeu : série, justesse, défi
     ------------------------------------------------------------------ */
  const game = { holdMs: 0, streak: 0, samples: 0, absSum: 0, lockedMidi: null, lastMidi: null, changeMs: 0, silenceMs: 0, badMs: 0 };
  const challenge = { active: false, pcs: [], labels: [], index: 0, start: 0 };
  const PRAISE = ['Parfait !', 'Superbe !', 'Impeccable !', 'Juste !', 'Bravo !', 'Magnifique !', 'Quelle justesse !'];

  function gameStep(dt, voiced, inTune) {
    if (voiced) {
      game.silenceMs = 0;
      game.samples++;
      game.absSum += Math.min(50, Math.abs(det.cents));
      if (det.midi !== game.lastMidi) { game.lastMidi = det.midi; game.holdMs = 0; game.badMs = 0; }
      if (game.lockedMidi !== null && det.midi !== game.lockedMidi) {
        game.changeMs += dt;
        if (game.changeMs > 250) game.lockedMidi = null;
      } else game.changeMs = 0;

      if (inTune) {
        game.badMs = 0;
        if (game.lockedMidi === null) {
          game.holdMs += dt;
          if (game.holdMs >= HOLD_MS) onSuccess();
        }
      } else {
        game.holdMs = Math.max(0, game.holdMs - dt * 1.5);
        if (game.badMs >= 0) {
          game.badMs += dt;
          if (game.badMs > 3000 && game.streak > 0) { game.streak = 0; game.badMs = -1; updateStats(); }
        }
      }
    } else {
      game.holdMs = Math.max(0, game.holdMs - dt * 2);
      game.silenceMs += dt;
      if (game.silenceMs > 400) { game.lockedMidi = null; game.lastMidi = null; game.badMs = 0; }
    }
    el.holdFill.style.strokeDashoffset = 289 * (1 - clamp(game.holdMs / HOLD_MS, 0, 1));
  }

  function onSuccess() {
    game.holdMs = 0;
    game.lockedMidi = det.midi;
    game.streak++;
    if (game.streak > S.bestStreak) { S.bestStreak = game.streak; save(); }
    bump(el.statStreak);
    updateStats();
    spawnConfetti();
    if (S.sounds) tone.chime();
    if (S.haptics && navigator.vibrate) { try { navigator.vibrate([30, 40, 30]); } catch (e) { /* ignore */ } }
    if (challenge.active) {
      challenge.index++;
      if (challenge.index >= challenge.pcs.length) finishChallenge();
      else { renderChallenge(); showVerdict(PRAISE[Math.floor(Math.random() * PRAISE.length)]); }
    } else {
      showVerdict(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
    }
  }

  let verdictTimer = null;
  function showVerdict(text, ms = 1400) {
    el.verdict.textContent = text;
    el.verdict.classList.add('show');
    clearTimeout(verdictTimer);
    verdictTimer = setTimeout(() => el.verdict.classList.remove('show'), ms);
  }
  function bump(node) {
    const stat = node.closest('.stat');
    stat.classList.remove('bump'); void stat.offsetWidth; stat.classList.add('bump');
  }
  function gradeFor(avg) {
    if (avg <= 3) return 'A+'; if (avg <= 5) return 'A'; if (avg <= 8) return 'B';
    if (avg <= 12) return 'C'; if (avg <= 20) return 'D'; return 'E';
  }
  function updateStats() {
    el.statStreak.textContent = game.streak;
    el.statBest.textContent = S.bestStreak;
    if (game.samples > 0) {
      const avg = game.absSum / game.samples;
      el.statAccuracy.textContent = fmt1(avg) + ' ¢';
      el.statGrade.textContent = gradeFor(avg);
    } else { el.statAccuracy.textContent = '—'; el.statGrade.textContent = '—'; }
    el.challengeBest.textContent = S.bestChallenge ? 'Record : ' + fmt1(S.bestChallenge) + ' s' : 'Jouez la gamme de Do écrite, note par note.';
  }

  /* --- Défi gamme : gamme majeure de Do ÉCRITE pour l'instrument --- */
  const SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
  function buildChallenge() {
    const t = inst().transpose;
    challenge.pcs = SCALE.map(w => MusicMath.mod12(w - t));
    challenge.labels = SCALE.map(w => pcName(w));
  }
  function startChallenge() {
    buildChallenge();
    challenge.active = true; challenge.index = 0; challenge.start = performance.now();
    game.lockedMidi = null; game.holdMs = 0;
    el.btnChallenge.hidden = true; el.btnChallengeStop.hidden = false;
    renderChallenge(); updateTargetLabel();
  }
  function stopChallenge() {
    challenge.active = false;
    el.btnChallenge.hidden = false; el.btnChallengeStop.hidden = true;
    el.challengeCurrent.hidden = true;
    renderChallenge(); updateTargetLabel();
  }
  function finishChallenge() {
    const secs = (performance.now() - challenge.start) / 1000;
    const record = !S.bestChallenge || secs < S.bestChallenge;
    if (record) { S.bestChallenge = secs; save(); }
    stopChallenge();
    updateStats();
    showVerdict((record ? 'Nouveau record ! ' : 'Défi réussi en ') + fmt1(secs) + ' s', 3000);
    spawnConfetti(160);
  }
  function renderChallenge() {
    if (!challenge.pcs.length || !challenge.active) buildChallenge();
    el.challengeSteps.innerHTML = challenge.labels.map((l, i) => {
      const cls = challenge.active ? (i < challenge.index ? 'done' : i === challenge.index ? 'current' : '') : '';
      return `<div class="step ${cls}">${l}</div>`;
    }).join('');
    if (challenge.active) {
      el.challengeCurrent.hidden = false;
      el.challengeCurrent.innerHTML = `Jouez&nbsp;: <b>${challenge.labels[challenge.index]}</b> (écrit) — tenez-le juste 2 s.`;
    }
  }

  /* ------------------------------------------------------------------
     Rendu : jauge, strobe, trace, confettis
     ------------------------------------------------------------------ */
  const gctx = el.gauge.getContext('2d');
  const fctx = el.fx.getContext('2d');
  const tctx = el.trace.getContext('2d');
  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);   // 2× suffit et ménage le GPU des téléphones
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { W: r.width, H: r.height, dpr };
  }
  const START_DEG = 150, SWEEP_DEG = 240;
  const centsToAngle = c => (START_DEG + ((clamp(c, -50, 50) + 50) / 100) * SWEEP_DEG) * Math.PI / 180;
  const COLORS = { green: '94,227,154', amber: '245,196,81', red: '255,107,122', gold: '214,184,107', ivory: '244,239,228' };
  const zoneColor = c => Math.abs(c) <= S.tolerance ? COLORS.green : Math.abs(c) <= 20 ? COLORS.amber : COLORS.red;

  /* Couche statique (segments éteints, graduations, étiquettes) dessinée une seule fois
     par taille / tolérance, puis recopiée à chaque image : le coût par image reste minime. */
  const staticLayer = { canvas: document.createElement('canvas'), key: '' };
  function drawStaticLayer(W, H, dpr) {
    const key = `${W}x${H}x${dpr}x${S.tolerance}`;
    if (staticLayer.key === key) return;
    staticLayer.key = key;
    const cv = staticLayer.canvas;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H * 0.57, R = W * 0.37;
    c.lineCap = 'butt';
    c.lineWidth = Math.max(8, W * 0.028);
    const gap = 0.12;
    for (let i = 0; i < 100; i++) {
      const v = -50 + i + 0.5;
      const a0 = centsToAngle(-50 + i), a1 = centsToAngle(-50 + i + 1);
      const stepA = a1 - a0;
      c.strokeStyle = `rgba(${zoneColor(v)},${Math.abs(v) <= S.tolerance ? 0.28 : 0.13})`;
      c.beginPath();
      c.arc(cx, cy, R, a0 + stepA * gap / 2, a1 - stepA * gap / 2);
      c.stroke();
    }
    const lw = c.lineWidth;
    c.lineCap = 'round';
    for (let v = -50; v <= 50; v += 5) {
      const a = centsToAngle(v);
      const major = v % 25 === 0, mid = v % 10 === 0;
      const r0 = R - lw * 0.5 - 8, len = major ? 14 : mid ? 9 : 5;
      c.lineWidth = major ? 2 : 1.2;
      c.strokeStyle = major ? `rgba(${COLORS.ivory},0.7)` : `rgba(${COLORS.ivory},0.28)`;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * (r0 - len), cy + Math.sin(a) * (r0 - len));
      c.stroke();
      if (major) {
        const rl = r0 - len - 14;
        c.fillStyle = v === 0 ? `rgba(${COLORS.gold},0.95)` : `rgba(${COLORS.ivory},0.55)`;
        c.font = `700 ${Math.max(10, W * 0.024)}px Manrope, system-ui, sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(v === 0 ? '0' : (v > 0 ? '+' + v : '−' + Math.abs(v)), cx + Math.cos(a) * rl, cy + Math.sin(a) * rl);
      }
    }
  }

  function drawGauge(voiced, inTune) {
    const { W, H, dpr } = sizeCanvas(el.gauge);
    const c = gctx;
    drawStaticLayer(W, H, dpr);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, el.gauge.width, el.gauge.height);
    c.drawImage(staticLayer.canvas, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = W / 2, cy = H * 0.57, R = W * 0.37;
    const needle = smooth.needle;

    // Segments allumés entre 0 et l'aiguille
    c.lineCap = 'butt';
    c.lineWidth = Math.max(8, W * 0.028);
    const gap = 0.12;
    if (voiced) {
      const from = Math.min(0, needle), to = Math.max(0, needle);
      const i0 = Math.max(0, Math.floor(from + 50 - 0.6)), i1 = Math.min(99, Math.ceil(to + 50 + 0.6));
      for (let i = i0; i <= i1; i++) {
        const v = -50 + i + 0.5;
        if (!((needle >= 0 && v >= -0.6 && v <= needle) || (needle < 0 && v <= 0.6 && v >= needle))) continue;
        const a0 = centsToAngle(-50 + i), a1 = centsToAngle(-50 + i + 1);
        const stepA = a1 - a0;
        c.strokeStyle = `rgba(${zoneColor(v)},0.95)`;
        c.beginPath();
        c.arc(cx, cy, R, a0 + stepA * gap / 2, a1 - stepA * gap / 2);
        c.stroke();
      }
    }
    // Anneau stroboscopique
    if (S.strobe) {
      const rs = R + c.lineWidth + W * 0.035;
      const n = 36, dash = (Math.PI * 2 / n) * 0.5;
      const col = !voiced ? `rgba(${COLORS.ivory},0.08)` : inTune ? `rgba(${COLORS.green},0.6)` : `rgba(${COLORS.gold},0.35)`;
      c.lineWidth = Math.max(3, W * 0.012);
      c.lineCap = 'butt';
      c.strokeStyle = col;
      for (let i = 0; i < n; i++) {
        const a = smooth.strobe + (i * Math.PI * 2) / n;
        c.beginPath(); c.arc(cx, cy, rs, a, a + dash); c.stroke();
      }
    }

    // Aiguille
    const a = centsToAngle(needle);
    const tip = R - c.lineWidth - 4;
    const col = !voiced ? `rgba(${COLORS.ivory},0.35)` : inTune ? `rgb(${COLORS.green})` : `rgb(${COLORS.gold})`;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    if (voiced) {   // halo : aiguille élargie translucide (bien moins coûteux qu'un flou)
      c.fillStyle = col.replace('rgb(', 'rgba(').replace(')', ',0.22)');
      c.beginPath(); c.moveTo(tip + 3, 0); c.lineTo(R * 0.48, -9); c.lineTo(R * 0.48, 9); c.closePath(); c.fill();
    }
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(tip, 0);
    c.lineTo(R * 0.5, -3.2);
    c.lineTo(R * 0.5, 3.2);
    c.closePath();
    c.fill();
    c.restore();
    // Pivot discret
    c.beginPath();
    c.arc(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, 4, 0, Math.PI * 2);
    c.fillStyle = col;
    c.fill();
  }

  let lastTrace = 0;
  function drawTrace(now) {
    if (now - lastTrace < 33) return;
    lastTrace = now;
    const { W, H, dpr } = sizeCanvas(el.trace);
    const c = tctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const yOf = cents => H / 2 - (clamp(cents, -55, 55) / 55) * (H / 2 - 6);
    // Bande de tolérance
    c.fillStyle = `rgba(${COLORS.green},0.10)`;
    c.fillRect(0, yOf(S.tolerance), W, yOf(-S.tolerance) - yOf(S.tolerance));
    c.strokeStyle = `rgba(${COLORS.ivory},0.14)`;
    c.lineWidth = 1;
    [25, 0, -25].forEach(v => { c.beginPath(); c.moveTo(0, yOf(v)); c.lineTo(W, yOf(v)); c.stroke(); });
    c.strokeStyle = `rgba(${COLORS.gold},0.5)`;
    c.beginPath(); c.moveTo(0, yOf(0)); c.lineTo(W, yOf(0)); c.stroke();
    // Courbe
    const span = 8000;
    c.lineWidth = 2.2; c.lineJoin = 'round'; c.lineCap = 'round';
    let prev = null;
    for (const p of det.history) {
      const x = W * (1 - (now - p.t) / span);
      if (p.cents === null) { prev = null; continue; }
      if (prev) {
        c.strokeStyle = `rgba(${zoneColor(p.cents)},0.9)`;
        c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(x, yOf(p.cents)); c.stroke();
      }
      prev = { x, y: yOf(p.cents) };
    }
    if (prev) {
      c.fillStyle = `rgb(${zoneColor(det.cents)})`;
      c.beginPath(); c.arc(prev.x, prev.y, 3.5, 0, Math.PI * 2); c.fill();
    }
  }

  const particles = [];
  function spawnConfetti(n = 90) {
    const { W, H } = sizeCanvas(el.fx);
    const cols = ['214,184,107', '243,220,147', '94,227,154', '244,239,228'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5;
      particles.push({ x: W / 2, y: H * 0.57, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, rot: Math.random() * 6, vr: (Math.random() - .5) * .3, size: 3 + Math.random() * 4, col: cols[i % cols.length] });
    }
  }
  function drawFx(dt) {
    const { W, H, dpr } = sizeCanvas(el.fx);
    const c = fctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!particles.length) return;
    const k = dt / 16.7;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.12 * k; p.vx *= 0.99; p.rot += p.vr * k; p.life -= 0.014 * k;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      c.save();
      c.translate(p.x, p.y); c.rotate(p.rot);
      c.fillStyle = `rgba(${p.col},${p.life})`;
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      c.restore();
    }
  }

  /* ------------------------------------------------------------------
     Lecture (readout) & conseils
     ------------------------------------------------------------------ */
  function updateReadout(voiced, inTune) {
    const i = inst();
    el.readout.classList.toggle('idle', !voiced);
    if (voiced) {
      const w = written(det.midi);
      el.noteName.textContent = pcName(w);
      el.noteOctave.textContent = octaveOf(w);
      el.noteName.className = 'note ' + (inTune ? 'in-tune' : Math.abs(det.cents) <= 20 ? 'near' : 'far');
      el.noteConcert.textContent = i.transpose === 0 ? 'note réelle' : 'écrit · réel : ' + noteLabel(det.midi);
      const shown = Math.round(smooth.cents);
      el.centsValue.textContent = (shown > 0 ? '+' : shown < 0 ? '−' : '') + Math.abs(shown);
      el.hzText.textContent = fmt1(det.freq) + ' Hz';
      const tips = TIPS[i.tip] || TIPS.generique;
      if (inTune) { el.advice.textContent = 'Parfaitement juste — tenez la note !'; el.advice.className = 'advice ok'; }
      else if (det.cents > 0) { el.advice.textContent = `Trop haut (+${Math.round(det.cents)} ¢). ${tips.sharp}`; el.advice.className = 'advice warn'; }
      else { el.advice.textContent = `Trop bas (−${Math.abs(Math.round(det.cents))} ¢). ${tips.flat}`; el.advice.className = 'advice warn'; }
    } else {
      const pc = currentTargetPc();
      if (pc !== null) {
        el.noteName.textContent = pcName(pc + i.transpose);
        el.noteOctave.textContent = '';
        el.noteConcert.textContent = 'note à jouer (écrite)';
      } else {
        el.noteName.textContent = '—';
        el.noteOctave.textContent = '';
        el.noteConcert.textContent = running ? 'en écoute…' : 'micro inactif';
      }
      el.noteName.className = 'note';
      el.centsValue.textContent = '0';
      el.hzText.textContent = '— Hz';
      el.advice.textContent = challenge.active
        ? `Défi : jouez ${challenge.labels[challenge.index]} (écrit) et tenez-le.`
        : running ? 'Jouez une note tenue, bien soutenue…' : 'Activez le micro pour commencer.';
      el.advice.className = 'advice';
    }
    // Niveau d'entrée
    const lvl = clamp((det.rmsDb + 80) / 60, 0, 1);
    el.levelFill.style.width = (running ? lvl * 100 : 0) + '%';
    el.levelGate.style.left = (clamp((S.gate + 80) / 60, 0, 1) * 100) + '%';
  }

  /* ------------------------------------------------------------------
     Boucle principale
     ------------------------------------------------------------------ */
  function loop(now) {
    const dt = Math.min(100, now - (lastFrame || now));
    lastFrame = now;
    if (running && analyser && now - lastDetect >= 30) { lastDetect = now; detectStep(now); }
    const voiced = running && now - det.lastVoiced < VOICED_TIMEOUT;
    const inTune = voiced && Math.abs(det.cents) <= S.tolerance;
    const target = voiced ? clamp(det.cents, -50, 50) : 0;
    smooth.needle += (target - smooth.needle) * (voiced ? 0.22 : 0.06);
    smooth.cents += ((voiced ? det.cents : 0) - smooth.cents) * 0.3;
    if (voiced && !inTune) smooth.strobe += clamp(det.cents, -50, 50) * 0.0012 * (dt / 16.7);
    gameStep(dt, voiced, inTune);
    updateReadout(voiced, inTune);
    drawGauge(voiced, inTune);
    drawTrace(now);
    drawFx(dt);
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------
     Interface : instrument
     ------------------------------------------------------------------ */
  function buildInstrumentSelect() {
    const groups = {};
    INSTRUMENTS.forEach(i => { (groups[i.family] = groups[i.family] || []).push(i); });
    el.instrumentSelect.innerHTML = Object.keys(FAMILY_LABELS).map(f => groups[f] ? `<optgroup label="${FAMILY_LABELS[f]}">` +
      groups[f].map(i => `<option value="${i.id}">${i.label}</option>`).join('') + '</optgroup>' : '').join('');
    el.instrumentSelect.value = S.instrument;
  }

  function tuningBbMidi() {
    const i = inst();
    const mid = (i.low + i.high) / 2;
    return clamp(10 + 12 * Math.round((mid - 10) / 12), i.low, i.high);
  }

  function refreshInstrumentUI() {
    const i = inst();
    el.instrumentSelect.value = i.id;
    el.chipInstrument.textContent = i.label;
    el.qbInstrumentLabel.textContent = i.label.replace(/\s*\(.*$/, '');
    el.transposeInfo.textContent = describeTransposition(i.transpose);
    el.toneInstrumentName.textContent = i.label;
    buildPcGrid();
    buildOctaveSelect();
    buildTargetPcSelect();
    updateTargetLabel();
    if (challenge.active) stopChallenge(); else renderChallenge();
    el.btnPlayBb.textContent = `▶ Si♭ d’accord (${pcName(10 + i.transpose)} écrit)`;
    el.btnPlayBb.title = 'Note réelle : ' + noteLabel(tuningBbMidi());
  }

  /* --- Générateur --- */
  function buildPcGrid() {
    const t = inst().transpose;
    el.pcGrid.innerHTML = Array.from({ length: 12 }, (_, p) =>
      `<button data-pc="${p}" class="${p === S.tonePc ? 'active' : ''}">${pcName(p)}${t !== 0 ? `<small>${pcName(p - t)} réel</small>` : ''}</button>`).join('');
  }
  function buildOctaveSelect() {
    const i = inst();
    const lo = sciOctave(i.low + i.transpose), hi = sciOctave(i.high + i.transpose);
    if (S.toneOctave === null || S.toneOctave < lo || S.toneOctave > hi) S.toneOctave = sciOctave(tuningBbMidi() + i.transpose);
    el.toneOctave.innerHTML = '';
    for (let o = lo; o <= hi; o++) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = S.octaves === 'fr' ? o - 1 : o;
      el.toneOctave.appendChild(opt);
    }
    el.toneOctave.value = S.toneOctave;
  }
  function selectedToneFreq() {
    const writtenMidi = (S.toneOctave + 1) * 12 + S.tonePc;
    return MusicMath.midiToFreq(writtenMidi - inst().transpose, S.a4);
  }
  function refreshDrone() { if (tone.droneActive) tone.startDrone(selectedToneFreq(), S.timbre); }
  function toggleDrone() {
    getCtx().resume();
    if (tone.droneActive) tone.stopDrone(); else tone.startDrone(selectedToneFreq(), S.timbre);
    el.btnDrone.classList.toggle('active', tone.droneActive);
    el.qbDrone.classList.toggle('on', tone.droneActive);
  }

  /* --- Cible --- */
  function buildTargetPcSelect() {
    const t = inst().transpose;
    el.targetPc.innerHTML = Array.from({ length: 12 }, (_, p) =>
      `<option value="${p}">${pcName(p)} réel${t !== 0 ? ' → ' + pcName(p + t) + ' écrit' : ''}</option>`).join('');
    el.targetPc.value = S.targetPc;
  }
  function updateTargetLabel() {
    const pc = currentTargetPc();
    const t = inst().transpose;
    $$('button', el.targetMode).forEach(b => b.classList.toggle('active', b.dataset.mode === S.targetMode));
    el.qbTarget.classList.toggle('active', S.targetMode === 'bb' && !challenge.active);
    el.customTarget.hidden = S.targetMode !== 'custom';
    if (challenge.active) {
      el.targetLabel.textContent = `Défi gamme · ${challenge.index + 1}/${challenge.pcs.length}`;
      el.targetLabel.classList.add('locked');
    } else if (pc === null) {
      el.targetLabel.textContent = 'Détection automatique';
      el.targetLabel.classList.remove('locked');
    } else {
      el.targetLabel.textContent = `Cible : ${pcName(pc)} réel${t !== 0 ? ' · ' + pcName(pc + t) + ' écrit' : ''}`;
      el.targetLabel.classList.add('locked');
    }
    el.targetHint.textContent = pc === null
      ? 'L’accordeur reconnaît la note la plus proche. Verrouillez une cible pour accorder tout l’orchestre sur la même note.'
      : `Écart mesuré par rapport au ${pcName(pc)} réel${t !== 0 ? `, c’est-à-dire le ${pcName(pc + t)} écrit sur votre partition` : ''}.`;
  }

  /* --- Diapason --- */
  function setA4(v, from) {
    S.a4 = clamp(Math.round(v * 10) / 10, 415, 466);
    if (from !== 'input') el.a4Input.value = S.a4;
    if (from !== 'range') el.a4Range.value = S.a4;
    el.chipA4.textContent = `La = ${S.a4.toLocaleString('fr-FR')} Hz`;
    el.qbA4Value.textContent = S.a4.toLocaleString('fr-FR');
    $$('.preset').forEach(b => b.classList.toggle('active', +b.dataset.a4 === S.a4));
    refreshDrone();
    save();
  }
  function calibrate() {
    if (!(running && performance.now() - det.lastVoiced < VOICED_TIMEOUT && det.freq)) {
      showVerdict('Jouez d’abord la note de référence…', 1800); return;
    }
    const midi = Math.round(MusicMath.freqToMidi(det.freq, S.a4));
    const a4 = det.freq / Math.pow(2, (midi - 69) / 12);
    setA4(a4);
    showVerdict(`Diapason calibré : La = ${fmt1(S.a4)} Hz`, 2500);
  }

  /* --- Segments génériques --- */
  function bindSegmented(container, key, onChange) {
    $$('button', container).forEach(b => {
      b.classList.toggle('active', b.dataset.val === String(S[key]));
      b.addEventListener('click', () => {
        S[key] = isNaN(+b.dataset.val) ? b.dataset.val : +b.dataset.val;
        $$('button', container).forEach(x => x.classList.toggle('active', x === b));
        save(); if (onChange) onChange();
      });
    });
  }
  function refreshNames() { refreshInstrumentUI(); buildTargetPcSelect(); updateStats(); }
  function openPanel(id) {
    const d = document.getElementById(id);
    d.open = true;
    d.scrollIntoView({ behavior: 'smooth', block: isMobileLayout() ? 'start' : 'center' });
  }
  function applyPanelState() {
    const mobile = isMobileLayout();
    const defaults = { panelInstrument: true, panelReference: true, panelTone: false, panelGame: false, panelSettings: false };
    $$('details.panel').forEach(d => {
      d.open = mobile ? (S.panels && d.id in S.panels ? S.panels[d.id] : defaults[d.id]) : true;
    });
  }

  /* ------------------------------------------------------------------
     Liaisons d'événements
     ------------------------------------------------------------------ */
  function bind() {
    el.btnStart.addEventListener('click', startMic);
    el.btnStop.addEventListener('click', () => { stopMic(); if (tone.droneActive) toggleDrone(); });
    const openInstrument = () => {
      openPanel('panelInstrument');
      try { if (el.instrumentSelect.showPicker) el.instrumentSelect.showPicker(); else el.instrumentSelect.focus(); } catch (e) { el.instrumentSelect.focus(); }
    };
    el.chipInstrument.addEventListener('click', openInstrument);
    el.qbInstrument.addEventListener('click', openInstrument);
    el.chipA4.addEventListener('click', () => { openPanel('panelReference'); if (!isMobileLayout()) el.a4Input.focus(); });
    el.qbA4.addEventListener('click', () => openPanel('panelReference'));
    el.qbTarget.addEventListener('click', () => {
      if (challenge.active) stopChallenge();
      S.targetMode = S.targetMode === 'bb' ? 'auto' : 'bb'; save(); updateTargetLabel();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    el.qbPlayBb.addEventListener('click', () => el.btnPlayBb.click());
    el.btnFullscreen.addEventListener('click', () => {
      const d = document;
      if (d.fullscreenElement) { d.exitFullscreen(); return; }
      const root = d.documentElement;
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      if (req) req.call(root, { navigationUI: 'hide' }).catch(() => {});
    });
    if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) el.btnFullscreen.hidden = true;

    // Panneaux repliables : état mémorisé, toujours ouverts sur grand écran
    $$('details.panel').forEach(d => {
      d.addEventListener('toggle', () => {
        if (!isMobileLayout()) return;
        S.panels = S.panels || {}; S.panels[d.id] = d.open; save();
      });
    });
    window.matchMedia('(max-width: 1039px)').addEventListener('change', applyPanelState);

    el.instrumentSelect.addEventListener('change', () => { S.instrument = el.instrumentSelect.value; S.toneOctave = null; save(); refreshInstrumentUI(); refreshDrone(); });

    el.a4Range.addEventListener('input', () => setA4(+el.a4Range.value, 'range'));
    el.a4Input.addEventListener('change', () => setA4(+el.a4Input.value || 440, 'input'));
    $$('.preset').forEach(b => b.addEventListener('click', () => setA4(+b.dataset.a4)));
    el.btnCalibrate.addEventListener('click', calibrate);

    $$('button', el.targetMode).forEach(b => b.addEventListener('click', () => { S.targetMode = b.dataset.mode; save(); updateTargetLabel(); }));
    el.targetPc.addEventListener('change', () => { S.targetPc = +el.targetPc.value; save(); updateTargetLabel(); });

    el.btnPlayA.addEventListener('click', () => { getCtx().resume(); tone.play(S.a4, S.timbre, 2); });
    el.btnPlayBb.addEventListener('click', () => { getCtx().resume(); tone.play(MusicMath.midiToFreq(tuningBbMidi(), S.a4), S.timbre, 2); });
    el.pcGrid.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.tonePc = +b.dataset.pc; save();
      $$('button', el.pcGrid).forEach(x => x.classList.toggle('active', x === b));
      if (tone.droneActive) refreshDrone(); else { getCtx().resume(); tone.play(selectedToneFreq(), S.timbre, 1.2); }
    });
    el.toneOctave.addEventListener('change', () => { S.toneOctave = +el.toneOctave.value; save(); refreshDrone(); });
    el.timbreSelect.innerHTML = Object.keys(TIMBRES).map(k => `<option value="${k}">${TIMBRES[k].label}</option>`).join('');
    el.timbreSelect.value = S.timbre;
    el.timbreSelect.addEventListener('change', () => { S.timbre = el.timbreSelect.value; save(); if (tone.droneActive) tone.startDrone(selectedToneFreq(), S.timbre); });
    el.btnPlayNote.addEventListener('click', () => { getCtx().resume(); tone.play(selectedToneFreq(), S.timbre, 2); });
    el.btnDrone.addEventListener('click', toggleDrone);
    el.qbDrone.addEventListener('click', toggleDrone);
    el.volume.value = S.volume; tone.setVolume(S.volume);
    el.volume.addEventListener('input', () => { S.volume = +el.volume.value; tone.setVolume(S.volume); save(); });

    el.btnChallenge.addEventListener('click', () => { if (!running) startMic(); startChallenge(); });
    el.btnChallengeStop.addEventListener('click', stopChallenge);

    bindSegmented(el.toleranceSeg, 'tolerance');
    bindSegmented(el.notationSeg, 'notation', refreshNames);
    bindSegmented(el.accidentalSeg, 'accidentals', refreshNames);
    bindSegmented(el.octaveSeg, 'octaves', refreshNames);
    el.gate.value = S.gate;
    el.gate.addEventListener('input', () => { S.gate = +el.gate.value; save(); });
    el.chkSound.checked = S.sounds;
    el.chkSound.addEventListener('change', () => { S.sounds = el.chkSound.checked; save(); });
    el.chkHaptics.checked = S.haptics;
    el.chkHaptics.addEventListener('change', () => { S.haptics = el.chkHaptics.checked; save(); });
    if (!navigator.vibrate) el.chkHaptics.closest('.row').hidden = true;
    el.chkStrobe.checked = S.strobe;
    el.chkStrobe.addEventListener('change', () => { S.strobe = el.chkStrobe.checked; save(); });
    el.btnReset.addEventListener('click', () => {
      game.streak = 0; game.samples = 0; game.absSum = 0; S.bestStreak = 0; S.bestChallenge = null; save(); updateStats();
      showVerdict('Statistiques remises à zéro', 1500);
    });

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === ' ') { e.preventDefault(); running ? stopMic() : startMic(); }
      if (e.key.toLowerCase() === 'b') el.btnDrone.click();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { lastFrame = 0; return; }
      if (running) { requestWakeLock(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }
    });
  }

  /* ------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------ */
  buildInstrumentSelect();
  bind();
  applyPanelState();
  setA4(S.a4);
  refreshInstrumentUI();
  updateStats();
  updateReadout(false, false);
  requestAnimationFrame(loop);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne non disponible */ });
  }
})();
