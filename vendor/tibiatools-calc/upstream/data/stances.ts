import stancesRaw from "@data/stances.json";

export type StanceEffect =
  | "blood-rage"
  | "protector"
  | "sharpshooter"
  | "divine-defiance"
  | "master-of-flames"
  | "master-of-thunder"
  | "master-of-decay"
  | "expose-weakness"
  | "sap-strength"
  | "elemental-synthesis"
  | "shared-conservation"
  | "virtue-of-justice"
  | "virtue-of-harmony"
  | "virtue-of-sustain";

export type StanceGroup = "elemental" | "curse";

export type Stance = {
  id: number;
  name: string;
  visible: boolean;
  effect: StanceEffect;
  vocation: string;
  group?: StanceGroup;
};

export const allStances: Stance[] = stancesRaw as unknown[] as Stance[];
