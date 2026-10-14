import LZString from "lz-string";

export const SECTION_TAG = {
  basicStats: 0,
  advancedStats: 1,
  weapon: 2,
  perks: 3,
  rotation: 4,
  targets: 5,
} as const;

export type SectionTag = (typeof SECTION_TAG)[keyof typeof SECTION_TAG];

export function packSection(tag: SectionTag, compactData: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify([tag, compactData]));
}

export function unpackSection(str: string, expectedTag: SectionTag): unknown | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(str);
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || parsed[0] !== expectedTag) return null;
    return parsed[1];
  } catch {
    return null;
  }
}
