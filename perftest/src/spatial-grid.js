// Ruimtelijk raster: verdeelt de wereld in vakjes, zodat een projectiel alleen vijanden
// in de buurt hoeft te controleren in plaats van alle 300.

class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }

  clear() {
    for (const list of this.cells.values()) list.length = 0;
  }

  insert(obj) {
    const k = this.key(Math.floor(obj.x / this.cellSize), Math.floor(obj.y / this.cellSize));
    let list = this.cells.get(k);
    if (!list) { list = []; this.cells.set(k, list); }
    list.push(obj);
  }

  // Geeft het eerste object binnen `radius` van (x, y), of null.
  findNear(x, y, radius) {
    const cs = this.cellSize;
    const cx = Math.floor(x / cs);
    const cy = Math.floor(y / cs);
    const r2 = radius * radius;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = this.cells.get(this.key(cx + dx, cy + dy));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const ox = o.x - x;
          const oy = o.y - y;
          if (ox * ox + oy * oy <= r2) return o;
        }
      }
    }
    return null;
  }
}

window.SpatialGrid = SpatialGrid;
