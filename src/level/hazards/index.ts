import type { HazardDef } from '../schema';
import { Beam } from './beam';
import { Belt } from './belt';
import { Boulder } from './boulder';
import { BreakableWall } from './breakableWall';
import type { Hazard, HazardContext } from './hazard';
import { Ice } from './ice';
import { Melt } from './melt';
import { Pendulum } from './pendulum';
import { Plate } from './plate';
import { Press } from './press';
import { Rotor } from './rotor';
import { Spinner } from './spinner';
import { Strike } from './strike';
import { Wind } from './wind';

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
    case 'belt':
      return new Belt(def, ctx);
    case 'press':
      return new Press(def, ctx);
    case 'melt':
      return new Melt(def, ctx);
    case 'wind':
      return new Wind(def, ctx);
    case 'strike':
      return new Strike(def, ctx);
  }
}

export type { Hazard, HazardPart } from './hazard';
