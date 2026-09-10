/* Web Worker : la détection YIN tourne hors du fil principal pour garder
   l'interface fluide à 60 images/s sur smartphone. */
importScripts('pitch.js');
let detector = null;
self.onmessage = e => {
  const { buf, sampleRate, fmin, fmax, gateRms, id } = e.data;
  if (!detector || detector.sampleRate !== sampleRate || detector.bufferSize !== buf.length) {
    detector = new YinDetector(sampleRate, buf.length, 0.15);
  }
  const r = detector.detect(buf, fmin, fmax, gateRms);
  self.postMessage({ id, freq: r.freq, clarity: r.clarity, rms: r.rms });
};
