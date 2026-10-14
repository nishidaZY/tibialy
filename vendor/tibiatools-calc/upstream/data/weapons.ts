import ammoRaw from "@data/ammo.json";
import type { Element } from "@data/spells";
import weaponsRaw from "@data/weapons.json";

export type AmmoType = "arrows" | "bolts";
export type SkillType = "axe" | "club" | "sword" | "fist" | "distance";
export type Hands = "one" | "two";

export type Weapon = {
  id: number;
  name: string;
  attack?: number;
  attackDeath?: number;
  attackEarth?: number;
  attackEnergy?: number;
  attackFire?: number;
  attackIce?: number;
  attackPhysical?: number;
  hitMod?: number;
  bond?: Element;
  ammo?: AmmoType;
  damageType?: Element;
  damage?: number;
  skill: SkillType;
  defenseMod: number;
  hands?: Hands;
  vocations: string[];
};

export const allWeapons: Weapon[] = (weaponsRaw as Weapon[]).map((w) => ({
  ...w,
  attackPhysical:
    w.attack == null
      ? undefined
      : w.attack -
        ((w.attackDeath ?? 0) +
          (w.attackEarth ?? 0) +
          (w.attackEnergy ?? 0) +
          (w.attackFire ?? 0) +
          (w.attackIce ?? 0)),
  hitMod: w.hitMod == null ? undefined : w.hitMod / 100,
  defenseMod: w.defenseMod ?? 0,
}));

type AmmoRaw = {
  id: number;
  name: string;
  attack: number;
  attackDeath?: number;
  attackEarth?: number;
  attackEnergy?: number;
  attackFire?: number;
  attackIce?: number;
  hitChance: number;
  aoe: boolean;
};

type AmmoData = {
  arrows: AmmoRaw[];
  bolts: AmmoRaw[];
};

export type Ammo = AmmoRaw & {
  attackPhysical: number;
  type: AmmoType;
};

const ammoData = ammoRaw as AmmoData;

const resolveAmmo = (a: AmmoRaw, type: AmmoType): Ammo => ({
  ...a,
  type,
  attackPhysical:
    a.attack -
    ((a.attackDeath ?? 0) + (a.attackEarth ?? 0) + (a.attackEnergy ?? 0) + (a.attackFire ?? 0) + (a.attackIce ?? 0)),
  hitChance: (a.hitChance ?? 100) / 100,
});

export const allAmmo: Ammo[] = [
  ...ammoData.arrows.map((a) => resolveAmmo(a, "arrows")),
  ...ammoData.bolts.map((a) => resolveAmmo(a, "bolts")),
];
