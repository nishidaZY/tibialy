import { allBestiaryClasses, initBestiaryDamage, type BestiaryClass } from "@data/creatures";
import { bestiaryDamageBonusType, type PerkBonusType, type PierceKind } from "@data/perks.ts";
import { allElements, type Element } from "@data/spells";
import type { SkillType } from "@data/weapons";
import type { BuildStats } from "./build-state.ts";
import { initElements } from "./creature-damage.ts";
import type { CharacterState, PerkChoice, WeaponChoice } from "./types.ts";

type NumericCharacterField = {
  [K in keyof CharacterState]: CharacterState[K] extends number ? K : never;
}[keyof CharacterState];

// Character perks that add value to a flat CharacterState field
const characterBonuses: Partial<Record<PerkBonusType, NumericCharacterField>> = {
  "magic-level": "magicLevel",
  "base-harmony-bonus": "baseHarmonyBonus",
  "def-mod": "defenseMod",
};
// Fighting skill perks add value to `skill` when they match the weapon, otherwise to their own field
const fightingSkillBonuses: Partial<Record<PerkBonusType, SkillType & NumericCharacterField>> = {
  "axe-fighting": "axe",
  "club-fighting": "club",
  "sword-fighting": "sword",
  "fist-fighting": "fist",
  "distance-fighting": "distance",
};
// Character perks that add value/100 to a flat CharacterState field
const characterPercentBonuses: Partial<Record<PerkBonusType, NumericCharacterField>> = {
  "crit-damage": "critDamage",
  "crit-chance": "critChance",
  "armor-penetration": "armorPenetration",
  "charm-upgrade": "charmUpgrade",
};

const pierceBonuses = new Map<PerkBonusType, { kind: PierceKind; element: Element }>();
for (const element of allElements) {
  pierceBonuses.set(`${element}-pierce-regular`, { kind: "pierceRegular", element });
  pierceBonuses.set(`${element}-pierce-weapon`, { kind: "pierceWeapon", element });
}

const homingMissileElements = new Map<PerkBonusType, Element>();
for (const element of allElements) {
  homingMissileElements.set(`homing-missile-${element}`, element);
}

const bestiaryDamageBonuses = new Map<PerkBonusType, BestiaryClass>();
for (const bestiaryClass of allBestiaryClasses) {
  bestiaryDamageBonuses.set(bestiaryDamageBonusType(bestiaryClass), bestiaryClass);
}

export function deriveCharacterState(
  buildStats: BuildStats,
  weaponChoice: WeaponChoice,
  characterPerks: PerkChoice[],
): CharacterState {
  const n = (v: unknown) => Number((v ?? "").toString().trim()) || 0;
  const L = n(buildStats.level);
  const B = n(buildStats.bonus);
  const skill = n(buildStats.skill);
  const magicLevel = n(buildStats.magicLevel);
  const critChance = n(buildStats.critChance) / 100;
  const critDamage = n(buildStats.critDamage) / 100;
  const fatalChance = n(buildStats.fatalChance) / 100;
  const transcendenceChance = n(buildStats.transcendenceChance) / 100;
  const baseMagicLevel = n(buildStats.baseMagicLevel);
  const axe = n(buildStats.axe);
  const club = n(buildStats.club);
  const sword = n(buildStats.sword);
  const fist = n(buildStats.fist);
  const distance = n(buildStats.distance);
  const shielding = n(buildStats.shielding);
  const fishing = n(buildStats.fishing);
  const step = Math.floor((Math.sqrt(2 * L + 2025) + 5) / 10);
  const flat = step * 100 - 450 + Math.floor((L + 1000) / step - 50 * step) + B;
  const weaponAttack = (weaponChoice.weapon.attack ?? 0) + (weaponChoice.ammo?.attack ?? 0);
  const weaponDamage = weaponChoice.weapon.damage ?? 0;
  const shieldDef = (weaponChoice.shield?.defense ?? 0) + (weaponChoice.weapon.defenseMod ?? 0);
  const characterState: CharacterState = {
    flat,
    magicLevel,
    skill,
    weaponAttack,
    weaponDamage,
    critChance,
    critDamage,
    fatalChance,
    transcendenceChance,
    baseMagicLevel,
    axe,
    club,
    sword,
    fist,
    distance,
    shielding,
    fishing,
    shieldDef,
    baseHarmonyBonus: 0,
    armorPenetration: 0,
    pierceRegular: initElements(),
    pierceWeapon: initElements(),
    bestiaryDamage: initBestiaryDamage(),
    charmUpgrade: 0,
    homingMissiles: initElements(),
    extraHitChance: 0,
    defenseMod: 0,
  };

  const skillType = weaponChoice.weapon.skill;

  characterPerks.forEach((p) => {
    const pierce = pierceBonuses.get(p.perk.bonusType);
    if (pierce) {
      characterState[pierce.kind][pierce.element] += p.value / 100;
      return;
    }
    const bestiaryClass = bestiaryDamageBonuses.get(p.perk.bonusType);
    if (bestiaryClass) {
      characterState.bestiaryDamage[bestiaryClass] += p.value / 100;
      return;
    }
    const homingElement = homingMissileElements.get(p.perk.bonusType);
    if (homingElement) {
      characterState.homingMissiles[homingElement] += p.value / 100;
      return;
    }
    const percentBonusField = characterPercentBonuses[p.perk.bonusType];
    if (percentBonusField) {
      characterState[percentBonusField] += p.value / 100;
      return;
    }
    const fightingSkill = fightingSkillBonuses[p.perk.bonusType];
    if (fightingSkill) {
      if (skillType == fightingSkill) characterState.skill += p.value;
      else characterState[fightingSkill] += p.value;
      return;
    }
    const bonusField = characterBonuses[p.perk.bonusType];
    if (bonusField) {
      characterState[bonusField] += p.value;
      return;
    }
  });
  return characterState;
}
