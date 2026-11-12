import type { HazardDef } from '../schema';
import { Beam } from './beam';
import { BreakableWall } from './breakableWall';
import type { Hazard, HazardContext } from './hazard';
import { Ice } from './ice';
import { Rotor } from './rotor';
import { Spinner } from './spinner';

export function createHazard(def: HazardDef, ctx: HazardContext): Hazard {
  switch (def.type) {
    case 'breakableWall':
      return new BreakableWall(def, ctx);
    case 'spinner':
      return new Spinner(def, ctx);
    case 'ice':
      return new Ice(def, ctx);
    case 'rotor':
      return new Rotor(def, ctx);
    case 'beam':
      return new Beam(def, ctx);
  }
}

export type { Hazard, HazardPart } from './hazard';
