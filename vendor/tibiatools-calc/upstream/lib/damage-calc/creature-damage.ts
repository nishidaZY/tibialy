import type { BestiaryClass, Creature } from "@data/creatures";
import { allElements, type Element } from "@data/spells";
import type { Weapon } from "@data/weapons";
import type { CharacterState, CreatureChoice, SpellState } from "@lib/damage-calc";
import type { BuildStats } from "./build-state";

export function initElements(): Record<Element, number> {
  return {
    death: 0,
    earth: 0,
    energy: 0,
    fire: 0,
    holy: 0,
    ice: 0,
    physical: 0,
  };
}

// Calculates the full charm damage, ignoring the chance
export function calculateElementalCharmDmg(
  creatureChoice: CreatureChoice,
  buildStats: BuildStats,
  state: CharacterState,
): number {
  if (!creatureChoice.charm) return 0;
  if (creatureChoice.charm.element) {
    const element = creatureChoice.charm.element;
    const cap = Math.min((buildStats.level ?? 0) * 2, creatureChoice.creature.hitpoints * 0.05);
    // Weapon pierce doesn't affect charms
    const resistance = applyPierce(creatureDmgMod(creatureChoice.creature, element), state.pierceRegular[element]);
    return cap * resistance * (1 - creatureChoice.creature.mitigation / 100);
  } else if (creatureChoice.charm.effect == "overpower") {
    return Math.min((buildStats.hitPoints ?? 0) * 0.05, creatureChoice.creature.hitpoints * 0.08);
  } else if (creatureChoice.charm.effect == "overflux") {
    return Math.min((buildStats.manaPoints ?? 0) * 0.025, creatureChoice.creature.hitpoints * 0.08);
  } else return 0;
}

export function updateElementsFromWeapon(elements: Record<Element, number>, damage: number, weapon: Weapon) {
  if (weapon.attack) {
    elements.death = (damage * (weapon.attackDeath ?? 0)) / weapon.attack;
    elements.earth = (damage * (weapon.attackEarth ?? 0)) / weapon.attack;
    elements.energy = (damage * (weapon.attackEnergy ?? 0)) / weapon.attack;
    elements.fire = (damage * (weapon.attackFire ?? 0)) / weapon.attack;
    elements.ice = (damage * (weapon.attackIce ?? 0)) / weapon.attack;
    elements.physical = (damage * (weapon.attackPhysical ?? 0)) / weapon.attack;
  } else {
    console.warn("called with undefined weapon attack:");
    console.warn(weapon);
  }
}

export function elementalEffective(
  elementsMin: Record<Element, number>,
  elementsAvg: Record<Element, number>,
  elementsMax: Record<Element, number>,
  spellState: SpellState,
  creatureChoice: CreatureChoice,
): number {
  const armor = Math.ceil(creatureChoice.creature.armor * (1 - spellState.armorPenetration));
  const extraDamage = 1 + bestiaryExtraDamage(creatureChoice.creature, spellState);
  const piercedDmgMod = (element: Element) =>
    applyPierce(
      creatureDmgMod(creatureChoice.creature, element),
      spellState.pierceRegular[element] + spellState.pierceWeapon[element],
    );
  const elementalDmg = allElements
    .filter((element) => element != "physical")
    .reduce((sum, element) => sum + elementsAvg[element] * piercedDmgMod(element), 0);
  const physicalDmgMod = piercedDmgMod("physical");
  return (
    (elementalDmg +
      avgDamageVsArmor(
        elementsMin.physical * physicalDmgMod,
        elementsMax.physical * physicalDmgMod,
        Math.max(Math.floor(armor / 2), 0),
        Math.max(Math.floor(armor / 2) * 2 - 1, 0),
      )) *
    (1 - creatureChoice.creature.mitigation / 100) *
    extraDamage
  );
}

export function applyElementalAttackImbuement(weapon: Weapon, aoeAA: boolean, stats: BuildStats): Weapon {
  if (!stats.imbuementElement || stats.imbuementValue == null) return weapon;
  if (weapon.attack != weapon.attackPhysical) return weapon; // Disallow elemental imbuements on elemental weapons
  if (aoeAA) return weapon; // Disallow elemental imbuements for AOE AAs such as diamond arrows
  const elementalAttack = (weapon.attack ?? 0) * stats.imbuementValue;
  const attackDeath = stats.imbuementElement == "death" ? elementalAttack : weapon.attackDeath;
  const attackEarth = stats.imbuementElement == "earth" ? elementalAttack : weapon.attackEarth;
  const attackEnergy = stats.imbuementElement == "energy" ? elementalAttack : weapon.attackEnergy;
  const attackFire = stats.imbuementElement == "fire" ? elementalAttack : weapon.attackFire;
  const attackIce = stats.imbuementElement == "ice" ? elementalAttack : weapon.attackIce;
  return {
    ...weapon,
    attackDeath,
    attackEarth,
    attackEnergy,
    attackFire,
    attackIce,
    attackPhysical: (weapon.attackPhysical ?? 0) - elementalAttack,
  };
}

function creatureDmgMod(creature: Creature, element: Element): number {
  return creature[`${element}DmgMod`];
}

function bestiaryExtraDamage(creature: Creature, spellState: SpellState): number {
  return spellState.bestiaryDamage[creature.bestiaryClass as BestiaryClass] ?? 0;
}

function applyPierce(resistance: number, pierce: number): number {
  if (resistance <= 0) return resistance; // "Sensitivities of 0% can never be increased."
  const headroom = Math.max(0, 1 - resistance);
  const fullPierce = Math.min(headroom, pierce);
  const halfPierce = Math.ceil(Math.round((pierce - fullPierce) * 100) / 2) / 100; // "The increase is halved above sensitivities of 100% (rounded up)."
  return Math.min(resistance + fullPierce + halfPierce, resistance * 2); // "Can double the sensitivity at most."
}

/**
 * The calculation splits the damage values into three regions (fully blocked, partially blocked, fully exceeds),
 * and then for each value d in that region, we can calculate how much damage it should do for all armor rolls.
 * Then we sum every d, which simplifies to a closed-form formula in every case.
 */
function avgDamageVsArmor(dMin: number, dMax: number, aMin: number, aMax: number): number {
  // number of damage and armor values that can be rolled
  const nD = dMax - dMin + 1;
  const nA = aMax - aMin + 1;
  if (nD <= 0 || nA <= 0) return 0;

  let S = 0;
  // Region 1: d is fully blocked by all possible armor values, so contributes 0

  // Region 2: d partially overlaps armor range
  // d in [max(dMin, aMin+1), min(dMax, aMax)]
  // contribution per d: triangular sum m(m+1)/2 where m = d - aMin
  // total of all d in this region is a sum of triangular numbers, which is a tetrahedral number (te)
  const lo2 = Math.max(dMin, aMin + 1);
  const hi2 = Math.min(dMax, aMax);
  if (lo2 <= hi2) {
    const p = lo2 - aMin;
    const q = hi2 - aMin;
    const te = (k: number) => (k * (k + 1) * (k + 2)) / 6;
    S += te(q) - te(p - 1);
  }

  // Region 3: d exceeds entire armor range, some damage always gets through
  // d in [max(dMin, aMax+1), dMax]
  // contribution per d: nA * (d - avg_armor)
  const lo3 = Math.max(dMin, aMax + 1);
  if (lo3 <= dMax) {
    const count = dMax - lo3 + 1;
    S += nA * count * ((lo3 + dMax) / 2 - (aMin + aMax) / 2);
  }

  return S / (nD * nA);
}
