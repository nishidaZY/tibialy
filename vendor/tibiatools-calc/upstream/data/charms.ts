import charmsRaw from "@data/charms.json";
import type { Element } from "@data/spells";

export type CharmEffect = "low-blow" | "savage-blow" | "overpower" | "overflux" | "elemental";

export type Charm = {
  id: number;
  name: string;
  displayName: string;
  effect: CharmEffect;
  element?: Element;
};

export const allCharms: Charm[] = (charmsRaw as unknown[] as Charm[]).map((c) => ({
  ...c,
  displayName: c.displayName ?? c.name,
}));
