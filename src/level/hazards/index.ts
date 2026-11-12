import type { HazardDef } from '../schema';
import { Beam } from './beam';
import { Boulder } from './boulder';
import { BreakableWall } from './breakableWall';
import type { Hazard, HazardContext } from './hazard';
import { Ice } from './ice';
import { Pendulum } from './pendulum';
import { Plate } from './plate';
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
    case 'pendulum':
      return new Pendulum(def, ctx);
    case 'plate':
      return new Plate(def, ctx);
    case 'boulder':
      return new Boulder(def, ctx);
  }
}

export type { Hazard, HazardPart } from './hazard';
