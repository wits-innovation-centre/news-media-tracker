import {
  GRAPH_MAX_SCALE,
  GRAPH_MIN_SCALE,
  clampGraphScale,
  nextGraphSelection,
} from './connected-graph-workspace.utils';

describe('connected graph workspace utilities', () => {
  it('clamps zoom scale to supported bounds', () => {
    expect(clampGraphScale(0.2)).toBe(GRAPH_MIN_SCALE);
    expect(clampGraphScale(5)).toBe(GRAPH_MAX_SCALE);
    expect(clampGraphScale(1.2)).toBe(1.2);
  });

  it('moves selection through case ids in both directions', () => {
    const caseIds = ['case-1', 'case-2', 'case-3'];
    expect(nextGraphSelection(caseIds, [], 'next')).toEqual(['case-1']);
    expect(nextGraphSelection(caseIds, ['case-1'], 'next')).toEqual(['case-2']);
    expect(nextGraphSelection(caseIds, ['case-2'], 'prev')).toEqual(['case-1']);
    expect(nextGraphSelection(caseIds, ['case-3'], 'next')).toEqual(['case-3']);
  });

  it('returns empty selection when no graph data is available', () => {
    expect(nextGraphSelection([], ['case-1'], 'next')).toEqual([]);
  });
});
