import { beamScopes, type DamageBreakdown, type DamageRange, type Spell, type SpellElement } from "@data/spells";
import type { CreatureChoice, SpellChoice, SpellState, WeaponChoice } from "@lib/damage-calc";
import type { BuildStats } from "./build-state";
import {
  applyElementalAttackImbuement,
  calculateElementalCharmDmg,
  elementalEffective,
  initElements,
  updateElementsFromWeapon,
} from "./creature-damage";

export function computeRaw(state: SpellState, buildStats: BuildStats): DamageRange {
  if (state.spell.spellType === "auto") {
    const attackValueWithoutFlat = (Math.floor((6 * state.weaponAttack) / 5) * (state.skill + 4)) / 28;
    const attackIncrease = buildStats.vocation == "monk" ? 2 : 1;
    let min, avg, max;
    if (state.weaponDamage) {
      min = undefined;
      avg = state.weaponDamage;
      max = undefined;
    } else {
      min = Math.floor(state.flat + (attackValueWithoutFlat * attackIncrease) / 2);
      avg = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease);
      max = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease * 2);
    }
    return { ...state.spell, min, avg, max };
  } else {
    const avg = computeAvg(state.spell, state);
    const min = state.spell.buckets != 0 ? computeMinMax(state.spell, -1, state) : undefined;
    const max = state.spell.buckets != 0 ? computeMinMax(state.spell, 1, state) : undefined;
    return { min, avg, max };
  }
}

// For a single spell+creature combo.
export function computeDamageBreakdown(
  state: SpellState,
  buildStats: BuildStats,
  weaponChoice: WeaponChoice,
  spellChoices: SpellChoice[],
  creatureChoice?: CreatureChoice,
  masteryElement?: SpellElement,
): DamageBreakdown {
  let charmCritChance = 0;
  let charmCritDamage = 0;
  if (creatureChoice?.charm && creatureChoice.charmTier) {
    if (creatureChoice.charm.effect == "low-blow") {
      if (creatureChoice.charmTier == 1) charmCritChance = 0.04;
      else if (creatureChoice.charmTier == 2) charmCritChance = 0.08;
      else charmCritChance = 0.09;
    } else if (creatureChoice.charm.effect == "savage-blow") {
      if (creatureChoice.charmTier == 1) charmCritDamage = 0.2;
      else if (creatureChoice.charmTier == 2) charmCritDamage = 0.4;
      else charmCritDamage = 0.44;
    }
  }

  let nTranscendenceAttacks;
  if (state.spell.spellType === "auto") nTranscendenceAttacks = 3;
  else nTranscendenceAttacks = 3.9;
  const pT = state.transcendenceChance;
  const pTCrit = (nTranscendenceAttacks * pT) / (nTranscendenceAttacks * pT + 1);
  const critChance = Math.min(state.critChance + charmCritChance, 1);
  const c = 1 - (1 - critChance) * (1 - pTCrit);
  const o = state.fatalChance;
  const pCrit = c * (1 - o);
  const pFatal = o * (1 - c);
  const pCritFatal = c * o;
  const pNoBonus = (1 - c) * (1 - o);
  // Increase crit damage by the ratio of transcendence crits, which have 15% extra damage
  const critDamage = state.critDamage + charmCritDamage + (0.15 * pTCrit) / (pTCrit + (1 - pTCrit) * critChance || 1);

  let mergedWeaponChoice = mergeAmmoIntoWeapon(weaponChoice);

  let breakdown;
  if (state.spell.spellType === "auto") {
    breakdown = computeEffectiveAuto(
      state,
      buildStats,
      pCrit,
      pFatal,
      pCritFatal,
      pNoBonus,
      critDamage,
      mergedWeaponChoice,
      creatureChoice,
    );
  } else if (state.spell.spellType === "homing-missile") {
    breakdown = computeEffectiveHomingMissile(state, buildStats, creatureChoice);
  } else {
    breakdown = computeEffectiveSpell(
      state.spell,
      buildStats,
      state,
      pCrit,
      pFatal,
      pCritFatal,
      pNoBonus,
      critDamage,
      mergedWeaponChoice,
      spellChoices,
      creatureChoice,
      masteryElement,
    );
  }

  let elementalCharmDmg = 0;
  let critCharmDmg = 0;

  if (creatureChoice?.charm && creatureChoice.charmTier) {
    let elementalChance = state.charmUpgrade;
    switch (creatureChoice.charmTier) {
      case 1:
        elementalChance += 0.05;
        break;
      case 2:
        elementalChance += 0.1;
        break;
      case 3:
        elementalChance += 0.11;
        break;
    }
    if (creatureChoice.charm.effect == "low-blow" || creatureChoice.charm.effect == "savage-blow") {
      const breakdownWithoutCharm = computeDamageBreakdown(
        state,
        buildStats,
        mergedWeaponChoice,
        spellChoices,
        {
          ...creatureChoice,
          charm: undefined,
          charmTier: undefined,
        },
        masteryElement,
      );
      critCharmDmg = breakdown.effective.avg - breakdownWithoutCharm.effective.avg;
    } else {
      elementalCharmDmg =
        elementalChance * (1 - breakdown.missChance) * calculateElementalCharmDmg(creatureChoice, buildStats, state);
    }
  }

  let effectiveAvg = breakdown.effective.avg;

  // AOE auto-attacks only proc charms on the primary target (except low blow which is exempt)
  if (state.spell.spellType == "auto" && creatureChoice?.charm?.effect != "low-blow") {
    const autoAttack = spellChoices.find((s) => s.spell.spellType == "auto");
    const targets = Math.max(autoAttack?.targets ?? 1, 1);
    effectiveAvg -= critCharmDmg * (1 - 1 / targets);
    critCharmDmg /= targets;
    elementalCharmDmg /= targets;
  }

  const effective = { avg: effectiveAvg, critCharmDmg, elementalCharmDmg };
  return { ...breakdown, effective };
}

