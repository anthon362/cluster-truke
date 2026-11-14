import type { LevelDef } from './schema';

const CAMPAIGN_ID = /^\d+-\d+$/;

/** Campaign levels in play order (ids like "2-3"); test levels are not part of it. */
export function campaignLevels(levels: readonly LevelDef[]): LevelDef[] {
  return levels.filter((l) => CAMPAIGN_ID.test(l.id));
}

/**
 * Levels unlock in order: the first campaign level is always open, each
 * later one opens when the level before it has been finished. Finishing the
 * last level of a world therefore opens the next world. Test levels are
 * always open.
 */
export function isUnlocked(
  level: LevelDef,
  levels: readonly LevelDef[],
  bestTimes: Readonly<Record<string, number>>,
): boolean {
  const campaign = campaignLevels(levels);
  const i = campaign.findIndex((l) => l.id === level.id);
  if (i <= 0) return true;
  return bestTimes[campaign[i - 1].id] !== undefined;
}

/** The campaign level after this one, or undefined at the end (or for test levels). */
export function nextCampaignLevel(
  level: LevelDef,
  levels: readonly LevelDef[],
): LevelDef | undefined {
  const campaign = campaignLevels(levels);
  const i = campaign.findIndex((l) => l.id === level.id);
  return i >= 0 ? campaign[i + 1] : undefined;
}
