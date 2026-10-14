import shieldsRaw from "@data/shields.json";

export type Shield = {
  id: number;
  name: string;
  defense: number;
};

export const allShields: Shield[] = shieldsRaw as Shield[];
