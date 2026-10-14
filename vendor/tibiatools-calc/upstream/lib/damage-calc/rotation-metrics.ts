import { AUTO_ATTACK_ID, type SpellType } from "@data/spells";
import type { SpellChoiceRef } from "./build-state.ts";
import type { SpellDamageChoice } from "./types.ts";

export function computeDamagePerTurn(spellDamageChoices: SpellDamageChoice[]): number {
  const spellRotation = spellDamageChoices.filter((s) => s.id !== AUTO_ATTACK_ID);
  const ratioSum = spellRotation
    .filter((s) => !s.spellDamage.isExtra)
    .reduce((sum, r) => sum + r.ratio * r.spellDamage.turnCooldown, 0);
  const aaRatioSum = spellRotation.filter((s) => !s.spellDamage.isExtra).reduce((sum, r) => sum + r.ratio, 0);

  const autoAttack = spellDamageChoices.find((s) => s.id === AUTO_ATTACK_ID);
  const aaRatio = ratioSum > 0 ? aaRatioSum / ratioSum : 1;
  const autoAttackDamage = autoAttack
    ? aaRatio *
      (autoAttack.spellDamage.effective.avg + autoAttack.spellDamage.effective.elementalCharmDmg) *
      autoAttack.targets
    : 0;

  return (
    autoAttackDamage +
    spellRotation.reduce((damage, s) => {
      const weightedDamage =
        ratioSum > 0
          ? ((s.spellDamage.effective.avg + s.spellDamage.effective.elementalCharmDmg) * s.targets * s.ratio) / ratioSum
          : 0;
      return damage + weightedDamage;
    }, 0)
  );
}

export function computeDamagePerHit(spellDamageChoices: SpellDamageChoice[]): number {
  const spellRotation = spellDamageChoices.filter((s) => s.id !== AUTO_ATTACK_ID);
  const ratioSum = spellRotation.filter((s) => !s.spellDamage.isExtra).reduce((sum, r) => sum + r.ratio, 0);
  const fullRotation = spellDamageChoices.map((s) => (s.id === AUTO_ATTACK_ID ? { ...s, ratio: ratioSum || 1 } : s));
  const ratioTargetSum = fullRotation.reduce((sum, s) => sum + s.targets * s.ratio, 0);

  if (ratioTargetSum === 0) return 0;

  return (
    fullRotation.reduce((damage, s) => {
      const weightedDamage = s.spellDamage.effective.avg * s.targets * s.ratio;
      return damage + weightedDamage;
    }, 0) / ratioTargetSum
  );
}

export function computeDamageFromCharms(spellDamageChoices: SpellDamageChoice[]): number {
  const spellRotation = spellDamageChoices.filter((s) => s.id !== AUTO_ATTACK_ID);
  const ratioSum = spellRotation.filter((s) => !s.spellDamage.isExtra).reduce((sum, r) => sum + r.ratio, 0);

  const autoAttack = spellDamageChoices.find((s) => s.id === AUTO_ATTACK_ID);
  const autoAttackDamage = autoAttack
    ? (autoAttack.spellDamage.effective.critCharmDmg + autoAttack.spellDamage.effective.elementalCharmDmg) *
      autoAttack.targets
    : 0;

  return (
    autoAttackDamage +
    spellRotation.reduce((damage, s) => {
      const weightedDamage =
        ratioSum > 0
          ? ((s.spellDamage.effective.critCharmDmg + s.spellDamage.effective.elementalCharmDmg) * s.targets * s.ratio) /
            ratioSum
          : 0;
      return damage + weightedDamage;
    }, 0)
  );
}

type RotationEntry = { ratio: number; isExtra: boolean; spellType: SpellType };
type HomingMissileDamage = { id: number; spellType: SpellType };

export function homingMissileChoices<T extends HomingMissileDamage>(
  rotation: RotationEntry[],
  spellDamages: T[],
): (SpellChoiceRef & { spellDamage: T })[] {
  const castRatio = rotation.filter((s) => s.spellType === "spell" && !s.isExtra).reduce((sum, s) => sum + s.ratio, 0);
  if (castRatio <= 0) return [];

  return spellDamages
    .filter((sd) => sd.spellType === "homing-missile")
    .map((sd) => ({
      id: sd.id,
      targets: 1,
      ratio: 0.01 * castRatio,
      spellDamage: sd,
    }));
}