// Adds all of the ammo's attack values onto the weapon, for simplicity
function mergeAmmoIntoWeapon(weaponChoice: WeaponChoice): WeaponChoice {
  const { weapon, ammo } = weaponChoice;
  if (!ammo) return weaponChoice;
  const attack = (weapon.attack ?? 0) + ammo.attack;
  const scale = ammo.attack > 0 ? attack / ammo.attack : 0;
  return {
    ...weaponChoice,
    weapon: {
      ...weapon,
      attack,
      ...(ammo.attack > 0 && {
        attackDeath: (ammo.attackDeath ?? 0) * scale,
        attackEarth: (ammo.attackEarth ?? 0) * scale,
        attackEnergy: (ammo.attackEnergy ?? 0) * scale,
        attackFire: (ammo.attackFire ?? 0) * scale,
        attackIce: (ammo.attackIce ?? 0) * scale,
        attackPhysical: ammo.attackPhysical * scale,
      }),
    },
    ammo: {
      ...ammo,
      attack: 0,
      attackDeath: 0,
      attackEarth: 0,
      attackEnergy: 0,
      attackFire: 0,
      attackIce: 0,
      attackPhysical: 0,
    },
  };
}

function computeEffectiveAuto(
  state: SpellState,
  buildStats: BuildStats,
  pCrit: number,
  pFatal: number,
  pCritFatal: number,
  pNoBonus: number,
  critDamage: number,
  weaponChoice: WeaponChoice,
  creatureChoice?: CreatureChoice,
): DamageBreakdown {
  const aoeAA = !!weaponChoice.ammo?.aoe;
  let weapon = weaponChoice.weapon;
  weapon = applyElementalAttackImbuement(weapon, aoeAA, buildStats);

  let min, avg, max, hrMin, hrAvg, hrMax;
  const minElements = initElements();
  const avgElements = initElements();
  const maxElements = initElements();
  const hrMinElements = initElements();
  const hrAvgElements = initElements();
  const hrMaxElements = initElements();

  const attackValueWithoutFlat = (Math.floor((6 * state.weaponAttack) / 5) * (state.skill + 4)) / 28;
  const attackIncrease = buildStats.vocation == "monk" ? 1.5 : 1;

  if (weapon.damageType) {
    // wand or rod, no high roll and no variance
    const damage = weapon.damage ?? 0;
    min = hrMin = damage;
    avg = hrAvg = damage;
    max = hrMax = damage;
    minElements[weapon.damageType] = damage;
    avgElements[weapon.damageType] = damage;
    maxElements[weapon.damageType] = damage;
    hrMinElements[weapon.damageType] = damage;
    hrAvgElements[weapon.damageType] = damage;
    hrMaxElements[weapon.damageType] = damage;
  } else {
    // regular weapon
    min = Math.floor(state.flat + (attackValueWithoutFlat * attackIncrease) / 2);
    avg = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease);
    // This is not the true max and should never be shown directly to the user. It is only used for slightly improved calculations.
    max = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease * 1.5);
    hrMin = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease * 1.5);
    hrAvg = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease * 1.75);
    hrMax = Math.floor(state.flat + attackValueWithoutFlat * attackIncrease * 2);
    if (weapon.attack && weapon.attack > 0) {
      updateElementsFromWeapon(minElements, min, weapon);
      updateElementsFromWeapon(avgElements, avg, weapon);
      updateElementsFromWeapon(maxElements, max, weapon);
      updateElementsFromWeapon(hrMinElements, hrMin, weapon);
      updateElementsFromWeapon(hrAvgElements, hrAvg, weapon);
      updateElementsFromWeapon(hrMaxElements, hrMax, weapon);
    }
  }

  let effectiveAvg = 0;
  let hrEffectiveAvg = 0;
  if (creatureChoice) {
    min = elementalEffective(minElements, minElements, minElements, state, creatureChoice);
    avg = elementalEffective(avgElements, avgElements, avgElements, state, creatureChoice);
    max = elementalEffective(maxElements, maxElements, maxElements, state, creatureChoice);
    hrMin = elementalEffective(hrMinElements, hrMinElements, hrMinElements, state, creatureChoice);
    hrAvg = elementalEffective(hrAvgElements, hrAvgElements, hrAvgElements, state, creatureChoice);
    hrMax = elementalEffective(hrMaxElements, hrMaxElements, hrMaxElements, state, creatureChoice);
    effectiveAvg = elementalEffective(minElements, avgElements, maxElements, state, creatureChoice);
    hrEffectiveAvg = elementalEffective(hrMinElements, hrAvgElements, hrMaxElements, state, creatureChoice);
  } else {
    effectiveAvg = avg;
    hrEffectiveAvg = hrAvg;
  }

  if (weapon.damageType) {
    // wand or rod, doesn't get high roll crits
    effectiveAvg =
      effectiveAvg * (pNoBonus + pCrit * (1 + critDamage) + pFatal * 1.6 + pCritFatal * (1.6 + critDamage));
  } else {
    // regular weapon
    effectiveAvg = aoeAA
      ? effectiveAvg * (pNoBonus + pCrit * (1 + critDamage) + pFatal * 1.6 + pCritFatal * (1.6 + critDamage))
      : pNoBonus * effectiveAvg +
        pCrit * hrEffectiveAvg * (1 + critDamage) +
        pFatal * hrEffectiveAvg * 1.6 +
        pCritFatal * hrEffectiveAvg * (1.6 + critDamage);
  }

  const hitRate = Math.min(
    1,
    state.extraHitChance + (weaponChoice.weapon.hitMod ?? 0) + (weaponChoice.ammo?.hitChance ?? 1),
  );
  const breakdown: DamageBreakdown = {
    noBonus: { min, avg, max, probability: pNoBonus },
    crit: {
      min: hrMin * (1 + critDamage),
      avg: hrAvg * (1 + critDamage),
      max: hrMax * (1 + critDamage),
      probability: pCrit * hitRate,
    },
    fatal: { min: hrMin * 1.6, avg: hrAvg * 1.6, max: hrMax * 1.6, probability: pFatal * hitRate },
    critFatal: {
      min: hrMin * (1.6 + critDamage),
      avg: hrAvg * (1.6 + critDamage),
      max: hrMax * (1.6 + critDamage),
      probability: pCritFatal * hitRate,
    },
    missChance: 1 - hitRate,
    effective: { avg: effectiveAvg * hitRate, elementalCharmDmg: 0, critCharmDmg: 0 },
  };
  return breakdown;
}

