/* =====================================================================
   Détection de hauteur — algorithme YIN (de Cheveigné & Kawahara, 2002)
   avec normalisation cumulative (CMNDF) et interpolation parabolique.
   Robuste pour les instruments à vent (harmoniques riches), les cuivres
   graves et la voix. Fonctionne sur un tampon temporel Float32Array.
   ===================================================================== */

class YinDetector {
  /**
   * @param {number} sampleRate  Fréquence d'échantillonnage (Hz)
   * @param {number} bufferSize  Taille du tampon d'analyse (échantillons)
   * @param {number} threshold   Seuil YIN (0.10 – 0.20 ; plus bas = plus strict)
   */
  constructor(sampleRate, bufferSize, threshold = 0.15) {
    this.sampleRate = sampleRate;
    this.bufferSize = bufferSize;
    this.threshold = threshold;
    this.d = new Float32Array((bufferSize >> 1) + 1);
  }

  /**
   * @param {Float32Array} buf   Signal temporel
   * @param {number} fmin        Fréquence minimale recherchée (Hz)
   * @param {number} fmax        Fréquence maximale recherchée (Hz)
   * @param {number} gateRms     Niveau RMS minimal (linéaire) ; en dessous, pas d'analyse
   * @returns {{freq: number|null, clarity: number, rms: number}}
   */
  detect(buf, fmin, fmax, gateRms = 0) {
    const N = buf.length;
    const sr = this.sampleRate;

    // Niveau RMS (pour le seuil de bruit)
    let sum = 0;
    for (let i = 0; i < N; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / N);
    if (rms < gateRms) return { freq: null, clarity: 0, rms };

    const tauMax = Math.min(Math.floor(sr / fmin), N >> 1);
    const tauMin = Math.max(2, Math.floor(sr / fmax));
    if (tauMin >= tauMax) return { freq: null, clarity: 0, rms };
    const W = N - tauMax;               // fenêtre d'intégration (≥ N/2)
    const d = this.d;

    // 1. Fonction de différence
    d[0] = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) {
        const diff = buf[j] - buf[j + tau];
        s += diff * diff;
      }
      d[tau] = s;
    }

    // 2. Différence normalisée par la moyenne cumulée
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // 3. Seuil absolu : première vallée sous le seuil, puis descente au minimum local
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (d[t] < this.threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // Pas de vallée franche : on prend le minimum global s'il est crédible
      let best = tauMin;
      for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
      if (d[best] > 0.35) return { freq: null, clarity: 1 - d[best], rms };
      tau = best;
    }
    const clarity = 1 - d[tau];

    // 4. Interpolation parabolique autour du minimum
    let refined = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = d[tau - 1], s1 = d[tau], s2 = d[tau + 1];
      const denom = s0 - 2 * s1 + s2;
      if (denom !== 0) {
        const delta = (s0 - s2) / (2 * denom);
        if (Math.abs(delta) < 1) refined = tau + delta;
      }
    }

    // 5. Aigu : affine la période en mesurant un multiple k·tau (résolution × k)
    if (refined < 80) {
      const k = Math.min(12, Math.floor(tauMax / refined));
      if (k >= 2) {
        const center = Math.round(refined * k);
        let best = -1;
        for (let t = Math.max(2, center - 3); t <= Math.min(tauMax - 1, center + 3); t++) {
          if (best < 0 || d[t] < d[best]) best = t;
        }
        if (best > 1 && best < tauMax && d[best] < 0.5) {
          const s0 = d[best - 1], s1 = d[best], s2 = d[best + 1];
          const denom = s0 - 2 * s1 + s2;
          let r2 = best;
          if (denom !== 0) { const delta = (s0 - s2) / (2 * denom); if (Math.abs(delta) < 1) r2 = best + delta; }
          const cand = r2 / k;
          if (Math.abs(1200 * Math.log2(cand / refined)) < 30) refined = cand;
        }
      }
    }

    return { freq: sr / refined, clarity, rms };
  }
}

/* --------- Utilitaires musicaux --------- */
const MusicMath = {
  midiToFreq(midi, a4 = 440) { return a4 * Math.pow(2, (midi - 69) / 12); },
  freqToMidi(freq, a4 = 440) { return 69 + 12 * Math.log2(freq / a4); },
  centsOff(freq, midi, a4 = 440) { return 1200 * Math.log2(freq / MusicMath.midiToFreq(midi, a4)); },
  mod12(n) { return ((n % 12) + 12) % 12; }
};
