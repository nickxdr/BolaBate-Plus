const sounds = {
  goal: new Audio("/goal.mp3"),
  whistleStart: new Audio("/whistle-start.mp3"),
  whistleEnd: new Audio("/whistle-end.mp3"),
};

sounds.goal.volume = 0.8;
sounds.whistleStart.volume = 0.7;
sounds.whistleEnd.volume = 0.7;

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