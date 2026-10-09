import { dataFileNames, type DataFileName } from './schemas';

export type JsonFetcher = (url: string) => Promise<unknown>;

/** Fetches a JSON file; throws with the URL in the message so a missing file is easy to find. */
export const fetchJson: JsonFetcher = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url} (HTTP ${response.status})`);
  return response.json() as Promise<unknown>;
};

/** Root URL of the public folder (Vite's `base`, e.g. "/journey-gaym/"). */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}

/**
 * Loads every data file in parallel. Returns the raw JSON; run it through `validateGameData`
 * before use. `onProgress` fires after each file, for the loading bar.
 */
export async function loadDataFiles(
  onProgress?: (loaded: number, total: number) => void,
  fetcher: JsonFetcher = fetchJson,
): Promise<Record<DataFileName, unknown>> {
  const total = dataFileNames.length;
  let loaded = 0;
  const entries = await Promise.all(
    dataFileNames.map(async (name) => {
      const json = await fetcher(publicUrl(`data/${name}.json`));
      loaded++;
      onProgress?.(loaded, total);
      return [name, json] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<DataFileName, unknown>;
}
