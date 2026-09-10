/* =====================================================================
   Générateur de sons de référence (synthèse additive Web Audio)
   Timbres : pur (sinus), bois (harmoniques impairs, type clarinette),
             anche double (2e harmonique dominant, type hautbois),
             cuivre (série harmonique décroissante, type cor/trompette).
   ===================================================================== */

const TIMBRES = {
  pur:    { label: 'Pur (sinus)',   partials: [1] },
  bois:   { label: 'Bois',          partials: [1, 0.05, 0.55, 0.05, 0.32, 0.04, 0.16, 0.02, 0.08] },
  anche:  { label: 'Anche double',  partials: [0.55, 1, 0.8, 0.55, 0.4, 0.3, 0.2, 0.12, 0.08] },
  cuivre: { label: 'Cuivre',        partials: [1, 0.75, 0.55, 0.4, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05] }
};

class ToneGenerator {
  constructor(getContext) {
    this.getContext = getContext;   // fonction retournant l'AudioContext (créé après geste utilisateur)
    this.waves = {};
    this.master = null;
    this.drone = null;
    this.volume = 0.5;
  }

  _ensure() {
    const ctx = this.getContext();
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
    }
    return ctx;
  }

  _wave(ctx, timbre) {
    if (!this.waves[timbre]) {
      const partials = (TIMBRES[timbre] || TIMBRES.pur).partials;
      const real = new Float32Array(partials.length + 1);
      const imag = new Float32Array(partials.length + 1);
      partials.forEach((a, i) => { imag[i + 1] = a; });
      this.waves[timbre] = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }
    return this.waves[timbre];
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.getContext().currentTime, 0.02);
  }

  _voice(ctx, freq, timbre) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this._wave(ctx, timbre));
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(12000, Math.max(1500, freq * 10));
    filter.Q.value = 0.5;
    const env = ctx.createGain();
    env.gain.value = 0;
    osc.connect(filter).connect(env).connect(this.master);
    return { osc, env, filter };
  }

  /** Joue une note pendant `duration` secondes. */
  play(freq, timbre = 'cuivre', duration = 2) {
    const ctx = this._ensure();
    const v = this._voice(ctx, freq, timbre);
    const t = ctx.currentTime;
    v.env.gain.setValueAtTime(0, t);
    v.env.gain.linearRampToValueAtTime(0.9, t + 0.04);
    v.env.gain.setValueAtTime(0.9, t + duration - 0.25);
    v.env.gain.linearRampToValueAtTime(0, t + duration);
    v.osc.start(t);
    v.osc.stop(t + duration + 0.05);
  }

  /** Démarre un bourdon continu (ou change sa fréquence s'il est déjà actif). */
  startDrone(freq, timbre = 'cuivre') {
    const ctx = this._ensure();
    if (this.drone && this.drone.timbre === timbre) {
      this.drone.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
      return;
    }
    this.stopDrone();
    const v = this._voice(ctx, freq, timbre);
    v.timbre = timbre;
    const t = ctx.currentTime;
    v.env.gain.setValueAtTime(0, t);
    v.env.gain.linearRampToValueAtTime(0.8, t + 0.15);
    v.osc.start(t);
    this.drone = v;
  }

  stopDrone() {
    if (!this.drone) return;
    const ctx = this.getContext();
    const t = ctx.currentTime;
    const d = this.drone;
    d.env.gain.cancelScheduledValues(t);
    d.env.gain.setValueAtTime(d.env.gain.value, t);
    d.env.gain.linearRampToValueAtTime(0, t + 0.2);
    d.osc.stop(t + 0.25);
    this.drone = null;
  }

  get droneActive() { return !!this.drone; }

  /** Petit carillon de réussite. */
  chime() {
    const ctx = this._ensure();
    const t = ctx.currentTime;
    [1318.5, 1760, 2637].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.25, t + i * 0.07 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.6);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.65);
    });
  }
}