function computeEffectiveSpell(
  originalSpell: Spell,
  buildStats: BuildStats,
  state: SpellState,
  pCrit: number,
  pFatal: number,
  pCritFatal: number,
  pNoBonus: number,
  critDamage: number,
  weaponChoice: WeaponChoice,
  spellChoices: SpellChoice[],
  creatureChoice?: CreatureChoice,
  masteryElement?: SpellElement,
): DamageBreakdown {
  let weapon = weaponChoice.weapon;
  weapon = applyElementalAttackImbuement(weapon, false, buildStats);
  const spell =
    masteryElement && originalSpell.spellType == "spell"
      ? { ...originalSpell, element: masteryElement }
      : { ...originalSpell };

  if (state.focusMasteryIncrease > 0) {
    const focusRatioSum = spellChoices
      .filter((s) => !s.spell.isExtra && s.spell.isFocus)
      .reduce((sum, r) => sum + r.ratio, 0);
    const currentSpellRatioSum = spellChoices
      .filter((s) => !s.spell.isExtra && s.spell.scope == spell.scope)
      .reduce((sum, r) => sum + r.ratio, 0);
    if (currentSpellRatioSum > 0) {
      spell.additionalDamageMultiplier *=
        1 + state.focusMasteryIncrease * Math.min(1, focusRatioSum / currentSpellRatioSum);
    }
  }

  let min, avg, max;
  const minElements = initElements();
  const avgElements = initElements();
  const maxElements = initElements();

  // Beam mastery: for each target hit by a beam spell, the damage of beam spells is increased by 10%/12%/14% (up to a maximum of 30%/36%/42%).
  if (beamScopes.includes(state.spell.scope)) {
    const centralBeam = spellChoices.find((s) => s.spell.scope == state.spell.scope && s.spell.stage == 0);
    const cappedCentralTargets = Math.min(3, centralBeam?.targets ?? 0);
    const groupStages = spellChoices.filter((s) => s.spell.scope == state.spell.scope).map((s) => s.spell.stage ?? 0);
    const maxStage = Math.max(0, ...groupStages);
    const bmBaseBonus = maxStage == 0 ? 0 : (8 + 2 * maxStage) / 100;
    spell.additionalDamageMultiplier *= 1 + cappedCentralTargets * bmBaseBonus;
  }

  if (state.runicIncrease == 0) {
    min = computeMinMax(spell, -1, state);
    avg = computeAvg(spell, state);
    max = computeMinMax(spell, 1, state);
  } else {
    const stateWithRunicBonus = { ...state, magicLevel: state.magicLevel + 0.25 * state.runicIncrease };
    min = computeMinMax(spell, -1, stateWithRunicBonus);
    avg = computeAvg(spell, stateWithRunicBonus);
    max = computeMinMax(spell, 1, stateWithRunicBonus);
  }

  if (spell.scope == "chained-penance") {
    const chainedPenance = spellChoices.find((s) => s.spell.scope == "chained-penance");
    if (chainedPenance) {
      const decay = 0.95;
      const targets = Math.max(chainedPenance.targets, 1);
      min = (min * (1 - Math.pow(decay, targets))) / (1 - decay) / targets;
      avg = (avg * (1 - Math.pow(decay, targets))) / (1 - decay) / targets;
      max = (max * (1 - Math.pow(decay, targets))) / (1 - decay) / targets;
    }
  }

  if (spell.element == "weapon") {
    if (weapon.attack && weapon.attack > 0) {
      if (weapon.bond) {
        minElements[weapon.bond] = min;
        avgElements[weapon.bond] = avg;
        maxElements[weapon.bond] = max;
      } else {
        updateElementsFromWeapon(minElements, min, weapon);
        updateElementsFromWeapon(avgElements, avg, weapon);
        updateElementsFromWeapon(maxElements, max, weapon);
      }
    }
  } else {
    minElements[spell.element] = min;
    avgElements[spell.element] = avg;
    maxElements[spell.element] = max;
  }

  let effectiveAvg = 0;
  if (creatureChoice) {
    min = elementalEffective(minElements, minElements, minElements, state, creatureChoice);
    avg = elementalEffective(avgElements, avgElements, avgElements, state, creatureChoice);
    max = elementalEffective(maxElements, maxElements, maxElements, state, creatureChoice);
    effectiveAvg = elementalEffective(minElements, avgElements, maxElements, state, creatureChoice);
  } else {
    effectiveAvg = avg;
  }

  effectiveAvg = effectiveAvg * (pNoBonus + pCrit * (1 + critDamage) + pFatal * 1.6 + pCritFatal * (1.6 + critDamage));

  const breakdown: DamageBreakdown = {
    noBonus: { min, avg, max, probability: pNoBonus },
    crit: { min: min * (1 + critDamage), avg: avg * (1 + critDamage), max: max * (1 + critDamage), probability: pCrit },
    fatal: { min: min * 1.6, avg: avg * 1.6, max: max * 1.6, probability: pFatal },
    critFatal: {
      min: min * (1.6 + critDamage),
      avg: avg * (1.6 + critDamage),
      max: max * (1.6 + critDamage),
      probability: pCritFatal,
    },
    missChance: 0,
    effective: { avg: effectiveAvg, elementalCharmDmg: 0, critCharmDmg: 0 },
  };
  return breakdown;
}

