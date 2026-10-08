// Voorkomt dat de iPhone inzoomt of scrollt als je tikt of veegt.
(function () {
  const stop = (e) => e.preventDefault();

  // Knijpen om te zoomen (Safari-gebaren)
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });

  // Vegen = niet scrollen
  document.addEventListener('touchmove', stop, { passive: false });

  // Dubbeltikken om te zoomen wordt al geblokkeerd door touch-action: none in style.css

  // Geen menu bij lang ingedrukt houden
  document.addEventListener('contextmenu', stop);
})();
