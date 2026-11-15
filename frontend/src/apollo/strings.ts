/**
 * UI strings added by the integration, in the same format as ApolloCare's own catalog:
 * Spanish text -> { en, fr }. Registered with Lang.extend(), so the existing language
 * selector translates them like the rest of the app.
 */
export const STRINGS: Record<string, { en: string; fr: string }> = {
  // printable report
  "🖨️ Imprimir / Guardar PDF": { en: "🖨️ Print / Save as PDF", fr: "🖨️ Imprimer / Enregistrer en PDF" },

  // levels and provenance
  "En rango": { en: "In range", fr: "Dans la plage" },
  "Atención": { en: "Needs attention", fr: "Alerte" },
  "Solo tendencia": { en: "Trend only", fr: "Tendance seule" },
  "Umbral con fuente citada": { en: "Threshold from a cited source", fr: "Seuil issu d’une source citée" },
  "Rango del laboratorio (datos NASA)": { en: "Lab range (NASA data file)", fr: "Plage du laboratoire (données NASA)" },
  "Criterio demo del equipo (sin fuente)": { en: "Team demo criterion (no source)", fr: "Critère de démo de l’équipe (sans source)" },
  "Sin umbral citado: solo tendencia": { en: "No cited threshold: trend only", fr: "Aucun seuil cité : tendance seule" },
  "Rango orientativo (criterio demo)": { en: "Orientative range (demo criterion)", fr: "Plage indicative (critère de démo)" },
  "Mente y sueño": { en: "Mind and sleep", fr: "Mental et sommeil" },
  "Inmunidad y metabolismo": { en: "Immunity and metabolism", fr: "Immunité et métabolisme" },
  "Huesos y músculos": { en: "Bones and muscles", fr: "Os et muscles" },
  "Radiación": { en: "Radiation", fr: "Rayonnement" },
  "Entorno de la misión": { en: "Mission environment", fr: "Environnement de mission" },

  // mission monitor
  "Monitoreo de misión": { en: "Mission monitor", fr: "Suivi de mission" },
  "🛰️ Monitoreo de misión": { en: "🛰️ Mission monitor", fr: "🛰️ Suivi de mission" },
  "Tu tendencia durante la misión, comparada con tu propia línea base y con umbrales que citan su fuente.": {
    en: "Your trend during the mission, compared with your own baseline and with thresholds that cite their source.",
    fr: "Votre tendance pendant la mission, comparée à votre propre niveau de référence et à des seuils dont la source est citée.",
  },
  "Hacer una revisión física": { en: "Do a physical check-in", fr: "Faire un bilan physique" },
  "Vista de oficial médico (demo):": { en: "Medical officer view (demo):", fr: "Vue du médecin de bord (démo) :" },
  "Qué hacer ahora": { en: "What to do now", fr: "Que faire maintenant" },
  "Cuándo avisar:": { en: "When to report:", fr: "Quand prévenir :" },
  "Tu línea base": { en: "Your baseline", fr: "Votre référence" },
  "Últimos 7 días": { en: "Last 7 days", fr: "7 derniers jours" },
  "Cambio": { en: "Change", fr: "Variation" },
  "Por qué importa y evidencia": { en: "Why it matters and evidence", fr: "Pourquoi c’est important et preuves" },
  "El monitoreo de misión necesita el servidor del equipo y ahora no responde.": {
    en: "The mission monitor needs the team's server, and it is not responding.",
    fr: "Le suivi de mission a besoin du serveur de l’équipe, qui ne répond pas.",
  },
  "Inicia el backend (uvicorn backend.main:app --port 8000) y recarga la página. La revisión física y el bienestar emocional funcionan sin conexión.": {
    en: "Start the backend (uvicorn backend.main:app --port 8000) and reload the page. The physical check-in and emotional wellbeing work offline.",
    fr: "Démarrez le backend (uvicorn backend.main:app --port 8000) et rechargez la page. Le bilan physique et le bien-être émotionnel fonctionnent hors ligne.",
  },
  "Elige un perfil de la tripulación para ver su monitoreo.": { en: "Choose a crew profile to see its monitor.", fr: "Choisissez un profil de l’équipage pour voir son suivi." },
  "Cargando el historial de la misión…": { en: "Loading the mission history…", fr: "Chargement de l’historique de mission…" },
  "Día de misión": { en: "Mission day", fr: "Jour de mission" },
  "Historial de demostración: misión simulada, más las mediciones reales que cada tripulante guardó con su consentimiento. Los colores no son un diagnóstico.": {
    en: "Demo history: a simulated mission, plus the real measurements each crew member saved with consent. Colors are not a diagnosis.",
    fr: "Historique de démonstration : mission simulée, plus les mesures réelles enregistrées avec consentement. Les couleurs ne sont pas un diagnostic.",
  },
  "Todavía no hay mediciones para este tripulante.": { en: "No measurements for this crew member yet.", fr: "Aucune mesure pour ce membre d’équipage." },
  "No se pudo cargar el monitoreo.": { en: "Could not load the monitor.", fr: "Impossible de charger le suivi." },
  "De dónde sale el color": { en: "Where the color comes from", fr: "D’où vient la couleur" },
  "Cambio respecto a tu línea base:": { en: "Change from your baseline:", fr: "Variation par rapport à votre référence :" },
  "Son números redondos elegidos por el equipo para la demostración; no vienen de una fuente.": {
    en: "These are round numbers chosen by the team for the demo; they do not come from a source.",
    fr: "Ce sont des chiffres ronds choisis par l’équipe pour la démonstration ; ils ne proviennent pas d’une source.",
  },
  "No encontramos un umbral publicado que podamos citar, así que solo mostramos tu tendencia.": {
    en: "We found no published threshold we can cite, so only your trend is shown.",
    fr: "Nous n’avons trouvé aucun seuil publié à citer : seule votre tendance est affichée.",
  },
  "Cargando la evidencia…": { en: "Loading the evidence…", fr: "Chargement des preuves…" },
  "Por qué importa en el espacio": { en: "Why it matters in space", fr: "Pourquoi c’est important dans l’espace" },
  "Cómo se mide": { en: "How it is measured", fr: "Comment cela se mesure" },
  "Tu tendencia (últimos 60 días)": { en: "Your trend (last 60 days)", fr: "Votre tendance (60 derniers jours)" },
  "Línea discontinua gris: tu línea base. Líneas punteadas de color: umbrales citados. Puntos grandes: mediciones reales.": {
    en: "Grey dashed line: your baseline. Colored dotted lines: cited thresholds. Large dots: real measurements.",
    fr: "Ligne grise en tirets : votre référence. Lignes pointillées de couleur : seuils cités. Gros points : mesures réelles.",
  },
  "Evidencia en astronautas": { en: "Evidence in astronauts", fr: "Preuves chez les astronautes" },
  "Limitaciones": { en: "Limitations", fr: "Limites" },
  "Fuentes": { en: "Sources", fr: "Sources" },
  "Resúmenes traducidos por el equipo a partir de fuentes en inglés; los títulos y las citas se dejan en su idioma original. Borrador pendiente de revisión por un profesional de la salud.": {
    en: "Summaries based on English-language sources; titles and citations are kept in their original language. Draft, pending review by a health professional.",
    fr: "Résumés traduits par l’équipe à partir de sources en anglais ; les titres et les citations restent dans leur langue d’origine. Brouillon en attente de relecture par un professionnel de santé.",
  },  "No se pudo cargar la evidencia.": { en: "Could not load the evidence.", fr: "Impossible de charger les preuves." },

  // camera card
  "Cámara inteligente (opcional)": { en: "Smart camera (optional)", fr: "Caméra intelligente (facultative)" },
  "Mide tu pulso con la cámara y observa señales de fatiga (parpadeo, ojos cerrados, bostezos) y la postura de tu cabeza. Todo se procesa en este navegador: no se graba ni se envía video. No es un dispositivo médico.": {
    en: "Measures your pulse with the camera and watches for signs of fatigue (blinking, closed eyes, yawns) and your head posture. Everything is processed in this browser: no video is recorded or sent. This is not a medical device.",
    fr: "Mesure votre pouls avec la caméra et observe les signes de fatigue (clignements, yeux fermés, bâillements) et la posture de la tête. Tout est traité dans ce navigateur : aucune vidéo n’est enregistrée ni envoyée. Ce n’est pas un dispositif médical.",
  },
  "Iniciar cámara": { en: "Start camera", fr: "Démarrer la caméra" },
  "Detener y ver resumen": { en: "Stop and see summary", fr: "Arrêter et voir le résumé" },
  "Mostrar malla": { en: "Show face mesh", fr: "Afficher le maillage" },
  "Detectar expresión": { en: "Detect expression", fr: "Détecter l’expression" },
  "Recalibrar postura": { en: "Recalibrate posture", fr: "Recalibrer la posture" },
  "Usar este pulso en mi revisión": { en: "Use this pulse in my check-in", fr: "Utiliser ce pouls dans mon bilan" },
  "Pulso por cámara": { en: "Camera pulse", fr: "Pouls par caméra" },
  "Fatiga (cámara)": { en: "Fatigue (camera)", fr: "Fatigue (caméra)" },
  "Ojos cerrados (1 min)": { en: "Eyes closed (1 min)", fr: "Yeux fermés (1 min)" },
  "Bostezos": { en: "Yawns", fr: "Bâillements" },
  "Postura de la cabeza": { en: "Head posture", fr: "Posture de la tête" },
  "Expresión facial": { en: "Facial expression", fr: "Expression du visage" },
  "Autorizo guardar el pulso medido por cámara en mi historial de misión (base local del equipo). No se guarda video.": {
    en: "I consent to saving the camera pulse to my mission history (the team's local database). No video is saved.",
    fr: "J’autorise l’enregistrement du pouls mesuré par caméra dans mon historique de mission (base locale de l’équipe). Aucune vidéo n’est enregistrée.",
  },
  "Para un buen pulso: buena luz, quédate quieto unos 10 segundos. Compara con un oxímetro o pulso manual antes de confiar en la cámara. La fatiga y la expresión son señales experimentales; una cara no demuestra por sí sola estrés, ansiedad ni depresión.": {
    en: "For a good pulse reading: good light, keep still for about 10 seconds. Compare with a pulse oximeter or a manual count before trusting the camera. Fatigue and expression are experimental signals; a face alone cannot establish stress, anxiety or depression.",
    fr: "Pour une bonne mesure : bon éclairage, restez immobile environ 10 secondes. Comparez avec un oxymètre ou un pouls manuel avant de vous fier à la caméra. La fatigue et l’expression sont des signaux expérimentaux ; un visage seul ne permet pas d’établir le stress, l’anxiété ou la dépression.",
  },
  "No se detecta tu cara": { en: "Your face is not detected", fr: "Votre visage n’est pas détecté" },
  "Bostezo detectado": { en: "Yawn detected", fr: "Bâillement détecté" },
  "Cabeza gacha": { en: "Head down", fr: "Tête baissée" },
  "Mirando a otro lado": { en: "Looking away", fr: "Regard ailleurs" },
  "Inclinación / giro": { en: "Tilt / turn", fr: "Inclinaison / rotation" },
  "bajo": { en: "low", fr: "faible" },
  "medio": { en: "medium", fr: "moyen" },
  "alto": { en: "high", fr: "élevé" },
  "alegría": { en: "happy", fr: "joie" },
  "tristeza": { en: "sad", fr: "tristesse" },
  "enojo": { en: "angry", fr: "colère" },
  "miedo": { en: "fearful", fr: "peur" },
  "desagrado": { en: "disgusted", fr: "dégoût" },
  "sorpresa": { en: "surprised", fr: "surprise" },
  "Cargando el modelo de expresiones…": { en: "Loading the expression model…", fr: "Chargement du modèle d’expressions…" },
  "Cámara activa. El video no se graba ni sale de este navegador.": {
    en: "Camera on. Video is not recorded and does not leave this browser.",
    fr: "Caméra active. La vidéo n’est pas enregistrée et ne quitte pas ce navigateur.",
  },
  "No se pudo cargar el modelo de expresiones (se necesita internet la primera vez).": {
    en: "Could not load the expression model (internet is needed the first time).",
    fr: "Impossible de charger le modèle d’expressions (Internet est nécessaire la première fois).",
  },
  "Abriendo la cámara…": { en: "Opening the camera…", fr: "Ouverture de la caméra…" },
  "Cargando el modelo de visión…": { en: "Loading the vision model…", fr: "Chargement du modèle de vision…" },
  "No se pudo cargar el modelo de visión (se necesita internet la primera vez).": {
    en: "Could not load the vision model (internet is needed the first time).",
    fr: "Impossible de charger le modèle de vision (Internet est nécessaire la première fois).",
  },
  "Resumen de la sesión de cámara": { en: "Camera session summary", fr: "Résumé de la session caméra" },
  "Duración:": { en: "Duration:", fr: "Durée :" },
  "Cara visible:": { en: "Face visible:", fr: "Visage visible :" },
  "Pulso promedio:": { en: "Average pulse:", fr: "Pouls moyen :" },
  "Señal de pulso confiable:": { en: "Reliable pulse signal:", fr: "Signal de pouls fiable :" },
  "Fatiga promedio (cámara):": { en: "Average fatigue (camera):", fr: "Fatigue moyenne (caméra) :" },
  "Parpadeos:": { en: "Blinks:", fr: "Clignements :" },
  "Bostezos:": { en: "Yawns:", fr: "Bâillements :" },
  "Cabeza gacha:": { en: "Head down:", fr: "Tête baissée :" },
  "Mirando a otro lado:": { en: "Looking away:", fr: "Regard ailleurs :" },
  "Sin conexión con la base de la misión: el resumen no se guardó.": {
    en: "No connection to the mission database: the summary was not saved.",
    fr: "Pas de connexion à la base de la mission : le résumé n’a pas été enregistré.",
  },
  "No se guardó el pulso: la sesión duró menos de 30 segundos.": {
    en: "Pulse not saved: the session lasted less than 30 seconds.",
    fr: "Pouls non enregistré : la session a duré moins de 30 secondes.",
  },
  "No se guardó el pulso: la señal fue confiable menos de la mitad del tiempo.": {
    en: "Pulse not saved: the signal was reliable less than half of the time.",
    fr: "Pouls non enregistré : le signal a été fiable moins de la moitié du temps.",
  },
  "No se guardó el pulso: no hubo lecturas confiables.": { en: "Pulse not saved: there were no reliable readings.", fr: "Pouls non enregistré : aucune mesure fiable." },
  "No se guardó: falta el consentimiento para guardar historial de este tripulante.": {
    en: "Not saved: this crew member has not consented to storing history.",
    fr: "Non enregistré : ce membre d’équipage n’a pas consenti à l’enregistrement de l’historique.",
  },
  "No se pudo guardar el resumen en la base de la misión.": { en: "Could not save the summary to the mission database.", fr: "Impossible d’enregistrer le résumé dans la base de la mission." },

  // profiles and face identification
  "📷 Identificarme con la cámara": { en: "📷 Identify me with the camera", fr: "📷 M’identifier avec la caméra" },
  "Capturar toma": { en: "Capture shot", fr: "Capturer une prise" },
  "Guardar rostro": { en: "Save face", fr: "Enregistrer le visage" },
  "Cancelar": { en: "Cancel", fr: "Annuler" },
  "🔒 Reconocimiento facial: solo se guardan descriptores numéricos (no fotos) y solo en este navegador. Sirve para elegir el perfil, no es un control de acceso.": {
    en: "🔒 Face recognition: only numeric descriptors are stored (no photos), and only in this browser. It picks the profile; it is not access control.",
    fr: "🔒 Reconnaissance faciale : seuls des descripteurs numériques sont stockés (aucune photo), uniquement dans ce navigateur. Elle sert à choisir le profil, pas à contrôler l’accès.",
  },
  "Todavía no hay rostros registrados. Usa «Registrar rostro» en tu perfil.": {
    en: "No faces enrolled yet. Use “Enroll face” on your profile.",
    fr: "Aucun visage enregistré. Utilisez « Enregistrer le visage » sur votre profil.",
  },
  "Identificando… mira a la cámara": { en: "Identifying… look at the camera", fr: "Identification… regardez la caméra" },
  "No te reconocí. Elige tu perfil a mano o registra tu rostro.": {
    en: "I did not recognize you. Choose your profile by hand or enroll your face.",
    fr: "Je ne vous ai pas reconnu. Choisissez votre profil à la main ou enregistrez votre visage.",
  },
  "No se pudieron cargar los modelos de reconocimiento (se necesita internet la primera vez).": {
    en: "Could not load the recognition models (internet is needed the first time).",
    fr: "Impossible de charger les modèles de reconnaissance (Internet est nécessaire la première fois).",
  },
  "No se pudo guardar el registro en este navegador.": { en: "Could not save the enrollment in this browser.", fr: "Impossible d’enregistrer dans ce navigateur." },
  "Mira de frente a la cámara": { en: "Look straight at the camera", fr: "Regardez la caméra de face" },
  "Gira un poco la cabeza a la izquierda": { en: "Turn your head slightly to the left", fr: "Tournez légèrement la tête à gauche" },
  "Gira un poco la cabeza a la derecha": { en: "Turn your head slightly to the right", fr: "Tournez légèrement la tête à droite" },
  "Levanta un poco la barbilla": { en: "Raise your chin slightly", fr: "Levez légèrement le menton" },
  "Baja un poco la barbilla": { en: "Lower your chin slightly", fr: "Baissez légèrement le menton" },
  "No se detecta ninguna cara": { en: "No face detected", fr: "Aucun visage détecté" },
  "Hay más de una cara frente a la cámara": { en: "There is more than one face in front of the camera", fr: "Il y a plus d’un visage devant la caméra" },
  "La cara no se ve clara (mejora la luz)": { en: "The face is not clear (improve the light)", fr: "Le visage n’est pas net (améliorez l’éclairage)" },
  "Acércate un poco a la cámara": { en: "Move a little closer to the camera", fr: "Rapprochez-vous un peu de la caméra" },
  "Sin consentimiento para reconocimiento facial": { en: "No consent for face recognition", fr: "Pas de consentement pour la reconnaissance faciale" },
  "✓ Rostro registrado": { en: "✓ Face enrolled", fr: "✓ Visage enregistré" },
  "Rostro sin registrar": { en: "Face not enrolled", fr: "Visage non enregistré" },
  "Registrar rostro": { en: "Enroll face", fr: "Enregistrer le visage" },
  "Volver a registrar": { en: "Enroll again", fr: "Réenregistrer" },
  "Borrar rostro": { en: "Delete face", fr: "Supprimer le visage" },

  // physical check-in results
  "Guía basada en evidencia": { en: "Evidence-based guidance", fr: "Conseils fondés sur des preuves" },
  "Estos niveles usan umbrales con fuente citada de la capa de datos del equipo. Los demás signos usan rangos orientativos de demostración.": {
    en: "These levels use thresholds with a cited source from the team's data layer. The other vital signs use orientative demo ranges.",
    fr: "Ces niveaux utilisent des seuils dont la source est citée dans la couche de données de l’équipe. Les autres signes utilisent des plages indicatives de démonstration.",
  },
  "🛰️ Ver mi tendencia en la misión": { en: "🛰️ See my trend in the mission", fr: "🛰️ Voir ma tendance pendant la mission" },
  "Todo se ve dentro de lo esperado. Sigue con tu rutina de descanso y ejercicio.": {
    en: "Everything looks within the expected range. Keep up your rest and exercise routine.",
    fr: "Tout semble dans la plage attendue. Poursuivez votre routine de repos et d’exercice.",
  },
  "Algunos valores están en observación. Descansa, hidrátate y vuelve a medir en un rato.": {
    en: "Some values need watching. Rest, drink water and measure again in a while.",
    fr: "Certaines valeurs sont à surveiller. Reposez-vous, hydratez-vous et refaites la mesure dans un moment.",
  },
  "Hay valores en rango de peligro. Avisa a la tripulación o al oficial médico de vuelo (flight surgeon) y repite la medición con calma.": {
    en: "Some values are in the alert range. Tell the crew or the flight surgeon and repeat the measurement calmly.",
    fr: "Certaines valeurs sont dans la zone d’alerte. Prévenez l’équipage ou le médecin de vol et refaites la mesure calmement.",
  },
  "✓ También guardado en tu historial de misión (pulso, temperatura y sueño).": {
    en: "✓ Also saved to your mission history (pulse, temperature and sleep).",
    fr: "✓ Également enregistré dans votre historique de mission (pouls, température et sommeil).",
  },
  "Esta revisión no incluye pulso, temperatura ni sueño: nada que guardar en el historial de misión.": {
    en: "This check-in has no pulse, temperature or sleep: nothing to save to the mission history.",
    fr: "Ce bilan ne contient ni pouls, ni température, ni sommeil : rien à enregistrer dans l’historique de mission.",
  },
  "No se guardó en el historial de misión: este tripulante no ha dado su consentimiento.": {
    en: "Not saved to the mission history: this crew member has not given consent.",
    fr: "Non enregistré dans l’historique de mission : ce membre d’équipage n’a pas donné son consentement.",
  },
  "No se pudo guardar en el historial de misión (el servidor no respondió). Sí quedó guardada en este navegador.": {
    en: "Could not save to the mission history (the server did not respond). It was saved in this browser.",
    fr: "Impossible d’enregistrer dans l’historique de mission (le serveur n’a pas répondu). Le bilan est enregistré dans ce navigateur.",
  },
  "Guarda los resultados que elijas y compáralos en futuras revisiones. Se guardan en este navegador y, si hay conexión, en la base de datos local de la misión (esta computadora). No salen a internet.": {
    en: "Save the results you choose and compare them in future check-ins. They are stored in this browser and, when connected, in the mission's local database (this computer). They are not sent to the internet.",
    fr: "Enregistrez les résultats choisis et comparez-les lors de prochains bilans. Ils sont stockés dans ce navigateur et, si la connexion existe, dans la base locale de la mission (cet ordinateur). Ils ne sont pas envoyés sur Internet.",
  },
  "Autorizo guardar mis signos vitales, datos complementarios y respuestas de síntomas en este navegador, y mi pulso, temperatura y sueño en mi historial de misión (sin notas libres ni cámara). Puedo borrar los registros cuando quiera.": {
    en: "I consent to saving my vital signs, additional information and symptom answers in this browser, and my pulse, temperature and sleep in my mission history (no free-text notes, no camera). I can delete these records at any time.",
    fr: "J’autorise l’enregistrement de mes signes vitaux, informations complémentaires et réponses sur les symptômes dans ce navigateur, ainsi que de mon pouls, ma température et mon sommeil dans mon historique de mission (sans notes libres ni caméra). Je peux supprimer ces données à tout moment.",
  },
  "Borrar mis mediciones del historial de misión": { en: "Delete my measurements from the mission history", fr: "Supprimer mes mesures de l’historique de mission" },
  "No se pudieron borrar las mediciones del historial de misión.": {
    en: "Could not delete the measurements from the mission history.",
    fr: "Impossible de supprimer les mesures de l’historique de mission.",
  },

  // connection
  "🛰️ Conectado a la base de datos de la misión": { en: "🛰️ Connected to the mission database", fr: "🛰️ Connecté à la base de données de la mission" },
  "Sin conexión con el servidor de la misión: modo local": { en: "No connection to the mission server: local mode", fr: "Pas de connexion au serveur de la mission : mode local" },

  // units
  "min/día": { en: "min/day", fr: "min/jour" },

  // physical diagnosis block (same format as the emotional result)
  "Tu lectura de hoy": { en: "Your reading today", fr: "Votre lecture d’aujourd’hui" },
  "Todo se ve en rango": { en: "Everything looks in range", fr: "Tout semble dans la plage" },
  "Hay algo que vigilar": { en: "Something to watch", fr: "Un point à surveiller" },
  "Requiere atención": { en: "Needs attention", fr: "Nécessite une attention" },
  "El pulso, la temperatura y el sueño usan umbrales con fuente citada; los demás signos, rangos orientativos de demostración.": {
    en: "Pulse, temperature and sleep use thresholds with a cited source; the other signs use orientative demo ranges.",
    fr: "Le pouls, la température et le sommeil utilisent des seuils cités ; les autres signes, des plages indicatives de démonstration.",
  },

  // emotional check-in -> mission
  "Datos para tu misión": { en: "Data for your mission", fr: "Données pour votre mission" },
  "Esto NO guarda un diagnóstico de salud mental: el cuestionario no es una escala clínica. Solo guarda lo que tú reportaste, para ver tu tendencia durante la misión.": {
    en: "This does NOT save a mental-health diagnosis: the questionnaire is not a clinical scale. It only saves what you reported yourself, to see your trend during the mission.",
    fr: "Ceci N’enregistre PAS un diagnostic de santé mentale : le questionnaire n’est pas une échelle clinique. Il enregistre seulement ce que vous avez déclaré, pour suivre votre tendance pendant la mission.",
  },
  "Cercanía con tu tripulación (tu respuesta): ": { en: "Closeness to your crew (your answer): ", fr: "Proximité avec votre équipage (votre réponse) : " },
  "Guardar en mi historial de misión": { en: "Save to my mission history", fr: "Enregistrer dans mon historique de mission" },
  "📷 Medir mi pulso con la cámara (opcional)": { en: "📷 Measure my pulse with the camera (optional)", fr: "📷 Mesurer mon pouls avec la caméra (facultatif)" },
  "Detener cámara": { en: "Stop camera", fr: "Arrêter la caméra" },
  "Guardar pulso en la misión": { en: "Save pulse to the mission", fr: "Enregistrer le pouls dans la mission" },

  // ApolloCare dynamic strings that were not in its own catalog
  "Así se ve tu estado hoy.": { en: "This is how you look today.", fr: "Voici votre état aujourd’hui." },
  "Mostrando datos de demostración (no capturaste valores).": { en: "Showing demo data (you did not enter values).", fr: "Affichage de données de démonstration (aucune valeur saisie)." },
  "No se capturaron datos complementarios.": { en: "No additional data captured.", fr: "Aucune donnée complémentaire saisie." },
  "Sin información adicional.": { en: "No additional information.", fr: "Aucune information complémentaire." },
  "Dentro de rango orientativo": { en: "Within orientative range", fr: "Dans la plage indicative" },
  "Solicita revisión": { en: "Needs review", fr: "Demande un examen" },
  "Corazón": { en: "Heart", fr: "Cœur" },
  "Pulmones": { en: "Lungs", fr: "Poumons" },
  "Cerebro": { en: "Brain", fr: "Cerveau" },
  "Cuerpo": { en: "Body", fr: "Corps" },
};

