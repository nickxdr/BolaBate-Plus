const sounds = {
  goal: new Audio("/goal.mp3"),
  whistleStart: new Audio("/whistle-start.mp3"),
  whistleEnd: new Audio("/whistle-end.mp3"),
};

sounds.goal.volume = 0.8;
sounds.whistleStart.volume = 0.7;
sounds.whistleEnd.volume = 0.7;

/**
 * Fires the device's vibration motor with the given on/off pattern (ms pairs).
 * Returns true when the platform supports vibration (Android / Chrome) and false
 * on browsers without navigator.vibrate (e.g. iOS Safari), so callers can warn
 * the user instead of failing silently.
 */
export function vibrate(pattern) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      return navigator.vibrate(pattern);
    } catch (error) {
      console.error("❌ Erro ao vibrar:", error);
    }
  }
  return false;
}

export function playSound(type) {
  console.log("🎵 Tentando tocar:", type);

  const sound = sounds[type];

  if (!sound) {
    console.warn("❌ Som não encontrado:", type);
    return;
  }

  sound.currentTime = 0;

  sound
    .play()
    .then(() => {
      console.log("✅ Som tocando:", type);
    })
    .catch((error) => {
      console.error("❌ Erro ao tocar:", error);
    });

  if (type === "whistleStart") {
    setTimeout(() => {
      sound.pause();
      sound.currentTime = 0;
    }, 1900);
  }
}