/**
 * We are making some assumptions here:
 * 1) Assuming that homing missiles cannot crit
 * 2) Assuming that homing missiles are affected by creature's resistance, elemental pierce, mitigation
 * 3) And due to how this function is called, it also assumes that homing missiles can proc charms
 * Will investigate each of these assumptions and update accordingly in the future.
 */
function computeEffectiveHomingMissile(
  state: SpellState,
  buildStats: BuildStats,
  creatureChoice?: CreatureChoice,
): DamageBreakdown {
  const element = state.spell.element;
  const elements = initElements();
  let avg = 0;
  if (element !== "weapon") {
    avg = (buildStats.level ?? 0) * state.homingMissiles[element];
    elements[element] = avg;
  }
  let effectiveAvg = avg;

  if (creatureChoice) {
    effectiveAvg = elementalEffective(elements, elements, elements, state, creatureChoice);
  }

  const breakdown: DamageBreakdown = {
    noBonus: { min: avg, avg, max: avg, probability: 1 },
    crit: {
      min: 0,
      avg: 0,
      max: 0,
      probability: 0,
    },
    fatal: {
      min: 0,
      avg: 0,
      max: 0,
      probability: 0,
    },
    critFatal: {
      min: 0,
      avg: 0,
      max: 0,
      probability: 0,
    },
    missChance: 0,
    effective: { avg: effectiveAvg, elementalCharmDmg: 0, critCharmDmg: 0 },
  };
  return breakdown;
}

