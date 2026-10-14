import { allPerks, type Perk } from "@data/perks.ts";
import { allElements, allSpells, type Spell } from "@data/spells";
import type { Stance } from "@data/stances.ts";
import { type SkillType } from "@data/weapons";
import type { Vocation } from "./build-state";
import type { PerkChoice, SpellState } from "./types.ts";

const spellScopeById = new Map(allSpells.map((s) => [s.id, s.scope]));

export function stancePerks(stances: Stance[], currentPerks: PerkChoice[]): PerkChoice[] {
  const extraPerks: PerkChoice[] = [];

  function pushPerk(value: number, predicate: (p: Perk) => boolean) {
    const perk = allPerks.find(predicate);
    if (perk) {
      extraPerks.push({ id: perk.id, value, perk });
    }
  }

  if (stances.some((s) => s.effect == "expose-weakness")) {
    allElements.forEach((element) => pushPerk(8, (p) => p.bonusType == `${element}-pierce-regular`));
  }

  const lodPerkStage = currentPerks.find((p) => p.perk.bonusType == "lord-of-destruction")?.value ?? 0;
  if (stances.some((s) => s.effect == "master-of-flames")) {
    const lodBonuses = [0, 2, 3, 4];
    const value = 4 + (lodBonuses[lodPerkStage] ?? 0);
    pushPerk(value, (p) => p.tag == "master-of-flames");
  }
  if (stances.some((s) => s.effect == "master-of-thunder")) {
    const lodBonuses = [0, 2, 3, 4];
    const value = 4 + (lodBonuses[lodPerkStage] ?? 0);
    pushPerk(value, (p) => p.tag == "master-of-thunder");
  }
  if (stances.some((s) => s.effect == "master-of-decay")) {
    const lodBonuses = [0, 15, 22.5, 30];
    const value = 30 + (lodBonuses[lodPerkStage] ?? 0);
    pushPerk(value, (p) => p.tag == "master-of-decay");
  }

  return extraPerks;
}

export function perkAppliesToSpell(perk: Perk, spell: Spell): boolean {
  return perk.scopes.every(
    (scope) => scope == spell.scope || scope == spell.spellType || scope == spell.element || scope == spell.scalesWith,
  );
}

export function applyPerkToSpell(
  spell: Spell,
  perkChoice: PerkChoice,
  skillType: SkillType,
  vocation: Vocation,
  state: SpellState,
): SpellState {
  const { basePower: P, flat: F, magicLevel: ML, weaponAttack: W } = state;

  if (perkAppliesToSpell(perkChoice.perk, spell)) {
    switch (perkChoice.perk.bonusType) {
      case "base-damage":
        return { ...state, basePower: P * (1 + perkChoice.value / 100) };
      case "crit-damage":
        return { ...state, critDamage: state.critDamage + perkChoice.value / 100 };
      case "crit-chance":
        return { ...state, critChance: state.critChance + perkChoice.value / 100 };
      case "attack":
        // TODO: this doesn't keep the ratio of phys/elemental the same
        // probably fine for +1 or +2 atk, but would be good to fix it properly
        return { ...state, weaponAttack: W + perkChoice.value };
      case "axe-percent-extra": {
        const S = skillType === "axe" ? state.skill : state.axe;
        return { ...state, flat: F + Math.round((S * perkChoice.value) / 100) };
      }
      case "club-percent-extra": {
        const S = skillType === "club" ? state.skill : state.club;
        return { ...state, flat: F + Math.round((S * perkChoice.value) / 100) };
      }
      case "sword-percent-extra": {
        const S = skillType === "sword" ? state.skill : state.sword;
        return { ...state, flat: F + Math.round((S * perkChoice.value) / 100) };
      }
      case "distance-percent-extra": {
        const S = skillType === "distance" ? state.skill : state.distance;
        return { ...state, flat: F + Math.round((S * perkChoice.value) / 100) };
      }
      case "fist-percent-extra": {
        const S = skillType === "fist" ? state.skill : state.fist;
        return { ...state, flat: F + Math.round((S * perkChoice.value) / 100) };
      }
      case "shield-percent-extra":
        return { ...state, flat: F + Math.round((state.shielding * perkChoice.value) / 100) };
      case "fishing-percent-extra":
        return { ...state, flat: F + Math.round((state.fishing * perkChoice.value) / 100) };
      case "magic-level":
        return { ...state, magicLevel: ML + perkChoice.value };
      case "magic-level-percent-extra":
        return { ...state, flat: F + Math.round((ML * perkChoice.value) / 100) };
      case "runic-mastery":
        if (spell.spellType === "rune") {
          const increaseAmount = spell.runic.includes(vocation) ? 0.2 : 0.1;
          const runicIncrease = Math.round(state.baseMagicLevel * increaseAmount);
          return { ...state, runicIncrease };
        } else return state;
      case "focus-mastery": {
        const focusScope = spellScopeById.get(perkChoice.value);
        const focusMasteryIncrease = focusScope && state.spell.scope == focusScope ? 0.35 : 0;
        return {
          ...state,
          focusMasteryIncrease,
          spell: { ...state.spell, turnCooldown: 1 },
        };
      }
      case "hit-chance":
        return { ...state, extraHitChance: state.extraHitChance + perkChoice.value / 100 };
    }
  }

  return state;
}
