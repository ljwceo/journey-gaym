// Houdt het scherm aan tijdens een raid (Wake Lock API, waar de browser het kan).
window.SchermAan = (function () {
  let gewenst = false;
  let slot = null;

  async function vraag() {
    if (!gewenst || slot || document.hidden || !('wakeLock' in navigator)) return;
    try {
      slot = await navigator.wakeLock.request('screen');
      slot.addEventListener('release', () => { slot = null; });
    } catch (e) {
      slot = null; // mag niet (bijv. batterijbesparing): dan maar zonder
    }
  }

  // De browser laat het slot los als je van app wisselt: bij terugkomen opnieuw vragen
  document.addEventListener('visibilitychange', vraag);

  return {
    aan() { gewenst = true; vraag(); },
    uit() {
      gewenst = false;
      if (slot) slot.release();
      slot = null;
    },
  };
})();
