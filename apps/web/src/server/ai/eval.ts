import { jaccard, titleTokens } from "./ground";

/**
 * Scoring for the extraction eval (PREPO.md 7.5), kept pure so the script that
 * owns the database never owns the arithmetic.
 *
 * The eval scores *recorded* model outputs, not a live model: CI has no key and
 * makes no network call. What it does measure is the part the repository can
 * control - whether a reply survives the schema and grounding gates, whether
 * owners and dates resolve, and whether a change to any of those silently
 * loses work. A fixture that stops matching its own gold set fails the gate.
 *
 * Matching is one-to-one and title-based: two titles are the same item when
 * their significant words overlap by at least `MATCH_THRESHOLD`. Owner and
 * deadline are scored only on matched items, because a missed item is already
 * counted against recall and must not be counted twice.
 */

export type EvalGoldItem = {
  title: string;
  /** Resolved before scoring; null when the gold item is deliberately unowned. */
  ownerId: string | null;
  /** Local date in the meeting's zone, YYYY-MM-DD. */
  dueDate: string | null;
};

export type EvalPrediction = {
  title: string;
  ownerId: string | null;
  /** Local date in the meeting's zone, YYYY-MM-DD. */
  dueDate: string | null;
};

export type EvalCaseScore = {
  id: string;
  predicted: number;
  gold: number;
  matched: number;
  precision: number;
  recall: number;
  itemF1: number;
  ownersCorrect: number;
  ownersScored: number;
  deadlinesCorrect: number;
  deadlinesScored: number;
};

export type EvalSummary = {
  predicted: number;
  gold: number;
  matched: number;
  precision: number;
  recall: number;
  itemF1: number;
  ownersCorrect: number;
  ownersScored: number;
  ownerAccuracy: number;
  deadlinesCorrect: number;
  deadlinesScored: number;
  deadlineAccuracy: number;
};

export const MATCH_THRESHOLD = 0.6;

/**
 * The floors, not the targets. They are set where a single lost item or a
 * broken owner resolution drops the aggregate below them, so the gate can
 * actually fail; raising them to make the badge prettier would defeat it.
 */
export const EVAL_THRESHOLDS = {
  itemF1: 0.75,
  ownerAccuracy: 0.75,
  deadlineAccuracy: 0.75,
} as const;

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 1_000;
}

export function scoreActionItems(
  id: string,
  gold: EvalGoldItem[],
  predicted: EvalPrediction[],
): EvalCaseScore {
  const pairs: { gold: number; predicted: number; similarity: number }[] = [];

  gold.forEach((expected, goldIndex) => {
    predicted.forEach((actual, predictedIndex) => {
      const similarity = jaccard(titleTokens(expected.title), titleTokens(actual.title));
      if (similarity >= MATCH_THRESHOLD) {
        pairs.push({ gold: goldIndex, predicted: predictedIndex, similarity });
      }
    });
  });

  pairs.sort((a, b) => b.similarity - a.similarity);

  const usedGold = new Set<number>();
  const usedPredicted = new Set<number>();
  const matchedPairs: { gold: EvalGoldItem; predicted: EvalPrediction }[] = [];

  for (const pair of pairs) {
    if (usedGold.has(pair.gold) || usedPredicted.has(pair.predicted)) continue;
    usedGold.add(pair.gold);
    usedPredicted.add(pair.predicted);
    matchedPairs.push({
      gold: gold[pair.gold]!,
      predicted: predicted[pair.predicted]!,
    });
  }

  const matched = matchedPairs.length;
  const ownersScored = matchedPairs.filter((pair) => pair.gold.ownerId !== null).length;
  const ownersCorrect = matchedPairs.filter(
    (pair) => pair.gold.ownerId !== null && pair.predicted.ownerId === pair.gold.ownerId,
  ).length;
  const deadlinesScored = matchedPairs.filter((pair) => pair.gold.dueDate !== null).length;
  const deadlinesCorrect = matchedPairs.filter(
    (pair) => pair.gold.dueDate !== null && pair.predicted.dueDate === pair.gold.dueDate,
  ).length;

  const precision = ratio(matched, predicted.length);
  const recall = ratio(matched, gold.length);

  return {
    id,
    predicted: predicted.length,
    gold: gold.length,
    matched,
    precision,
    recall,
    itemF1: precision + recall === 0 ? 0 : Math.round((2 * precision * recall) / (precision + recall) * 1_000) / 1_000,
    ownersCorrect,
    ownersScored,
    deadlinesCorrect,
    deadlinesScored,
  };
}

export function summarize(scores: EvalCaseScore[]): EvalSummary {
  const predicted = scores.reduce((sum, score) => sum + score.predicted, 0);
  const gold = scores.reduce((sum, score) => sum + score.gold, 0);
  const matched = scores.reduce((sum, score) => sum + score.matched, 0);
  const ownersCorrect = scores.reduce((sum, score) => sum + score.ownersCorrect, 0);
  const ownersScored = scores.reduce((sum, score) => sum + score.ownersScored, 0);
  const deadlinesCorrect = scores.reduce((sum, score) => sum + score.deadlinesCorrect, 0);
  const deadlinesScored = scores.reduce((sum, score) => sum + score.deadlinesScored, 0);

  const precision = ratio(matched, predicted);
  const recall = ratio(matched, gold);

  return {
    predicted,
    gold,
    matched,
    precision,
    recall,
    itemF1:
      precision + recall === 0
        ? 0
        : Math.round((2 * precision * recall) / (precision + recall) * 1_000) / 1_000,
    ownersCorrect,
    ownersScored,
    ownerAccuracy: ratio(ownersCorrect, ownersScored),
    deadlinesCorrect,
    deadlinesScored,
    deadlineAccuracy: ratio(deadlinesCorrect, deadlinesScored),
  };
}

/** Every metric below its floor, in the words the log should use. */
export function gateFailures(summary: EvalSummary): string[] {
  const failures: string[] = [];
  if (summary.itemF1 < EVAL_THRESHOLDS.itemF1) {
    failures.push(
      `item F1 ${summary.itemF1.toFixed(3)} is below the ${EVAL_THRESHOLDS.itemF1.toFixed(2)} floor`,
    );
  }
  if (summary.ownerAccuracy < EVAL_THRESHOLDS.ownerAccuracy) {
    failures.push(
      `owner accuracy ${summary.ownerAccuracy.toFixed(3)} is below the ${EVAL_THRESHOLDS.ownerAccuracy.toFixed(2)} floor`,
    );
  }
  if (summary.deadlineAccuracy < EVAL_THRESHOLDS.deadlineAccuracy) {
    failures.push(
      `deadline accuracy ${summary.deadlineAccuracy.toFixed(3)} is below the ${EVAL_THRESHOLDS.deadlineAccuracy.toFixed(2)} floor`,
    );
  }
  return failures;
}
