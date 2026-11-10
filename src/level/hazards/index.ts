import type { HazardDef } from '../schema';
import { BreakableWall } from './breakableWall';
import type { Hazard, HazardContext } from './hazard';
import { Spinner } from './spinner';

export function createHazard(def: HazardDef, ctx: HazardContext): Hazard {
  switch (def.type) {
    case 'breakableWall':
      return new BreakableWall(def, ctx);
    case 'spinner':
      return new Spinner(def, ctx);
  }
}

export type { Hazard, HazardPart } from './hazard';
