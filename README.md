# Accordeur d’Harmonie

Accordeur chromatique de précision, 100 % HTML / CSS / JavaScript, conçu pour les musiciens
d’orchestre d’harmonie. Aucune dépendance, aucun serveur, aucun enregistrement : tout se passe
dans le navigateur grâce à la **Web Audio API**.

## Fonctionnalités

- **Détection de hauteur temps réel** par algorithme YIN (différence normalisée cumulative,
  interpolation parabolique, raffinement par sous-multiple pour l’aigu). Précision mesurée
  < 0,1 cent sur signaux de synthèse, du Do1 du tuba (≈ 29 Hz) au Do8 du piccolo (≈ 4 186 Hz).
- **Transposition automatique** : 40 instruments (bois, cuivres, cordes, percussions) avec
  affichage simultané de la note **écrite** et de la note **réelle**. Tessiture propre à chaque
  instrument pour éviter les erreurs d’octave.
- **Diapason réglable** de 415 à 466 Hz (présélections 440 / 441 / 442 / 443) et **calibration
  sur la note entendue** (ex. le La du hautbois).
- **Note cible verrouillable** (Si♭ d’accord, La, ou n’importe quelle note) pour accorder tout
  l’orchestre sur la même référence, avec l’écart mesuré même à ± 100 cents.
- **Jauge de précision** à 100 segments, aiguille lissée, anneau stroboscopique dont la
  rotation ralentit puis s’arrête quand la note est juste, courbe d’évolution sur 8 s
  (utile pour le vibrato et la tenue).
- **Conseils d’accord par famille** : baril, bocal, tête, coulisse d’accord, pédale de timbale…
- **Générateur de sons de référence** : La, Si♭ d’accord, toute note écrite pour l’instrument,
  quatre timbres (pur, bois, anche double, cuivre), bourdon continu.
- **Entraînement ludique** : anneau de tenue (2 s juste = note validée), série et record,
  justesse moyenne notée de A+ à E, **défi gamme** chronométré avec record, confettis et carillon.
- **Réglages** : tolérance ± 3 / 5 / 10 ¢, sensibilité du micro, Do Ré Mi / C D E, ♭ / ♯,
  numérotation des octaves française (La3 = 440) ou scientifique (A4 = 440). Tout est mémorisé.
- **Application installable** (manifeste PWA, icônes Android, service worker) et utilisable hors ligne.

## Pensé pour le smartphone

L’application est conçue d’abord pour un usage sur téléphone (Android et iPhone) :

- **Interface fluide** : la détection YIN tourne dans un Web Worker, hors du fil principal, et la
  jauge est rendue à partir d’une couche statique en cache (aucun flou coûteux). Mesuré à
  60 images/s dans un profil mobile.
- **Écran maintenu allumé** pendant l’accordage (API Wake Lock), reprise automatique du micro
  au retour au premier plan.
- **Barre d’actions rapides** en bas de l’écran : instrument, diapason, cible Si♭, écoute du Si♭,
  bourdon. Panneaux repliables dont l’état est mémorisé.
- **Cibles tactiles** d’au moins 44 px, curseurs agrandis, champs à 16 px (pas de zoom
  intempestif sur iOS), pas de surbrillance au toucher, zones sûres (encoche, barre de geste).
- **Portrait et paysage** : la jauge se dimensionne selon la hauteur disponible ; en paysage,
  jauge et panneaux s’affichent côte à côte.
- **Vibration** courte à chaque note validée (désactivable), bouton plein écran.
- **Installation sur l’écran d’accueil** : Chrome Android propose « Ajouter à l’écran d’accueil »
  (icônes 192 / 512 px, version maskable) ; sur iOS, Partager → « Sur l’écran d’accueil ».

## Utilisation

1. Servez le dossier en **HTTPS** (ou ouvrez-le sur `localhost`) : le micro n’est accessible
   qu’en contexte sécurisé.
   ```bash
   python3 -m http.server 8000
   # puis http://localhost:8000
   ```
   Pour un déploiement simple : GitHub Pages, Netlify ou n’importe quel hébergement statique.
2. Cliquez sur **Activer le micro** et autorisez l’accès.
3. Choisissez votre instrument, le diapason de l’orchestre, puis jouez une note tenue.

Raccourcis clavier : `Espace` active / coupe le micro, `B` lance / arrête le bourdon.

Conseil : avec un casque, le bourdon de référence ne perturbe pas la détection.

## Structure

```
index.html            Page unique
css/style.css         Thème sombre, or et vert, responsive
js/instruments.js     Instruments, transpositions, tessitures, conseils d’accord
js/pitch.js           Détecteur YIN + utilitaires musicaux
js/pitch-worker.js    Web Worker exécutant la détection hors du fil principal
js/synth.js           Générateur de sons (synthèse additive)
js/app.js             Application : audio, rendu canvas, jeu, réglages
manifest.webmanifest  Manifeste PWA
sw.js                 Service worker (cache hors ligne)
icon.svg, icon-*.png  Icônes (SVG, PNG 192 / 512, maskable)
```

## Compatibilité

Chrome, Edge, Firefox et Safari récents (bureau et mobile). Le traitement audio est effectué
avec `echoCancellation`, `noiseSuppression` et `autoGainControl` désactivés pour préserver
la hauteur réelle du signal.
