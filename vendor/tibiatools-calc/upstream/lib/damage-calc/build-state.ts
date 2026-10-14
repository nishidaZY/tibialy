export type Vocation = "knight" | "paladin" | "sorcerer" | "druid" | "monk";
export type ImbuementElement = "death" | "earth" | "energy" | "fire" | "ice";

export type WeaponChoiceRef = { id: number; ammoId?: number; shieldId?: number };
export type PerkChoiceRef = { id: number; value: number };
// TODO: thinking about how to implement activatable buffs (empowerment, sanctuary).
// Might need a new field on this type that references the buff perk, along with a fraction to indicate how often it's active.
// We also need to allow for different targets for when the buff is active.
export type SpellChoiceRef = { id: number; targets: number; ratio: number };
export type CreatureChoiceRef = { id: number; ratio: number; charmId?: number; charmTier?: number };

export type BuildStats = {
  vocation: Vocation;
  stanceIds: number[];
  level: number | null;
  bonus: number | null;
  skill: number | null;
  magicLevel: number | null;
  critChance: number | null;
  critDamage: number | null;
  fatalChance: number | null;
  transcendenceChance: number | null;
  hitPoints: number | null;
  manaPoints: number | null;
  baseMagicLevel: number | null;
  axe: number | null;
  club: number | null;
  sword: number | null;
  fist: number | null;
  distance: number | null;
  shielding: number | null;
  fishing: number | null;
  imbuementElement: ImbuementElement | null;
  imbuementValue: number | null;
};

export type Build = {
  stats: BuildStats;
  weapon: WeaponChoiceRef;
  perks: PerkChoiceRef[];
  rotation: SpellChoiceRef[];
  targets: CreatureChoiceRef[];
};

export type CollapsedSections = {
  basicStats: boolean;
  advancedStats: boolean;
  weapon: boolean;
  perks: boolean;
  rotation: boolean;
  targets: boolean;
};

export type CalculatorState = {
  version: number;
  A: Build;
  B: Build;
  perkOrder: number[];
  rotationOrder: number[];
  targetOrder: number[];
  showSecondBuild: boolean;
  collapsed: CollapsedSections;
  buildName: string;
};

export const buildTabTitle = (buildName: string): string => {
  const name = buildName.trim();
  return name ? `${name} – Damage Calculator` : "Damage Calculator";
};

const defaultStats = (): BuildStats => ({
  vocation: "knight",
  stanceIds: [],
  level: 8,
  bonus: 0,
  skill: 10,
  magicLevel: 0,
  critChance: 10,
  critDamage: 50,
  fatalChance: null,
  transcendenceChance: null,
  hitPoints: null,
  manaPoints: null,
  baseMagicLevel: null,
  axe: null,
  club: null,
  sword: null,
  fist: null,
  distance: null,
  shielding: null,
  fishing: null,
  imbuementElement: null,
  imbuementValue: null,
});

const defaultWeapon = (): WeaponChoiceRef => ({
  id: 1,
});

export const defaultBuild = (): Build => ({
  stats: defaultStats(),
  weapon: defaultWeapon(),
  perks: [],
  rotation: [],
  targets: [],
});

export const defaultCollapsed = (): CollapsedSections => ({
  basicStats: false,
  advancedStats: true,
  weapon: false,
  perks: false,
  rotation: false,
  targets: false,
});

export const defaultState = (): CalculatorState => ({
  version: 2,
  A: defaultBuild(),
  B: defaultBuild(),
  perkOrder: [],
  rotationOrder: [],
  targetOrder: [],
  showSecondBuild: false,
  collapsed: defaultCollapsed(),
  buildName: "",
});
