import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dataFileNames, type DataFileName } from '../data/schemas';

/** Test helper: reads a JSON file from public/ on disk. */
export function readPublicJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, '../../public', path), 'utf8'));
}

/** Test helper: all data files from public/data, as the game would fetch them. */
export function readAllData(): Record<DataFileName, unknown> {
  return Object.fromEntries(
    dataFileNames.map((name) => [name, readPublicJson(`data/${name}.json`)]),
  ) as Record<DataFileName, unknown>;
}