// Body-map bubble headers are rendered as one text node ("Organ · Severity"), so add the combinations.
const _ORGANS: Record<string, { en: string; fr: string }> = {
  "Corazón": { en: "Heart", fr: "Cœur" },
  "Pulmones": { en: "Lungs", fr: "Poumons" },
  "Cerebro": { en: "Brain", fr: "Cerveau" },
  "Cuerpo": { en: "Body", fr: "Corps" },
};
const _SEV: Record<string, { en: string; fr: string }> = {
  "Dentro de rango orientativo": { en: "Within orientative range", fr: "Dans la plage indicative" },
  "Precaución": { en: "Caution", fr: "Prudence" },
  "Solicita revisión": { en: "Needs review", fr: "Demande un examen" },
};
for (const [org, ot] of Object.entries(_ORGANS)) {
  for (const [sev, st] of Object.entries(_SEV)) {
    STRINGS[`${org} · ${sev}`] = { en: `${ot.en} · ${st.en}`, fr: `${ot.fr} · ${st.fr}` };
  }
}

// Body-map bubble body lines render the field label with a trailing colon ("Horas de sueño: 5.5 h"),
// so the colon-suffixed label is its own text node and needs its own key.
const _FIELD_COLON: Record<string, { en: string; fr: string }> = {
  "Frecuencia cardíaca": { en: "Heart rate", fr: "Fréquence cardiaque" },
  "Temperatura corporal": { en: "Body temperature", fr: "Température corporelle" },
  "Saturación de oxígeno": { en: "Oxygen saturation", fr: "Saturation en oxygène" },
  "Respiraciones": { en: "Breaths", fr: "Respirations" },
  "Presión sistólica": { en: "Systolic pressure", fr: "Pression systolique" },
  "Presión diastólica": { en: "Diastolic pressure", fr: "Pression diastolique" },
  "Horas de sueño": { en: "Hours of sleep", fr: "Heures de sommeil" },
  // Qualitative brain questions shown in the body-map bubble (label is the question stripped of "¿?" and parentheses).
  "Has sentido mareo": { en: "Felt dizzy", fr: "Vertiges ressentis" },
  "Dolor de cabeza": { en: "Headache", fr: "Mal de tête" },
  "Nivel de fatiga": { en: "Fatigue level", fr: "Niveau de fatigue" },
};
for (const [es, t] of Object.entries(_FIELD_COLON)) {
  STRINGS[`${es}:`] = { en: `${t.en}:`, fr: `${t.fr}:` };
}
