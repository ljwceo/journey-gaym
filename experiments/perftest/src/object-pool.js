// Generieke object pool.
// In plaats van steeds nieuwe objecten te maken en weg te gooien (dat geeft haperingen
// door de "garbage collector"), maken we ze één keer en hergebruiken we ze.
//
//   const pool = new ObjectPool({
//     create:  ()            => ({ ... }),   // maak één nieuw object
//     onSpawn: (obj, ...args) => { ... },     // zet het klaar voor gebruik
//     onRelease: (obj)        => { ... },     // verberg / reset het
//   });
//   const obj = pool.spawn(x, y);
//   pool.release(obj);

class ObjectPool {
  constructor({ create, onSpawn, onRelease, prewarm = 0 }) {
    this.create = create;
    this.onSpawn = onSpawn || (() => {});
    this.onRelease = onRelease || (() => {});
    this.free = [];     // objecten die klaarliggen
    this.active = [];   // objecten die nu in gebruik zijn
    this.created = 0;
    for (let i = 0; i < prewarm; i++) this.free.push(this.make());
  }

  make() {
    const obj = this.create();
    obj._poolIndex = -1;
    this.created++;
    return obj;
  }

  spawn(...args) {
    const obj = this.free.length > 0 ? this.free.pop() : this.make();
    obj._poolIndex = this.active.length;
    this.active.push(obj);
    this.onSpawn(obj, ...args);
    return obj;
  }

  release(obj) {
    const i = obj._poolIndex;
    if (i < 0) return; // al teruggegeven
    // Snel verwijderen: zet het laatste object op de lege plek.
    const last = this.active.pop();
    if (last !== obj) {
      this.active[i] = last;
      last._poolIndex = i;
    }
    obj._poolIndex = -1;
    this.onRelease(obj);
    this.free.push(obj);
  }

  // Loop veilig over alle actieve objecten, ook als er tijdens de lus worden teruggegeven.
  forEachActive(fn) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (i < this.active.length) fn(this.active[i]);
    }
  }

  get activeCount() { return this.active.length; }
  get freeCount() { return this.free.length; }
}

window.ObjectPool = ObjectPool;
