import { AUTO_ATTACK_ID, type SpellRawBreakdown, type SpellRawEffective } from "@data/spells";
import type { Weapon } from "@data/weapons";
import type { BuildStats, SpellChoiceRef } from "./build-state.ts";
import { calculateElementalCharmDmg } from "./creature-damage.ts";
import { hpBonusMultiplier, type DamageMixtureComponent, type HpBasedDmgBracket } from "./hp-bonus-multiplier.ts";
import { homingMissileChoices } from "./rotation-metrics.ts";
import type { CharacterState, CreatureChoice, PerkChoice, SpellChoice } from "./types.ts";

// Brackets for alpha/omega strike and combat mastery
export function buildHpBasedDmgBrackets(perkChoices: PerkChoice[], weapon: Weapon): HpBasedDmgBracket[] {
  const brackets: HpBasedDmgBracket[] = [];

  const alpha = perkChoices.find((p) => p.perk.bonusType === "alpha-strike");
  if (alpha && alpha.value > 0) brackets.push({ from: 0, to: 0.05, bonus: alpha.value / 100 });

  const omega = perkChoices.find((p) => p.perk.bonusType === "omega-strike");
  if (omega && omega.value > 0) brackets.push({ from: 0.7, to: 1, bonus: omega.value / 100 });

  const combatMastery = perkChoices.find((p) => p.perk.bonusType === "combat-mastery");
  if (combatMastery && combatMastery.value > 0) {
    const cmBonus = weapon.hands == "two" ? 2 : 1;
    const missingHpPerStep = combatMastery.value === 1 ? 0.14 : combatMastery.value === 2 ? 0.12 : 0.1;
    for (let step = 1; step * missingHpPerStep < 1; step++) {
      brackets.push({
        from: step * missingHpPerStep,
        to: Math.min(1, (step + 1) * missingHpPerStep),
        bonus: (step * cmBonus) / 100,
      });
    }
  }

  return brackets;
}

// Scale every spell's effective damage by the multiplier for all HP-based damage perks against this creature
export function applyHpBasedDmgBonuses(
  spellDamages: SpellRawBreakdown[],
  spellChoices: SpellChoice[],
  buildStats: BuildStats,
  characterState: CharacterState,
  brackets: HpBasedDmgBracket[],
  creatureChoice?: CreatureChoice,
): SpellRawBreakdown[] {
  if (brackets.length === 0) return spellDamages;

  const spellDamageById = new Map(spellDamages.map((sd) => [sd.id, sd]));
  let mixture: DamageMixtureComponent[] = [];
  if (creatureChoice) {
    mixture = buildDamageMixture(spellChoices, creatureChoice, buildStats, characterState, spellDamageById);
  }
  const creatureHp = creatureChoice?.creature.hitpoints ?? 0;
  const multiplier = hpBonusMultiplier(mixture, creatureHp, brackets);

  // Apply multiplier to every spell
  return spellDamages.map((sd) => ({
    ...sd,
    breakdown: {
      ...sd.breakdown,
      effective: {
        elementalCharmDmg: sd.breakdown.effective.elementalCharmDmg * multiplier.charm,
        avg: sd.breakdown.effective.avg * multiplier.spell,
        critCharmDmg: sd.breakdown.effective.critCharmDmg * multiplier.spell,
      },
    },
  }));
}

// Basic version of above where we don't use rotation/targets
export function applyHpBasedDmgBonusesBasic(
  spellDamages: SpellRawEffective[],
  brackets: HpBasedDmgBracket[],
): SpellRawEffective[] {
  if (brackets.length === 0) return spellDamages;

  const multiplier = hpBonusMultiplier([], 0, brackets);

  // Apply multiplier to every spell
  return spellDamages.map((sd) => ({
    ...sd,
    effective: {
      elementalCharmDmg: sd.effective.elementalCharmDmg * multiplier.charm,
      avg: sd.effective.avg * multiplier.spell,
      critCharmDmg: sd.effective.critCharmDmg * multiplier.spell,
    },
  }));
}

function buildDamageMixture(
  spellChoices: SpellChoice[],
  creatureChoice: CreatureChoice,
  buildStats: BuildStats,
  characterState: CharacterState,
  spellDamageById: Map<number, SpellRawBreakdown>,
): DamageMixtureComponent[] {
  const spellRotation = spellChoices.filter((s) => s.id !== AUTO_ATTACK_ID);
  const ratioSum = spellRotation.filter((s) => !s.spell.isExtra).reduce((sum, r) => sum + r.ratio, 0);

  const homingChoices = homingMissileChoices(
    spellChoices.map((s) => ({ ...s, spellType: s.spell.spellType, isExtra: s.spell.isExtra })),
    [...spellDamageById.values()],
  );
  const fullRotation: SpellChoiceRef[] = [
    ...spellChoices.map((s) => (s.id === AUTO_ATTACK_ID ? { ...s, ratio: ratioSum || 1 } : s)),
    ...homingChoices,
  ];
  const ratioTargetSum = fullRotation.reduce((sum, s) => sum + s.targets * s.ratio, 0);

  const mixture: DamageMixtureComponent[] = [];

  // TODO: charm charm-upgrade
  const charmDamage = calculateElementalCharmDmg(creatureChoice, buildStats, characterState);
  if (creatureChoice.charm && creatureChoice.charmTier && charmDamage > 0) {
    let charmChance = characterState.charmUpgrade;
    switch (creatureChoice.charmTier) {
      case 1:
        charmChance += 0.05;
        break;
      case 2:
        charmChance += 0.1;
        break;
      case 3:
        charmChance += 0.11;
        break;
    }
    mixture.push({ weight: charmChance, lo: charmDamage, hi: charmDamage, isCharm: true });
  }

  for (const spellChoice of fullRotation) {
    const spellDamage = spellDamageById.get(spellChoice.id);
    if (!spellDamage) continue;

    const weight: number = ratioTargetSum > 0 ? (spellChoice.ratio / ratioTargetSum) * spellChoice.targets : 0;
    if (weight <= 0) continue;

    const { noBonus, crit, fatal, critFatal } = spellDamage.breakdown;
    for (const atom of [noBonus, crit, fatal, critFatal]) {
      if (atom.probability <= 0) continue;
      mixture.push({ weight: weight * atom.probability, lo: atom.min, hi: atom.max, isCharm: false });
    }
  }
  return mixture;
}
