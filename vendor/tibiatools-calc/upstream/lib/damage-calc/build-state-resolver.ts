import { allCharms, type Charm } from "@data/charms";
import { allCreatures, type Creature } from "@data/creatures";
import { allPerks, type Perk } from "@data/perks";
import { allShields, type Shield } from "@data/shields";
import { allSpells, type Spell, type SpellRawEffective } from "@data/spells";
import { allStances, type Stance } from "@data/stances";
import { allAmmo, allWeapons, type Ammo, type Weapon } from "@data/weapons";
import type { CreatureChoiceRef, PerkChoiceRef, SpellChoiceRef, WeaponChoiceRef } from "./build-state";
import { homingMissileChoices } from "./rotation-metrics";
import type { CreatureChoice, PerkChoice, SpellChoice, SpellDamageChoice, WeaponChoice } from "./types";

const weaponsById: Record<number, Weapon> = Object.fromEntries(allWeapons.map((i) => [i.id, i]));
const ammoById: Record<number, Ammo> = Object.fromEntries(allAmmo.map((i) => [i.id, i]));
const shieldsById: Record<number, Shield> = Object.fromEntries(allShields.map((i) => [i.id, i]));
const perkDefsById: Record<number, Perk> = Object.fromEntries(allPerks.map((i) => [i.id, i]));
const spellDefsById: Record<number, Spell> = Object.fromEntries(allSpells.map((i) => [i.id, i]));
const creaturesById: Record<number, Creature> = Object.fromEntries(allCreatures.map((i) => [i.id, i]));
const charmsById: Record<number, Charm> = Object.fromEntries(allCharms.map((i) => [i.id, i]));
const stancesById: Record<number, Stance> = Object.fromEntries(allStances.map((i) => [i.id, i]));

export function resolveStances(stanceIds: number[]): Stance[] {
  return stanceIds
    .map((id) => {
      const stance = stancesById[id];
      if (!stance) {
        console.warn(`Unknown stance id: ${id}`);
        return null;
      }
      return stance;
    })
    .filter((s): s is Stance => s !== null);
}

export function resolveWeapon(weaponChoiceRef: WeaponChoiceRef): WeaponChoice {
  const weapon = weaponsById[weaponChoiceRef.id];
  const ammo = weaponChoiceRef.ammoId ? ammoById[weaponChoiceRef.ammoId] : undefined;
  const shield = weaponChoiceRef.shieldId ? shieldsById[weaponChoiceRef.shieldId] : undefined;
  return { ...weaponChoiceRef, weapon, ammo, shield };
}

export function resolvePerks(perkChoiceRefs: PerkChoiceRef[]): PerkChoice[] {
  return perkChoiceRefs
    .map((p) => {
      const perk = perkDefsById[p.id];
      if (!perk) {
        console.warn(`Unknown perk id: ${p.id}`);
        return null;
      }
      return { ...p, perk };
    })
    .filter((x): x is PerkChoice => x !== null);
}

export function resolveSpells(spellChoiceRefs: SpellChoiceRef[]): SpellChoice[] {
  return spellChoiceRefs
    .map((s) => {
      const spell = spellDefsById[s.id];
      if (!spell) {
        console.warn(`Unknown spell id: ${s.id}`);
        return null;
      }
      return { ...s, spell };
    })
    .filter((x): x is SpellChoice => x !== null);
}

export function resolveSpellDamages(
  spellChoiceRefs: SpellChoiceRef[],
  spellDamages: SpellRawEffective[],
): SpellDamageChoice[] {
  const spellDamagesById: Record<number, SpellRawEffective> = Object.fromEntries(spellDamages.map((i) => [i.id, i]));
  const rotation = spellChoiceRefs
    .map((s) => {
      const spellDamage = spellDamagesById[s.id];
      if (!spellDamage) {
        console.warn(`Unknown spell id: ${s.id}`);
        return null;
      }
      return { ...s, spellDamage };
    })
    .filter((x): x is SpellDamageChoice => x !== null);

  const homingMissiles = homingMissileChoices(
    rotation.map((s) => ({ ...s, spellType: s.spellDamage.spellType, isExtra: s.spellDamage.isExtra })),
    spellDamages,
  );
  return [...rotation, ...homingMissiles];
}

export function resolveCreatures(creatureChoiceRefs: CreatureChoiceRef[]): CreatureChoice[] {
  return creatureChoiceRefs
    .map((t) => {
      const creature = creaturesById[t.id];
      if (!creature) {
        console.warn(`Unknown creature id: ${t.id}`);
        return null;
      }
      let charm;
      if (t.charmId) {
        charm = charmsById[t.charmId];
        if (!charm) {
          console.warn(`Unknown charm id: ${t.charmId}`);
          return null;
        }
      }
      return { ...t, creature, ...(charm && { charm }) };
    })
    .filter((x): x is CreatureChoice => x !== null);
}
