// Zoekt uit op welk apparaat en in welke browser we draaien.
(function () {
  const ua = navigator.userAgent;

  const isIPhone = /iPhone|iPod/.test(ua);
  const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

  // Beginscherm-app: iPhone gebruikt navigator.standalone, pc/Chrome de display-mode
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  let browser = 'onbekend';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/CriOS/.test(ua)) browser = 'Chrome (iOS)';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';

  window.DEVICE = {
    isIPhone,
    isTouch,
    isStandalone,
    browser,
    naam: isIPhone ? 'iPhone' : (isTouch ? 'touch' : 'pc'),
    modus: isStandalone ? 'app' : 'browser',
    // Besturing kiest automatisch: joystick op touch, anders WASD + muis
    besturing: isTouch ? 'touch' : 'toetsenbord',
  };
})();
