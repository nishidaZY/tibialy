import {
  allSpells,
  type DamageEffective,
  type Spell,
  type SpellElement,
  type SpellRawBreakdown,
  type SpellRawEffective,
} from "@data/spells";
import type { Stance } from "@data/stances.ts";
import type { BuildStats } from "./build-state.ts";
import { deriveCharacterState } from "./character-state.ts";
import { computeDamageBreakdown, computeRaw } from "./damage.ts";
import { applyHpBasedDmgBonuses, applyHpBasedDmgBonusesBasic, buildHpBasedDmgBrackets } from "./hp-bonus.ts";
import { applyPerkToSpell, stancePerks } from "./spell-perks.ts";
import type { CharacterState, CreatureChoice, PerkChoice, SpellChoice, SpellState, WeaponChoice } from "./types.ts";

/* calculate power via base power and any perks
 * use the updated power and your skills to calculate base damage
 * add on flat damage from level, wheel, and any extra damage perks
 * multiply by additional damage bonus if applicable (amp kor, ulus)
 * multiply by target's resistance
 * if physical damage, subtract the armor block (confirmed this is after res by testing on gazer spectres, and on spike traps)
 * roll for crit and fatal, if successful, multiply by the extra damage bonus including any crit damage perks (crit rounding is ceil)
 * multiply by target's mitigation
 * (calculate leech at this point)
 * multiply damage by attack prey and talisman
 */

export function computeResults(
  buildStats: BuildStats,
  stances: Stance[],
  weaponChoice: WeaponChoice,
  perkChoices: PerkChoice[],
  spellChoices: SpellChoice[],
  creatureChoices: CreatureChoice[],
): SpellRawEffective[] {
  const effectivePerks = [...perkChoices, ...stancePerks(stances, perkChoices)].sort(
    (a, b) => a.perk.priority - b.perk.priority,
  );
  const characterPerks = effectivePerks.filter((p) => p.perk.scopes.includes("character"));
  const spellPerks = effectivePerks.filter((p) => !p.perk.scopes.includes("character"));

  const characterState = deriveCharacterState(buildStats, weaponChoice, characterPerks);

  const spellStates = allSpells
    .filter((s) => s.vocations.includes(buildStats.vocation))
    // Only missiles for which the build has a perk are returned in the results.
    // Without this guard, we would add every missile as 0 damage hits, diluting dph and proccing charms.
    .filter(
      (s) =>
        s.spellType !== "homing-missile" || (s.element !== "weapon" && characterState.homingMissiles[s.element] > 0),
    )
    .map((spell) => {
      const initial: SpellState = initialSpellState(characterState, spell);
      let spellState: SpellState = spellPerks.reduce(
        (acc, perkChoice) => applyPerkToSpell(spell, perkChoice, weaponChoice.weapon.skill, buildStats.vocation, acc),
        initial,
      );

      if (spell.isSpender) {
        const vohMultiplier = stances.some((s) => s.effect == "virtue-of-harmony") ? 2 : 1;
        const harmonyBase = (spellState.baseHarmonyBonus + 7 + 0.005 * (buildStats.level ?? 0)) * vohMultiplier;
        const spenderHarmonyBonus = (16 * harmonyBase + 100) / 100;
        spellState = { ...spellState, basePower: spellState.basePower * spenderHarmonyBonus };
      }
      return spellState;
    });

  const ratioAdjustedHp = creatureChoices.reduce(
    (total, creatureChoice) => total + creatureChoice.ratio * creatureChoice.creature.hitpoints,
    0,
  );

  let results: SpellRawEffective[] = [];

  // Brackets for alpha/omega strike and combat mastery
  const hpBasedDmgBrackets = buildHpBasedDmgBrackets(characterPerks, weaponChoice.weapon);

  if (ratioAdjustedHp > 0) {
    let masteryElement: SpellElement | undefined;
    if (stances.some((s) => s.effect == "master-of-flames")) {
      masteryElement = "fire";
    } else if (stances.some((s) => s.effect == "master-of-thunder")) {
      masteryElement = "energy";
    } else if (stances.some((s) => s.effect == "master-of-decay")) {
      masteryElement = "death";
    }
    // for each creature, weight its spell damages by that creature's share of total HP and accumulate
    results = creatureChoices.reduce((acc: SpellRawEffective[], creatureChoice) => {
      const multiplier = (creatureChoice.ratio * creatureChoice.creature.hitpoints) / ratioAdjustedHp;

      // calculate all of the spell damages to this creature
      let spellDamages: SpellRawBreakdown[] = spellStates.map((spellState) => {
        const breakdown = computeDamageBreakdown(
          spellState,
          buildStats,
          weaponChoice,
          spellChoices,
          creatureChoice,
          masteryElement,
        );
        const raw = computeRaw(spellState, buildStats);
        return { ...spellState.spell, raw, breakdown };
      });

      // Apply alpha/omega strike and combat mastery
      spellDamages = applyHpBasedDmgBonuses(
        spellDamages,
        spellChoices,
        buildStats,
        characterState,
        hpBasedDmgBrackets,
        creatureChoice,
      );

      // The first creature contributes raw and its weighted effective
      if (acc.length == 0) {
        return spellDamages.map(({ breakdown, ...rest }) => ({
          ...rest,
          effective: weighEffective(breakdown.effective, multiplier),
        }));
      }
      // every later creature only adds its weighted effective on top
      return acc.map((accSd, i) => ({
        ...accSd,
        effective: addEffective(accSd.effective, weighEffective(spellDamages[i].breakdown.effective, multiplier)),
      }));
    }, []);
  } else {
    results = spellStates.map((spellState) => {
      const breakdown = computeDamageBreakdown(spellState, buildStats, weaponChoice, spellChoices);
      const raw = computeRaw(spellState, buildStats);
      return { ...spellState.spell, raw, effective: breakdown.effective };
    });
    results = applyHpBasedDmgBonusesBasic(results, hpBasedDmgBrackets);
  }

  if (!weaponChoice.shield) {
    results = results.map((r) =>
      r.scalesWith === "shielding"
        ? { ...r, raw: { min: 0, avg: 0, max: 0 }, effective: { avg: 0, elementalCharmDmg: 0, critCharmDmg: 0 } }
        : r,
    );
  }
  return results;
}

function initialSpellState(characterState: CharacterState, spell: Spell): SpellState {
  // Shallow copy: every spell state shares the same pierceRegular/pierceWeapon/bestiaryDamage records,
  // so a per-spell change must replace the record ({ ...state.pierceRegular }), never mutate it
  return {
    ...characterState,
    spell,
    basePower: spell.power,
    runicIncrease: 0,
    focusMasteryIncrease: 0,
  };
}

function weighEffective(e: DamageEffective, multiplier: number): DamageEffective {
  return {
    avg: e.avg * multiplier,
    critCharmDmg: e.critCharmDmg * multiplier,
    elementalCharmDmg: e.elementalCharmDmg * multiplier,
  };
}

function addEffective(a: DamageEffective, b: DamageEffective): DamageEffective {
  return {
    avg: a.avg + b.avg,
    critCharmDmg: a.critCharmDmg + b.critCharmDmg,
    elementalCharmDmg: a.elementalCharmDmg + b.elementalCharmDmg,
  };
}