function computeAvg(spell: Spell, state: SpellState): number {
  const { basePower: P, flat: F, magicLevel: ML, skill: S, weaponAttack: W } = state;
  const D = state.shieldDef + state.defenseMod;
  const round = spell.rounding === "floor" ? Math.floor : spell.rounding === "ceil" ? Math.ceil : Math.round;
  const damage =
    spell.element === "weapon"
      ? F + round((P / spell.skillFactor) * S * W + P / 4)
      : spell.scalesWith === "shielding"
        ? F + round((P / spell.skillFactor) * state.shielding * D + P / 4)
        : spell.scalesWith === "distance"
          ? F + round((P / spell.skillFactor) * S + P / 4)
          : F + round((P / spell.skillFactor) * ML + P / 4);
  return Math.ceil(damage * spell.additionalDamageMultiplier);
}

function computeMinMax(spell: Spell, minMax: number, state: SpellState): number {
  const { basePower: P, flat: F, magicLevel: ML, skill: S, weaponAttack: W } = state;
  const D = state.shieldDef + state.defenseMod;
  const round = spell.rounding === "floor" ? Math.floor : spell.rounding === "ceil" ? Math.ceil : Math.round;
  const variation = spell.buckets / P / 2;
  const damage =
    spell.element === "weapon"
      ? F + round((1 + minMax * variation) * ((P / spell.skillFactor) * S * W + P / 4))
      : spell.scalesWith === "shielding"
        ? F + round((1 + minMax * variation) * ((P / spell.skillFactor) * state.shielding * D + P / 4))
        : spell.scalesWith === "distance"
          ? F + round((1 + minMax * variation) * ((P / spell.skillFactor) * S + P / 4))
          : F + round((1 + minMax * variation) * ((P / spell.skillFactor) * ML + P / 4));
  return Math.ceil(damage * spell.additionalDamageMultiplier);
}
