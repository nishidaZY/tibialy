import creaturesRaw from "@data/creatures.json";

export type BestiaryClass =
  | "Amphibic"
  | "Aquatic"
  | "Bird"
  | "Construct"
  | "Demon"
  | "Dragon"
  | "Elemental"
  | "Extra Dimensional"
  | "Fey"
  | "Giant"
  | "Human"
  | "Humanoid"
  | "Inkborn"
  | "Lycanthrope"
  | "Magical"
  | "Mammal"
  | "Plant"
  | "Reptile"
  | "Slime"
  | "Undead"
  | "Vermin";

export const allBestiaryClasses: BestiaryClass[] = [
  "Amphibic",
  "Aquatic",
  "Bird",
  "Construct",
  "Demon",
  "Dragon",
  "Elemental",
  "Extra Dimensional",
  "Fey",
  "Giant",
  "Human",
  "Humanoid",
  "Inkborn",
  "Lycanthrope",
  "Magical",
  "Mammal",
  "Plant",
  "Reptile",
  "Slime",
  "Undead",
  "Vermin",
];

export function initBestiaryDamage(): Record<BestiaryClass, number> {
  return Object.fromEntries(allBestiaryClasses.map((c) => [c, 0])) as Record<BestiaryClass, number>;
}

export type Creature = {
  id: number;
  name: string;
  bestiaryClass: string;
  bestiaryLevel: string;
  occurrence: string;
  charmPoints: number;
  experience: number;
  hitpoints: number;
  armor: number;
  mitigation: number;
  physicalDmgMod: number;
  earthDmgMod: number;
  fireDmgMod: number;
  deathDmgMod: number;
  energyDmgMod: number;
  holyDmgMod: number;
  iceDmgMod: number;
  healMod: number;
};

export const allCreatures: Creature[] = creaturesRaw as Creature[];
