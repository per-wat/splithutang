export type LearningProgressSignals = {
  hasGroup: boolean;
  hasSharedExpense: boolean;
  hasPayment: boolean;
};

export const emptyLearningProgress: LearningProgressSignals = {
  hasGroup: false,
  hasSharedExpense: false,
  hasPayment: false,
};

export function parseLearningProgress(value: unknown): LearningProgressSignals {
  if (!isRecord(value)) return emptyLearningProgress;

  return {
    hasGroup: value.has_group === true,
    hasSharedExpense: value.has_shared_expense === true,
    hasPayment: value.has_payment === true,
  };
}

export function getLearningProgress(input: LearningProgressSignals) {
  const completedCount = [
    input.hasGroup,
    input.hasSharedExpense,
    input.hasPayment,
  ].filter(Boolean).length;

  return {
    ...input,
    completedCount,
    complete: completedCount === 3,
    totalCount: 3,
  };
}

export function getCombinedOnboardingProgress(input: {
  setupCompletedCount: number;
  setupTotalCount: number;
  learning: LearningProgressSignals;
}) {
  const learning = getLearningProgress(input.learning);
  const completedCount = input.setupCompletedCount + learning.completedCount;
  const totalCount = input.setupTotalCount + learning.totalCount;

  return {
    completedCount,
    totalCount,
    complete: completedCount === totalCount,
  };
}

export function getHomeOnboardingSection(input: {
  setupComplete: boolean;
  learning: LearningProgressSignals;
}): "setup" | "learning" | null {
  if (!input.setupComplete) return "setup";
  if (!getLearningProgress(input.learning).complete) return "learning";

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
