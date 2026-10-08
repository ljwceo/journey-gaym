// Kleine "toevalsgenerator" met een vast startgetal (seed).
// Zelfde seed = zelfde reeks getallen, dus elke testrun gedraagt zich precies hetzelfde.

window.makeRng = function (seed) {
  let s = seed >>> 0;
  const next = function () {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  return next;
};
