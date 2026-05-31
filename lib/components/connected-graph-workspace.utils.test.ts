import {
  GRAPH_MAX_SCALE,
  GRAPH_MIN_SCALE,
  buildConnectedGraphModel,
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

  it('builds article, event, and participant nodes with hard and soft edges', () => {
    const model = buildConnectedGraphModel([
      {
        id: 'event-1',
        articleData: {
          id: 'article-1',
          newsReportHeadline: 'Community protests after shooting',
          newsReportUrl: 'https://example.com/article-1',
        },
        victims: [
          {
            id: 'victim-1',
            articleId: 'article-1',
            victimName: 'Jane Doe',
            victimAlias: 'Janie',
          },
        ],
        perpetrators: [
          {
            id: 'perp-1',
            articleId: 'article-1',
            perpetratorName: 'Jon Smith',
            perpetratorAlias: null,
          },
        ],
        typeOfMurder: 'shooting',
        eventTypes: ['shooting'],
      },
      {
        id: 'event-2',
        articleData: {
          id: 'article-2',
          newsReportHeadline: 'Community protest after shooting',
          newsReportUrl: 'https://example.com/article-2',
        },
        victims: [
          {
            id: 'victim-2',
            articleId: 'article-2',
            victimName: 'Jane Doe',
            victimAlias: null,
          },
        ],
        perpetrators: [
          {
            id: 'perp-2',
            articleId: 'article-2',
            perpetratorName: 'John Smith',
            perpetratorAlias: null,
          },
        ],
        typeOfMurder: 'shooting',
        eventTypes: ['shooting'],
      },
    ] as never);

    expect(model.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(['article', 'event', 'participant']),
    );
    expect(model.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          style: 'hard',
          sourceId: 'article:article-1',
          targetId: 'event:event-1',
        }),
        expect.objectContaining({
          style: 'hard',
          sourceId: 'event:event-1',
          targetId: 'participant:victim:victim-1',
        }),
        expect.objectContaining({
          style: 'soft',
          sourceId: 'participant:perpetrator:perp-1',
          targetId: 'participant:perpetrator:perp-2',
        }),
        expect.objectContaining({
          style: 'soft',
          sourceId: 'article:article-1',
          targetId: 'article:article-2',
        }),
        expect.objectContaining({
          style: 'soft',
          sourceId: 'event:event-1',
          targetId: 'event:event-2',
        }),
      ]),
    );
  });
});
