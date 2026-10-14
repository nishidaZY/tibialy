// There will be one of these for every spell and crit state
export type DamageMixtureComponent = { weight: number; lo: number; hi: number; isCharm: boolean };

// From and to range from 0 (full hp) to 1 (dead).
// E.g. for alpha strike it would be { from: 0, to: 0.05, bonus: 0.1 }
export type HpBasedDmgBracket = {
  from: number;
  to: number;
  bonus: number;
};

// Optimisation for high HP targets: we cap how many buckets the sweep arrays below use
const maxBuckets = 4096;

// Combined bonus multiplier at a given HP fraction (0 = full HP, 1 = dead). Overlapping brackets
// combine multiplicatively.
function boostAtFraction(frac: number, brackets: HpBasedDmgBracket[]): number {
  let boost = 1;
  for (const { from, to, bonus } of brackets) {
    // TODO: Once the combat mastery perk is updated, we need to check if this is additive or multiplicative.
    if (frac >= from && frac < to) boost *= 1 + bonus;
  }
  return boost;
}

// Average bonus multiplier assuming the creature is at a random HP
function averageBoostOverHp(brackets: HpBasedDmgBracket[]): number {
  const edges = new Set([0, 1]);
  for (const { from, to } of brackets) {
    edges.add(Math.min(1, Math.max(0, from)));
    edges.add(Math.min(1, Math.max(0, to)));
  }
  const sorted = [...edges].sort((a, b) => a - b);
  let avg = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    avg += boostAtFraction((lo + hi) / 2, brackets) * (hi - lo);
  }
  return avg;
}

// Average damage multiplier for HP based damage perks against a single target. Spells and charms share
// one kill trajectory but are credited separately (see the per-bucket split below), so we return one
// multiplier for each: apply `spell` to spell damage and `charm` to elemental charm damage.
export function hpBonusMultiplier(
  mixture: DamageMixtureComponent[],
  hp: number,
  brackets: HpBasedDmgBracket[],
): { spell: number; charm: number } {
  // Without a spell rotation we can't model a kill trajectory, so we fall back to assuming the creature
  // sits at a random HP fraction and return the average bonus over that range.
  if (mixture.length == 0) {
    const avg = averageBoostOverHp(brackets);
    return { spell: avg, charm: avg };
  }

  if (hp <= 0 || brackets.every((b) => b.bonus == 0)) return { spell: 1, charm: 1 };

  let totalWeight = 0;
  for (const m of mixture) totalWeight += m.weight;
  if (totalWeight <= 0) return { spell: 1, charm: 1 };

  const bucketSize = Math.ceil(hp / maxBuckets);
  const nBuckets = Math.round(hp / bucketSize);
  const normalisedMixture: DamageMixtureComponent[] = mixture
    .filter((m) => m.weight > 0)
    .map((m) => {
      const lo = Math.max(1, Math.round(m.lo / bucketSize)); // Always do at least 1 dmg to not break the recurrence
      const hi = Math.max(lo, Math.round(m.hi / bucketSize));
      return { weight: m.weight / totalWeight, lo, hi, isCharm: m.isCharm };
    });
  if (normalisedMixture.length == 0) return { spell: 1, charm: 1 };

  // A charm only fires after a spell, so it can never be the opening hit. `spellWeight` lets us both
  // renormalise that opening hit to spells only and split the spell vs charm multipliers at the end.
  let charmWeight = 0;
  for (const m of normalisedMixture) if (m.isCharm) charmWeight += m.weight;
  const spellWeight = 1 - charmWeight; // normalisedMixture weights sum to 1

  const bonusMultiplierAt = (lostHp: number): number => boostAtFraction(lostHp / nBuckets, brackets);

  // Probability of ever being on this HP (range [0..1], hpProbability[0] = full HP = 1)
  const hpProbability = new Float64Array(nBuckets);
  // `pendingArrivals` is a difference array we fill as we go: each hit posts the probability it lands on
  // the buckets ahead of it, and `arrivals` reads that back as a running sum. The posting uses a cool
  // add-then-subtract trick (explained at the posting site below where we do `+= / -= density`)
  // so each hit costs O(1) no matter how wide its damage range is.
  const pendingArrivals = new Float64Array(nBuckets);
  let arrivals = 0;

  for (let lostHp = 0; lostHp < nBuckets; lostHp++) {
    arrivals += pendingArrivals[lostHp];
    // The fight always starts at full HP (bucket 0), so that bucket gets one guaranteed hit. Every other
    // bucket's probability is just whatever earlier hits landed on it (the `arrivals` running sum).
    const reachProbability = (lostHp === 0 ? 1 : 0) + arrivals;
    hpProbability[lostHp] = reachProbability;

    const boost = bonusMultiplierAt(lostHp);
    for (const { weight, lo, hi, isCharm } of normalisedMixture) {
      // At the opening hit (bucket 0) charms can't fire, so we drop them and renormalise the spell
      // weights (÷ spellWeight) so that guaranteed first hit still carries the full unit of probability.
      const w = lostHp === 0 ? (isCharm ? 0 : weight / spellWeight) : weight;
      if (w <= 0) continue;
      const loScaled = Math.max(1, Math.round(lo * boost)); // keep at least 1 so a hit always advances
      const hiScaled = Math.max(loScaled, Math.round(hi * boost));
      const landFrom = lostHp + loScaled;
      if (landFrom >= nBuckets) continue; // this hit (and any higher roll) overkills, so it doesn't seed any arrival bucket
      const damageRangeWidth = hiScaled - loScaled + 1;
      // This hit lands the target uniformly somewhere in [landFrom, landTo] (every roll equally likely),
      // so each of those buckets should gain an equal share of this bucket's probability: `density`.
      const density = (reachProbability * w) / damageRangeWidth;
      // Rather than add `density` to every bucket in that run, we mark only its two edges and let the
      // left-to-right sweep do the filling. `arrivals` is the running total of every mark we've passed.
      // The +density at landFrom switches on this hit's contribution, and the matching -density one step
      // past landTo switches it back off. So every bucket inside the run picks up `density` and every
      // bucket outside it nets to zero.
      pendingArrivals[landFrom] += density;
      const landToExclusive = lostHp + hiScaled + 1;
      if (landToExclusive < nBuckets) pendingArrivals[landToExclusive] -= density;
    }
  }

  // Each multiplier is the average factor its hits are scaled by over the whole kill. Spells and charms
  // share the trajectory above but are credited separately: the opening hit (bucket 0) is always a spell,
  // and every later bucket's hits split into spells vs charms by their share of the mixture weight.
  let spellBonusHits = 0;
  let spellHits = 0;
  let charmBonusHits = 0;
  let charmHits = 0;
  for (let lostHp = 0; lostHp < nBuckets; lostHp++) {
    const bonus = bonusMultiplierAt(lostHp) - 1;
    const reachProbability = hpProbability[lostHp];
    const spellShare = lostHp === 0 ? 1 : spellWeight;
    const charmShare = lostHp === 0 ? 0 : charmWeight;
    spellHits += reachProbability * spellShare;
    spellBonusHits += reachProbability * spellShare * bonus;
    charmHits += reachProbability * charmShare;
    charmBonusHits += reachProbability * charmShare * bonus;
  }

  return {
    spell: spellHits > 0 ? 1 + spellBonusHits / spellHits : 1,
    charm: charmHits > 0 ? 1 + charmBonusHits / charmHits : 1,
  };
}
