/** The ability table: names, slots, costs and one-line descriptions for the shop. */
export type AbilitySlot = 'movement' | 'utility';

export type AbilityId =
  | 'secondWind'
  | 'lunge'
  | 'hangTime'
  | 'towLine'
  | 'slipstream'
  | 'kickOff'
  | 'slowLane'
  | 'spareRig'
  | 'roadFlare'
  | 'magnetBoots'
  | 'tailwind'
  | 'showtime';

export interface AbilityInfo {
  id: AbilityId;
  name: string;
  slot: AbilitySlot;
  cost: number;
  /** How it is triggered, for the shop and HUD. */
  control: string;
  description: string;
}

export const ABILITIES: readonly AbilityInfo[] = [
  { id: 'secondWind', name: 'SECOND WIND', slot: 'movement', cost: 12000, control: 'Jump in the air', description: 'One extra, weaker jump in mid-air. Recharges when you touch a truck.' },
  { id: 'lunge', name: 'LUNGE', slot: 'movement', cost: 18000, control: 'Left mouse', description: 'A short, fast dash exactly where you are looking.' },
  { id: 'kickOff', name: 'KICK OFF', slot: 'movement', cost: 22000, control: 'Passive', description: 'Your jump kicks the truck you leave backward and gives you a little extra speed.' },
  { id: 'hangTime', name: 'HANG TIME', slot: 'movement', cost: 26000, control: 'Hold left mouse', description: 'Hover in the air with full steering for a moment.' },
  { id: 'slipstream', name: 'SLIPSTREAM', slot: 'movement', cost: 30000, control: 'Passive', description: 'Standing on a truck builds a charge. Your next jump spends it as forward speed.' },
  { id: 'towLine', name: 'TOW LINE', slot: 'movement', cost: 38000, control: 'Hold left mouse', description: 'Hook any surface you aim at and get pulled toward it. Let go to stop.' },
  { id: 'slowLane', name: 'SLOW LANE', slot: 'utility', cost: 15000, control: 'Hold right mouse', description: 'Slow time down while held.' },
  { id: 'roadFlare', name: 'ROAD FLARE', slot: 'utility', cost: 20000, control: 'Right mouse', description: 'Throw a flare. Trucks near it swerve away for a few seconds.' },
  { id: 'magnetBoots', name: 'MAGNET BOOTS', slot: 'utility', cost: 28000, control: 'Hold right mouse', description: 'Stay locked to your truck even if it tips over or flies.' },
  { id: 'spareRig', name: 'SPARE RIG', slot: 'utility', cost: 32000, control: 'Right mouse', description: 'Throw a marker. A truck appears where it lands.' },
  { id: 'tailwind', name: 'TAILWIND', slot: 'utility', cost: 36000, control: 'Right mouse', description: 'Every truck near you drives faster for a few seconds.' },
  { id: 'showtime', name: 'SHOWTIME', slot: 'utility', cost: 45000, control: 'Right mouse', description: 'Slow-motion spotlight: all points you earn while it lasts are doubled.' },
];

export function abilityInfo(id: string): AbilityInfo | undefined {
  return ABILITIES.find((a) => a.id === id);
}
