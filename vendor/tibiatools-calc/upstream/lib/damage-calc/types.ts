import type { Charm } from "@data/charms";
import type { BestiaryClass, Creature } from "@data/creatures";
import type { Perk } from "@data/perks";
import type { Shield } from "@data/shields";
import type { Element, Spell, SpellRawEffective } from "@data/spells";
import type { Ammo, Weapon } from "@data/weapons";
import type { CreatureChoiceRef, PerkChoiceRef, SpellChoiceRef, WeaponChoiceRef } from "./build-state";

export type WeaponChoice = WeaponChoiceRef & { weapon: Weapon; ammo?: Ammo; shield?: Shield };
export type PerkChoice = PerkChoiceRef & { perk: Perk };
export type SpellChoice = SpellChoiceRef & { spell: Spell };
export type SpellDamageChoice = SpellChoiceRef & { spellDamage: SpellRawEffective };
export type CreatureChoice = CreatureChoiceRef & { creature: Creature; charm?: Charm };

export type CharacterState = {
  flat: number;
  magicLevel: number;
  skill: number;
  weaponAttack: number;
  weaponDamage: number;
  critChance: number;
  critDamage: number;
  fatalChance: number;
  transcendenceChance: number;
  baseMagicLevel: number;
  axe: number;
  club: number;
  sword: number;
  fist: number;
  distance: number;
  shielding: number;
  fishing: number;
  shieldDef: number;
  baseHarmonyBonus: number;
  armorPenetration: number;
  pierceRegular: Record<Element, number>;
  pierceWeapon: Record<Element, number>;
  bestiaryDamage: Record<BestiaryClass, number>;
  charmUpgrade: number;
  homingMissiles: Record<Element, number>;
  extraHitChance: number;
  defenseMod: number;
};

export type SpellState = CharacterState & {
  spell: Spell;
  basePower: number;
  runicIncrease: number;
  focusMasteryIncrease: number;
};
