import spellOrderingRaw from "@data/spell-ordering.json";
import spellsRaw from "@data/spells.json";

export type SpellType = "auto" | "spell" | "rune" | "homing-missile";
export type ScalesWith = "magic" | "melee" | "shielding" | "distance" | "none";
export type Element = "death" | "earth" | "energy" | "fire" | "holy" | "ice" | "physical";
export type SpellElement = Element | "weapon";
export type Rounding = "floor" | "round" | "ceil";

export const allElements: Element[] = ["death", "earth", "energy", "fire", "holy", "ice", "physical"];

export const AUTO_ATTACK_ID = 1;

export type Spell = {
  id: number;
  scope: string;
  name: string;
  displayName: string;
  spellType: SpellType;
  scalesWith: ScalesWith;
  element: SpellElement;
  power: number;
  skillFactor: number;
  buckets: number;
  rounding: Rounding;
  additionalDamageMultiplier: number;
  isSpender: boolean;
  turnCooldown: number;
  isFocus: boolean;
  vocations: string[];
  runic: string[];
  spells: number[];
  stage?: number;
  isSelectable: boolean;
  isExtra: boolean;
  visible: boolean;
  targetsLabel?: string;
};

export type SpellOrdering = {
  vocation: string;
  order: string[];
};

export type DamageRange = {
  min?: number;
  avg: number;
  max?: number;
};

export type BreakdownDamageRange = {
  min: number;
  avg: number;
  max: number;
  probability: number;
};

export type DamageEffective = {
  avg: number;
  elementalCharmDmg: number; // not included in effectiveAvg
  critCharmDmg: number; // is included in effectiveAvg
};

export type DamageBreakdown = {
  noBonus: BreakdownDamageRange;
  crit: BreakdownDamageRange;
  fatal: BreakdownDamageRange;
  critFatal: BreakdownDamageRange;
  missChance: number;
  effective: DamageEffective;
};

export type RawBreakdown = {
  raw: DamageRange;
  breakdown: DamageBreakdown;
};

export type RawEffective = {
  raw: DamageRange;
  effective: DamageEffective;
};

export type SpellRawBreakdown = Spell & RawBreakdown;

export type SpellRawEffective = Spell & RawEffective;

export const allSpells: Spell[] = (spellsRaw as unknown[] as Spell[]).map((s) => ({
  ...s,
  displayName: s.displayName ?? s.name,
  additionalDamageMultiplier: s.additionalDamageMultiplier ?? 1,
  isSpender: s.isSpender ?? false,
  turnCooldown: s.turnCooldown ?? 1,
  isFocus: s.isFocus ?? false,
  runic: s.runic ?? [],
  spells: s.spells ?? [s.id],
  isSelectable: s.isSelectable ?? true,
  isExtra: s.isExtra ?? false,
  visible: s.visible ?? true,
}));

export const spellOrdering: SpellOrdering[] = spellOrderingRaw as SpellOrdering[];

export const beamScopes: string[] = ["great-death-beam", "great-energy-beam", "energy-beam"];
