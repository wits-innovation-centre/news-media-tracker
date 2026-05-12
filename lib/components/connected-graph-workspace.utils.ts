export const GRAPH_MIN_SCALE = 0.6;
export const GRAPH_MAX_SCALE = 1.6;
export const GRAPH_SCALE_STEP = 0.1;

export function clampGraphScale(value: number): number {
  return Math.min(GRAPH_MAX_SCALE, Math.max(GRAPH_MIN_SCALE, value));
}

export function nextGraphSelection(
  caseIds: string[],
  selectedCaseIds: string[],
  direction: 'next' | 'prev',
): string[] {
  if (caseIds.length === 0) {
    return [];
  }

  const selectedId = selectedCaseIds[0];
  if (!selectedId) {
    return [caseIds[0]];
  }

  const currentIndex = caseIds.indexOf(selectedId);
  const fallbackIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex =
    direction === 'next'
      ? Math.min(caseIds.length - 1, fallbackIndex + 1)
      : Math.max(0, fallbackIndex - 1);
  return [caseIds[nextIndex]];
}
