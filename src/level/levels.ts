import { LevelDef, LevelError, validateLevel } from './schema';

/** One entry per level file: either a valid level or the reasons it is not. */
export interface LevelEntry {
  file: string;
  level?: LevelDef;
  problems?: string[];
}

const files = import.meta.glob('./data/**/*.json', { eager: true, import: 'default' });

function load(): LevelEntry[] {
  const out: LevelEntry[] = [];
  for (const [file, raw] of Object.entries(files)) {
    const short = file.replace('./data/', '');
    try {
      out.push({ file: short, level: validateLevel(raw, short) });
    } catch (err) {
      const problems = err instanceof LevelError ? err.problems : [String(err)];
      console.error(`Level file ${short} is invalid:\n- ${problems.join('\n- ')}`);
      out.push({ file: short, problems });
    }
  }
  // Campaign order: by id ("1-2" before "1-10" before "2-1"); test levels last.
  const key = (e: LevelEntry) => {
    const m = /^(\d+)-(\d+)$/.exec(e.level?.id ?? '');
    return m ? Number(m[1]) * 1000 + Number(m[2]) : 1e9;
  };
  out.sort((a, b) => key(a) - key(b) || a.file.localeCompare(b.file));
  const seen = new Set<string>();
  for (const e of out) {
    if (!e.level) continue;
    if (seen.has(e.level.id)) {
      e.problems = [`level.id: "${e.level.id}" is already used by another file`];
      console.error(`Level file ${e.file} is invalid:\n- ${e.problems[0]}`);
      e.level = undefined;
    } else {
      seen.add(e.level.id);
    }
  }
  return out;
}

export const LEVEL_ENTRIES: readonly LevelEntry[] = load();
export const LEVELS: readonly LevelDef[] = LEVEL_ENTRIES.flatMap((e) => (e.level ? [e.level] : []));

export function findLevel(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id || l.id === `test-${id}`);
}

function required(id: string): LevelDef {
  const l = findLevel(id);
  if (!l) throw new Error(`Built-in level "${id}" is missing or invalid`);
  return l;
}

/** Levels the automated tests rely on. */
export const TEST_LEVELS = {
  get single() {
    return required('test-single');
  },
  get convoy() {
    return required('test-convoy');
  },
  get block() {
    return required('test-block');
  },
  get hazards() {
    return required('test-hazards');
  },
};
