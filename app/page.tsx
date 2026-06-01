'use client';

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Form,
  InputGroup,
  Nav,
  Spinner,
} from 'react-bootstrap';
import ListHomicides, { type DetailedEvent } from '@/lib/components/list-homicides';
import {
  isCompletedSyncStatus,
  isDraftedSyncStatus,
} from '@/lib/components/list-homicides.utils';
import ConnectedGraphWorkspace from '@/lib/components/connected-graph-workspace';
import SettingsPanel from '@/lib/components/settings-panel';
import {
  OFFLINE_SYNC_TAG,
  readOfflineQueueCount,
  hasSyncManager,
} from '@/lib/utils/cache-manager';
import type {
  Article,
} from '@/lib/db/schema';

type MainView = 'document' | 'graph' | 'table';
type ThemeMode = 'light' | 'dark';
type AnnotationStatusFilter = 'all' | 'completed' | 'drafted';
type DocumentKind = 'article' | 'event' | 'victim' | 'perpetrator';
type DraftEntryType = 'event' | 'participant';
type EditorKind = DocumentKind | 'participant-draft';

interface EditorField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'textarea' | 'select';
  options?: string[];
}

interface DocumentPointer {
  id: string;
  kind: DocumentKind;
  label: string;
  articleId?: string;
  caseId?: string;
}

interface ArticleTreeGroup {
  article: DocumentPointer;
  events: DocumentPointer[];
  participants: DocumentPointer[];
}

interface MultiSelectOption {
  id: string;
  label: string;
  description?: string;
}

const endpointByKind: Record<DocumentKind, string> = {
  article: '/api/articles',
  event: '/api/events',
  victim: '/api/victims',
  perpetrator: '/api/perpetrators',
};

const kindLabel: Record<DocumentKind, string> = {
  article: 'Article',
  event: 'Event',
  victim: 'Victim',
  perpetrator: 'Perpetrator',
};

const yesNoUnknownOptions = ['', 'Yes', 'No', 'Unknown'];
const murderTypeOptions = [
  '',
  'Domestic Violence',
  'Gang Related',
  'Robbery Related',
  'Sexual Violence',
  'Child Murder',
  'Hate Crime',
  'Drug Related',
  'Unknown/Other',
];
const languageOptions = [
  '',
  'english',
  'afrikaans',
  'zulu',
  'xhosa',
  'sotho',
  'tswana',
  'pedi',
  'venda',
  'tsonga',
  'ndebele',
  'swati',
  'other',
];
const sourceTypeOptions = [
  '',
  'newspaper',
  'online',
  'television',
  'radio',
  'magazine',
  'blog',
  'social_media',
  'other',
];
const provinceOptions = [
  '',
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];
const genderOptions = ['', 'Male', 'Female', 'Non-binary', 'Unknown'];
const raceOptions = [
  '',
  'Black South African',
  'Coloured',
  'White South African',
  'Indian',
  'Asian',
  'Black Other African',
  'White Non-South African',
  'Unknown',
  'Other',
];
const ageDescriptorOptions = [
  '',
  'Neonate or abandonment',
  'Baby or infant',
  'Child',
  'Teenager',
  'Elderly',
  'Unknown',
];
const dateOfDeathModeOptions = ['', 'exact', 'approximate', 'unknown'];
const perpetratorRelationshipOptions = [
  '',
  'Spouse/Partner',
  'Ex-Spouse/Ex-Partner',
  'Family Member',
  'Friend',
  'Acquaintance',
  'Stranger',
  'Unknown',
  'Other',
];
const authorOtherOptions = ['Undisclosed', 'Anonymous', 'Unknown'] as const;

const buildAuthorState = (value?: string | null) => {
  const normalized = value?.trim() ?? '';
  const matchedOtherOption = authorOtherOptions.find((option) => option === normalized);

  if (matchedOtherOption) {
    return {
      authorValues: [''],
      isAuthorOther: true,
      authorOtherValue: matchedOtherOption,
    };
  }

  const authorValues = normalized
    ? normalized
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
    : [''];

  return {
    authorValues,
    isAuthorOther: false,
    authorOtherValue: authorOtherOptions[0],
  };
};

const editorFieldsByKind: Record<EditorKind, EditorField[]> = {
  article: [
    { key: 'newsReportHeadline', label: 'News Report Headline', type: 'text' },
    { key: 'newsReportUrl', label: 'News Report URL', type: 'text' },
    { key: 'dateOfPublication', label: 'Date of Publication', type: 'date' },
    { key: 'author', label: 'Author', type: 'text' },
    { key: 'wireService', label: 'Wire Service', type: 'text' },
    { key: 'language', label: 'Language', type: 'select', options: languageOptions },
    { key: 'typeOfSource', label: 'Source Type', type: 'select', options: sourceTypeOptions },
    { key: 'newsReportPlatform', label: 'News Report Platform', type: 'text' },
  ],
  event: [
    { key: 'eventTypes', label: 'Event Types (comma separated)', type: 'text' },
    { key: 'articleIds', label: 'Linked Articles', type: 'text' },
    { key: 'participantIds', label: 'Linked Participants', type: 'text' },
    { key: 'typeOfMurder', label: 'Type of Murder', type: 'select', options: murderTypeOptions },
    { key: 'location', label: 'Location', type: 'text' },
    { key: 'incidentTime', label: 'Incident Time', type: 'text' },
    { key: 'court', label: 'Court', type: 'text' },
    { key: 'hearingType', label: 'Hearing Type', type: 'text' },
  ],
  victim: [
    { key: 'articleId', label: 'Article ID', type: 'text' },
    { key: 'victimName', label: 'Victim Name', type: 'text' },
    { key: 'victimAlias', label: 'Victim Alias', type: 'text' },
    { key: 'victimAliases', label: 'Victim Aliases (comma separated)', type: 'text' },
    { key: 'dateOfDeath', label: 'Date of Death', type: 'date' },
    {
      key: 'dateOfDeathMode',
      label: 'Date of Death Mode',
      type: 'select',
      options: dateOfDeathModeOptions,
    },
    { key: 'dateOfDeathEnd', label: 'Date of Death End', type: 'date' },
    {
      key: 'placeOfDeathProvince',
      label: 'Province',
      type: 'select',
      options: provinceOptions,
    },
    { key: 'placeOfDeathTown', label: 'Town', type: 'text' },
    { key: 'typeOfLocation', label: 'Location Type', type: 'text' },
    { key: 'policeStation', label: 'Police Station', type: 'text' },
    {
      key: 'sexualAssault',
      label: 'Sexual Assault',
      type: 'select',
      options: yesNoUnknownOptions,
    },
    {
      key: 'genderOfVictim',
      label: 'Gender',
      type: 'select',
      options: genderOptions,
    },
    {
      key: 'raceOfVictim',
      label: 'Race',
      type: 'select',
      options: raceOptions,
    },
    { key: 'nationality', label: 'Nationality', type: 'text' },
    { key: 'ageOfVictim', label: 'Age', type: 'text' },
    { key: 'ageRangeOfVictim', label: 'Age Range', type: 'text' },
    {
      key: 'ageDescriptor',
      label: 'Age Descriptor',
      type: 'select',
      options: ageDescriptorOptions,
    },
    { key: 'modeOfDeathSpecific', label: 'Mode of Death (Specific)', type: 'text' },
    { key: 'modeOfDeathGeneral', label: 'Mode of Death (General)', type: 'text' },
    {
      key: 'typeOfMurder',
      label: 'Type of Murder',
      type: 'select',
      options: murderTypeOptions,
    },
  ],
  perpetrator: [
    { key: 'articleId', label: 'Article ID', type: 'text' },
    { key: 'perpetratorName', label: 'Suspect Name', type: 'text' },
    { key: 'perpetratorAlias', label: 'Suspect Alias', type: 'text' },
    { key: 'suspectAliases', label: 'Suspect Aliases (comma separated)', type: 'text' },
    {
      key: 'perpetratorRelationshipToVictim',
      label: 'Relationship to Victim',
      type: 'select',
      options: perpetratorRelationshipOptions,
    },
    {
      key: 'suspectIdentified',
      label: 'Suspect Identified',
      type: 'select',
      options: yesNoUnknownOptions,
    },
    {
      key: 'suspectArrested',
      label: 'Suspect Arrested',
      type: 'select',
      options: yesNoUnknownOptions,
    },
    {
      key: 'suspectCharged',
      label: 'Suspect Charged',
      type: 'select',
      options: yesNoUnknownOptions,
    },
    { key: 'charges', label: 'Charges', type: 'text' },
    {
      key: 'conviction',
      label: 'Conviction',
      type: 'select',
      options: ['Unknown', 'Yes', 'No'],
    },
    { key: 'sentence', label: 'Sentence', type: 'text' },
  ],
  'participant-draft': [
    {
      key: 'participantSubtype',
      label: 'Participant Type',
      type: 'select',
      options: ['victim', 'perpetrator'],
    },
    { key: 'articleId', label: 'Article ID', type: 'text' },
    { key: 'victimName', label: 'Victim Name', type: 'text' },
    { key: 'victimAlias', label: 'Victim Alias', type: 'text' },
    { key: 'victimAliases', label: 'Victim Aliases (comma separated)', type: 'text' },
    { key: 'dateOfDeath', label: 'Date of Death', type: 'date' },
    {
      key: 'dateOfDeathMode',
      label: 'Date of Death Mode',
      type: 'select',
      options: dateOfDeathModeOptions,
    },
    { key: 'dateOfDeathEnd', label: 'Date of Death End', type: 'date' },
    {
      key: 'placeOfDeathProvince',
      label: 'Province',
      type: 'select',
      options: provinceOptions,
    },
    { key: 'placeOfDeathTown', label: 'Town', type: 'text' },
    { key: 'typeOfLocation', label: 'Location Type', type: 'text' },
    { key: 'policeStation', label: 'Police Station', type: 'text' },
    {
      key: 'sexualAssault',
      label: 'Sexual Assault',
      type: 'select',
      options: yesNoUnknownOptions,
    },
    {
      key: 'genderOfVictim',
      label: 'Gender',
      type: 'select',
      options: genderOptions,
    },
    {
      key: 'raceOfVictim',
      label: 'Race',
      type: 'select',
      options: raceOptions,
    },
    { key: 'nationality', label: 'Nationality', type: 'text' },
    { key: 'ageOfVictim', label: 'Age', type: 'text' },
    { key: 'ageRangeOfVictim', label: 'Age Range', type: 'text' },
    {
      key: 'ageDescriptor',
      label: 'Age Descriptor',
      type: 'select',
      options: ageDescriptorOptions,
    },
    { key: 'modeOfDeathGeneral', label: 'Mode of Death (General)', type: 'text' },
    { key: 'modeOfDeathSpecific', label: 'Mode of Death (Specific)', type: 'text' },
    { key: 'typeOfMurder', label: 'Type of Murder', type: 'select', options: murderTypeOptions },
    { key: 'perpetratorName', label: 'Suspect Name', type: 'text' },
    { key: 'perpetratorAlias', label: 'Suspect Alias', type: 'text' },
    { key: 'suspectAliases', label: 'Suspect Aliases (comma separated)', type: 'text' },
    {
      key: 'perpetratorRelationshipToVictim',
      label: 'Relationship to Victim',
      type: 'select',
      options: perpetratorRelationshipOptions,
    },
    { key: 'suspectIdentified', label: 'Suspect Identified', type: 'select', options: yesNoUnknownOptions },
    { key: 'suspectArrested', label: 'Suspect Arrested', type: 'select', options: yesNoUnknownOptions },
    { key: 'suspectCharged', label: 'Suspect Charged', type: 'select', options: yesNoUnknownOptions },
  ],
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((entry): entry is string => typeof entry === 'string');
        }
      } catch {
        return [trimmed];
      }
    }
    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [];
};

const normalizeDateForInput = (value: string): string => {
  if (!value) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
};

const getSelectOptionLabel = (option: string): string => {
  if (option !== '') {
    return option;
  }
  return 'Select';
};

const toFormValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};

const payloadToFormState = (
  kind: DocumentKind,
  payload: Record<string, unknown>,
): { frontmatter: Record<string, string>; notes: string } => {
  const frontmatter: Record<string, string> = {};
  let notes = '';

  if (kind === 'event') {
    const details =
      payload.details && typeof payload.details === 'object'
        ? (payload.details as Record<string, unknown>)
        : {};
    notes = typeof details.notes === 'string' ? details.notes : '';

    for (const field of editorFieldsByKind.event) {
      if (field.key in payload) {
        frontmatter[field.key] = toFormValue(payload[field.key]);
      }
    }
    for (const [key, value] of Object.entries(details)) {
      if (key === 'notes') {
        continue;
      }
      frontmatter[key] = toFormValue(value);
    }
    return { frontmatter, notes };
  }

  for (const field of editorFieldsByKind[kind]) {
    if (field.key in payload) {
      frontmatter[field.key] = toFormValue(payload[field.key]);
    }
  }

  notes = typeof payload.notes === 'string' ? payload.notes : '';
  return { frontmatter, notes };
};

const formStateToPayload = (
  kind: DocumentKind,
  frontmatter: Record<string, string>,
  notes: string,
  pointerId: string,
): Record<string, unknown> => {
  const payload: Record<string, unknown> = { id: pointerId };

  if (kind === 'article') {
    for (const field of editorFieldsByKind.article) {
      if (frontmatter[field.key] !== undefined) {
        payload[field.key] = frontmatter[field.key] || null;
      }
    }
    payload.notes = notes;
    return payload;
  }

  if (kind === 'event') {
    payload.eventTypes = toStringArray(frontmatter.eventTypes);
    payload.articleIds = toStringArray(frontmatter.articleIds);
    payload.participantIds = toStringArray(frontmatter.participantIds);

    const details: Record<string, unknown> = {};
    for (const key of ['typeOfMurder', 'location', 'incidentTime', 'court', 'hearingType']) {
      const value = frontmatter[key];
      if (value !== undefined && value !== '') {
        details[key] = value;
      }
    }
    if (notes.trim()) {
      details.notes = notes;
    }
    payload.details = details;
    return payload;
  }

  const fields = kind === 'victim' ? editorFieldsByKind.victim : editorFieldsByKind.perpetrator;
  for (const field of fields) {
    if (frontmatter[field.key] !== undefined) {
      payload[field.key] = frontmatter[field.key] || null;
    }
  }
  payload.notes = notes;
  return payload;
};

const formatPointerLabel = (pointer: DocumentPointer): string => {
  return `${kindLabel[pointer.kind]}: ${pointer.label}`;
};

export default function Home() {
  const [mainView, setMainView] = useState<MainView>('document');
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? window.navigator.onLine : true,
  );
  const [queueCount, setQueueCount] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [loadedCases, setLoadedCases] = useState<DetailedEvent[]>([]);
  const [loadedArticles, setLoadedArticles] = useState<Article[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [annotationsRefreshKey, setAnnotationsRefreshKey] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [useSystemTheme, setUseSystemTheme] = useState(true);
  const [selectedPointer, setSelectedPointer] =
    useState<DocumentPointer | null>(null);
  const [documentFrontmatter, setDocumentFrontmatter] = useState<Record<string, string>>({});
  const [documentNotes, setDocumentNotes] = useState('');
  const [draftContext, setDraftContext] = useState<{
    articleId: string;
    caseId?: string;
    entryType: DraftEntryType;
  } | null>(null);
  const [openTreeInsertMenu, setOpenTreeInsertMenu] = useState<{
    anchorId: string;
    articlePointer: DocumentPointer | null;
  } | null>(null);
  const [expandedArticleIds, setExpandedArticleIds] = useState<Record<string, boolean>>({});
  const [documentStatus, setDocumentStatus] = useState<
    'idle' | 'loading' | 'saving' | 'saved' | 'error'
  >('idle');
  const [documentMessage, setDocumentMessage] = useState('');
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [outletOptions, setOutletOptions] = useState<string[]>([]);
  const [outletLoading, setOutletLoading] = useState(false);
  const [outletSaving, setOutletSaving] = useState(false);
  const [authorValues, setAuthorValues] = useState<string[]>(['']);
  const [isAuthorOther, setIsAuthorOther] = useState(false);
  const [authorOtherValue, setAuthorOtherValue] =
    useState<(typeof authorOtherOptions)[number]>(authorOtherOptions[0]);
  const [pickerSearch, setPickerSearch] = useState<Record<string, string>>({
    articleIds: '',
    participantIds: '',
  });
  const [resolvedParticipantOptionsById, setResolvedParticipantOptionsById] = useState<
    Record<string, MultiSelectOption>
  >({});

  // Search/filter state shared between document tree, graph, and table views.
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [annotationStatusFilter, setAnnotationStatusFilter] =
    useState<AnnotationStatusFilter>('all');

  useEffect(() => {
    readOfflineQueueCount().then(setQueueCount);

    const handleOnline = async () => {
      setIsOnline(true);
      setQueueCount(await readOfflineQueueCount());
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(async () => {
      setQueueCount(await readOfflineQueueCount());
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('workspace-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setThemeMode(savedTheme);
      setUseSystemTheme(false);
      return;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setUseSystemTheme(true);
    setThemeMode(prefersDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (!useSystemTheme) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeMode(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [useSystemTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    if (useSystemTheme) {
      window.localStorage.removeItem('workspace-theme');
    } else {
      window.localStorage.setItem('workspace-theme', themeMode);
    }
  }, [themeMode, useSystemTheme]);

  const handleNavSync = async () => {
    if (!isOnline || replaying) return;
    setReplaying(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (hasSyncManager(reg)) {
          await reg.sync.register(OFFLINE_SYNC_TAG);
        }
      }
      setQueueCount(await readOfflineQueueCount());
    } catch {
      // ignore — sync will retry automatically
    } finally {
      setReplaying(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchTerm(pendingSearch);
  };

  const handleMainViewChange = useCallback(
    (view: MainView) => {
      setMainView(view);
    },
    [],
  );

  const cycleAnnotationStatusFilter = useCallback(() => {
    const filterSequence: AnnotationStatusFilter[] = ['all', 'completed', 'drafted'];
    const currentIndex = filterSequence.indexOf(annotationStatusFilter);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % filterSequence.length : 0;
    setAnnotationStatusFilter(filterSequence[nextIndex]);
  }, [annotationStatusFilter]);

  const listStatusFilter = useMemo(() => {
    if (annotationStatusFilter === 'completed') {
      return 'completed' as const;
    }
    if (annotationStatusFilter === 'drafted') {
      return 'drafted' as const;
    }
    return 'all' as const;
  }, [annotationStatusFilter]);

  const graphCases = useMemo(() => {
    if (listStatusFilter === 'completed') {
      return loadedCases.filter((case_) => isCompletedSyncStatus(case_.syncStatus));
    }
    if (listStatusFilter === 'drafted') {
      return loadedCases.filter((case_) => isDraftedSyncStatus(case_.syncStatus));
    }
    return loadedCases;
  }, [listStatusFilter, loadedCases]);

  useEffect(() => {
    let cancelled = false;

    const loadArticles = async () => {
      try {
        const params = new URLSearchParams({
          limit: '2000',
          offset: '0',
          ...(searchTerm ? { search: searchTerm } : {}),
        });
        const response = await fetch(`/api/articles?${params.toString()}`);
        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: Article[] }
          | null;

        if (!cancelled && response.ok && payload?.success && Array.isArray(payload.data)) {
          setLoadedArticles(payload.data);
        }
      } catch {
        if (!cancelled) {
          setLoadedArticles([]);
        }
      }
    };

    loadArticles();
    return () => {
      cancelled = true;
    };
  }, [annotationsRefreshKey, searchTerm]);

  const treeGroups = useMemo<ArticleTreeGroup[]>(() => {
    const grouped = new Map<string, ArticleTreeGroup>();

    loadedArticles.forEach((article) => {
      if (!article.id) {
        return;
      }
      grouped.set(article.id, {
        article: {
          id: article.id,
          kind: 'article',
          label: article.newsReportHeadline?.trim() || article.newsReportUrl || article.id,
          articleId: article.id,
        },
        events: [],
        participants: [],
      });
    });

    loadedCases.forEach((case_) => {
      const article = case_.articleData;
      if (!article?.id) {
        return;
      }

      const articlePointer: DocumentPointer = {
        id: article.id,
        kind: 'article',
        label:
          article.newsReportHeadline?.trim() ||
          article.newsReportUrl ||
          article.id,
        articleId: article.id,
        caseId: case_.id,
      };

      let group = grouped.get(article.id);
      if (!group) {
        group = {
          article: articlePointer,
          events: [],
          participants: [],
        };
        grouped.set(article.id, group);
      }

      if (case_.id) {
        group.events.push({
          id: case_.id,
          kind: 'event',
          label: case_.typeOfMurder || `Event ${case_.id.slice(0, 8)}`,
          articleId: article.id,
          caseId: case_.id,
        });
      }

      case_.victims.forEach((victim) => {
        if (!victim.id) {
          return;
        }
        group?.participants.push({
          id: victim.id,
          kind: 'victim',
          label: victim.victimName || victim.victimAlias || victim.id,
          articleId: article.id,
          caseId: case_.id,
        });
      });

      case_.perpetrators.forEach((perpetrator) => {
        if (!perpetrator.id) {
          return;
        }
        group?.participants.push({
          id: perpetrator.id,
          kind: 'perpetrator',
          label:
            perpetrator.perpetratorName ||
            perpetrator.perpetratorAlias ||
            perpetrator.id,
          articleId: article.id,
          caseId: case_.id,
        });
      });
    });

    const filter = searchTerm.trim().toLowerCase();
    const allGroups = Array.from(grouped.values());

    if (!filter) {
      return allGroups;
    }

    return allGroups
      .map((group) => {
        const articleMatch = group.article.label.toLowerCase().includes(filter);
        const events = group.events.filter((entry) =>
          entry.label.toLowerCase().includes(filter),
        );
        const participants = group.participants.filter((entry) =>
          entry.label.toLowerCase().includes(filter),
        );
        if (!articleMatch && events.length === 0 && participants.length === 0) {
          return null;
        }
        return {
          ...group,
          events: articleMatch ? group.events : events,
          participants: articleMatch ? group.participants : participants,
        };
      })
      .filter((group): group is ArticleTreeGroup => Boolean(group));
  }, [loadedArticles, loadedCases, searchTerm]);

  const eventArticleOptions = useMemo<MultiSelectOption[]>(() => {
    const byId = new Map<string, MultiSelectOption>();

    loadedArticles.forEach((article) => {
      if (!article.id) {
        return;
      }

      const headline = article.newsReportHeadline?.trim() || '';
      const label = headline || article.newsReportUrl || article.id;
      byId.set(article.id, {
        id: article.id,
        label,
      });
    });

    loadedCases.forEach((case_) => {
      const article = case_.articleData;
      if (!article?.id || byId.has(article.id)) {
        return;
      }

      const headline = article.newsReportHeadline?.trim() || '';
      const label = headline || article.newsReportUrl || article.id;
      byId.set(article.id, {
        id: article.id,
        label,
      });
    });

    return Array.from(byId.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [loadedArticles, loadedCases]);

  const eventParticipantOptions = useMemo<MultiSelectOption[]>(() => {
    const byId = new Map<string, MultiSelectOption>();

    loadedCases.forEach((case_) => {
      case_.victims.forEach((victim) => {
        if (!victim.id || byId.has(victim.id)) {
          return;
        }

        const baseLabel =
          victim.victimName?.trim() || victim.victimAlias?.trim() || victim.id;
        byId.set(victim.id, {
          id: victim.id,
          label: baseLabel,
          description: 'Victim',
        });
      });

      case_.perpetrators.forEach((perpetrator) => {
        if (!perpetrator.id || byId.has(perpetrator.id)) {
          return;
        }

        const baseLabel =
          perpetrator.perpetratorName?.trim() ||
          perpetrator.perpetratorAlias?.trim() ||
          perpetrator.id;
        byId.set(perpetrator.id, {
          id: perpetrator.id,
          label: baseLabel,
          description: 'Perpetrator',
        });
      });
    });

    return Array.from(byId.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
  }, [loadedCases]);

  const eventArticleLabelById = useMemo(() => {
    const map = new Map<string, string>();
    eventArticleOptions.forEach((option) => {
      map.set(option.id, option.label);
    });
    return map;
  }, [eventArticleOptions]);

  const eventParticipantLabelById = useMemo(() => {
    const map = new Map<string, string>();
    eventParticipantOptions.forEach((option) => {
      const prefix = option.description ? `${option.description}: ` : '';
      map.set(option.id, `${prefix}${option.label}`);
    });
    return map;
  }, [eventParticipantOptions]);

  const buildParticipantFallbackOption = useCallback(
    (participantId: string): MultiSelectOption => {
      const normalized = participantId.toLowerCase();

      if (normalized.includes('victim')) {
        return {
          id: participantId,
          label: 'Unnamed victim',
          description: 'Victim',
        };
      }

      if (normalized.includes('perpetrator')) {
        return {
          id: participantId,
          label: 'Unnamed perpetrator',
          description: 'Perpetrator',
        };
      }

      if (normalized.includes('witness')) {
        return {
          id: participantId,
          label: 'Unnamed witness',
          description: 'Witness',
        };
      }

      return {
        id: participantId,
        label: 'Unnamed participant',
        description: 'Participant',
      };
    },
    [],
  );

  useEffect(() => {
    const isEventEditor =
      draftContext?.entryType === 'event' || selectedPointer?.kind === 'event';
    if (!isEventEditor) {
      return;
    }

    const selectedIds = toStringArray(documentFrontmatter.participantIds);
    const unresolvedIds = selectedIds.filter(
      (participantId) =>
        !eventParticipantOptions.some((option) => option.id === participantId) &&
        !resolvedParticipantOptionsById[participantId],
    );

    if (unresolvedIds.length === 0) {
      return;
    }

    let cancelled = false;

    const resolveParticipants = async () => {
      const resolvedEntries = await Promise.all(
        unresolvedIds.map(async (participantId) => {
          const preferVictim = participantId.toLowerCase().includes('victim');
          const preferPerpetrator = participantId.toLowerCase().includes('perpetrator');
          const endpoints = preferVictim
            ? ['/api/victims', '/api/perpetrators']
            : preferPerpetrator
              ? ['/api/perpetrators', '/api/victims']
              : ['/api/victims', '/api/perpetrators'];

          for (const endpoint of endpoints) {
            try {
              const response = await fetch(
                `${endpoint}?id=${encodeURIComponent(participantId)}`,
              );
              if (!response.ok) {
                continue;
              }

              const payload = (await response.json().catch(() => null)) as
                | { success?: boolean; data?: Record<string, unknown> | null }
                | null;

              if (!payload?.success || !payload.data) {
                continue;
              }

              if (endpoint === '/api/victims') {
                const label =
                  String(payload.data.victimName || payload.data.victimAlias || '').trim() ||
                  'Unnamed victim';
                return [
                  participantId,
                  {
                    id: participantId,
                    label,
                    description: 'Victim',
                  } satisfies MultiSelectOption,
                ] as const;
              }

              const label =
                String(
                  payload.data.perpetratorName || payload.data.perpetratorAlias || '',
                ).trim() || 'Unnamed perpetrator';
              return [
                participantId,
                {
                  id: participantId,
                  label,
                  description: 'Perpetrator',
                } satisfies MultiSelectOption,
              ] as const;
            } catch {
              // Best effort; fallback labels are applied below.
            }
          }

          return [
            participantId,
            buildParticipantFallbackOption(participantId),
          ] as const;
        }),
      );

      if (cancelled) {
        return;
      }

      setResolvedParticipantOptionsById((current) => {
        const next = { ...current };
        resolvedEntries.forEach(([participantId, option]) => {
          next[participantId] = option;
        });
        return next;
      });
    };

    void resolveParticipants();

    return () => {
      cancelled = true;
    };
  }, [
    buildParticipantFallbackOption,
    draftContext?.entryType,
    documentFrontmatter.participantIds,
    eventParticipantOptions,
    resolvedParticipantOptionsById,
    selectedPointer?.kind,
  ]);

  useEffect(() => {
    setExpandedArticleIds((current) => {
      const next = { ...current };
      for (const group of treeGroups) {
        if (next[group.article.id] === undefined) {
          next[group.article.id] = true;
        }
      }
      return next;
    });
  }, [treeGroups]);

  const editorKind = useMemo<EditorKind | null>(() => {
    if (draftContext?.entryType === 'participant') {
      return 'participant-draft';
    }
    if (draftContext?.entryType === 'event') {
      return 'event';
    }
    return selectedPointer?.kind ?? null;
  }, [draftContext, selectedPointer]);

  const visibleEditorFields = useMemo<EditorField[]>(() => {
    if (!editorKind) {
      return [];
    }

    if (editorKind === 'perpetrator') {
      const identified = documentFrontmatter.suspectIdentified === 'Yes';
      const arrested = documentFrontmatter.suspectArrested === 'Yes';
      const charged = documentFrontmatter.suspectCharged === 'Yes';

      return editorFieldsByKind.perpetrator.filter((field) => {
        if (field.key === 'suspectArrested') {
          return identified || Boolean(documentFrontmatter.suspectArrested);
        }
        if (field.key === 'suspectCharged') {
          return (identified && arrested) || Boolean(documentFrontmatter.suspectCharged);
        }
        if (field.key === 'charges' || field.key === 'conviction' || field.key === 'sentence') {
          return charged || Boolean(documentFrontmatter[field.key]);
        }
        return true;
      });
    }

    if (editorKind !== 'participant-draft') {
      if (editorKind === 'victim') {
        const mode = documentFrontmatter.dateOfDeathMode || 'exact';
        const ageUnknown = (documentFrontmatter.ageOfVictim ?? '').trim().toLowerCase() === 'unknown';
        return editorFieldsByKind.victim.filter((field) => {
          if (field.key === 'dateOfDeathEnd') {
            return mode === 'approximate' || Boolean(documentFrontmatter.dateOfDeathEnd);
          }
          if (field.key === 'ageRangeOfVictim') {
            return ageUnknown;
          }
          return true;
        });
      }
      return editorFieldsByKind[editorKind];
    }

    const subtype =
      documentFrontmatter.participantSubtype === 'perpetrator'
        ? 'perpetrator'
        : 'victim';

    return editorFieldsByKind['participant-draft'].filter((field) => {
      if (
        [
          'victimName',
          'victimAlias',
          'victimAliases',
          'dateOfDeath',
          'dateOfDeathMode',
          'dateOfDeathEnd',
          'placeOfDeathProvince',
          'placeOfDeathTown',
          'typeOfLocation',
          'policeStation',
          'sexualAssault',
          'genderOfVictim',
          'raceOfVictim',
          'nationality',
          'ageOfVictim',
          'ageRangeOfVictim',
          'ageDescriptor',
          'modeOfDeathGeneral',
          'modeOfDeathSpecific',
          'typeOfMurder',
        ].includes(field.key)
      ) {
        if (field.key === 'dateOfDeathEnd') {
          const mode = documentFrontmatter.dateOfDeathMode || 'exact';
          return subtype === 'victim' && (mode === 'approximate' || Boolean(documentFrontmatter.dateOfDeathEnd));
        }
        if (field.key === 'ageRangeOfVictim') {
          const ageUnknown = (documentFrontmatter.ageOfVictim ?? '').trim().toLowerCase() === 'unknown';
          return subtype === 'victim' && ageUnknown;
        }
        return subtype === 'victim';
      }
      if (field.key.startsWith('perpetrator') || field.key.startsWith('suspect')) {
        if (subtype !== 'perpetrator') {
          return false;
        }

        const identified = documentFrontmatter.suspectIdentified === 'Yes';
        const arrested = documentFrontmatter.suspectArrested === 'Yes';

        if (field.key === 'suspectArrested') {
          return identified || Boolean(documentFrontmatter.suspectArrested);
        }

        if (field.key === 'suspectCharged') {
          return (identified && arrested) || Boolean(documentFrontmatter.suspectCharged);
        }

        return true;
      }
      return true;
    });
  }, [documentFrontmatter, editorKind]);

  const serializedAuthors = useMemo(
    () =>
      authorValues
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .join(', '),
    [authorValues],
  );

  useEffect(() => {
    if (editorKind !== 'article') {
      return;
    }

    const authorState = buildAuthorState(documentFrontmatter.author ?? '');
    setAuthorValues(authorState.authorValues);
    setIsAuthorOther(authorState.isAuthorOther);
    setAuthorOtherValue(authorState.authorOtherValue);
  }, [documentFrontmatter.author, editorKind]);

  useEffect(() => {
    if (editorKind !== 'article') {
      return;
    }

    const nextAuthorValue = isAuthorOther ? authorOtherValue : serializedAuthors;
    setDocumentFrontmatter((current) => {
      if ((current.author ?? '') === nextAuthorValue) {
        return current;
      }
      return {
        ...current,
        author: nextAuthorValue,
      };
    });
  }, [authorOtherValue, editorKind, isAuthorOther, serializedAuthors]);

  useEffect(() => {
    if (editorKind !== 'article') {
      setOutletOptions([]);
      setOutletLoading(false);
      return;
    }

    let cancelled = false;
    const query = documentFrontmatter.newsReportPlatform ?? '';

    const loadOutlets = async () => {
      try {
        setOutletLoading(true);
        const params = new URLSearchParams({
          query,
          limit: '20',
        });
        const response = await fetch(`/api/articles/outlets?${params.toString()}`);

        if (!response.ok) {
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | { success?: boolean; data?: string[] }
          | null;

        if (!cancelled && payload?.success && Array.isArray(payload.data)) {
          const normalized = payload.data
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => entry.trim());
          setOutletOptions(normalized);
        }
      } finally {
        if (!cancelled) {
          setOutletLoading(false);
        }
      }
    };

    const timeout = window.setTimeout(loadOutlets, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [documentFrontmatter.newsReportPlatform, editorKind]);

  const setFrontmatterValue = useCallback((fieldKey: string, value: string) => {
    setDocumentFrontmatter((current) => {
      const next = {
        ...current,
        [fieldKey]: value,
      };

      if (fieldKey === 'suspectIdentified' && value !== 'Yes') {
        next.suspectArrested = '';
        next.suspectCharged = '';
        next.charges = '';
        next.conviction = '';
        next.sentence = '';
      }

      if (fieldKey === 'suspectArrested' && value !== 'Yes') {
        next.suspectCharged = '';
        next.charges = '';
        next.conviction = '';
        next.sentence = '';
      }

      if (fieldKey === 'suspectCharged' && value !== 'Yes') {
        next.charges = '';
        next.conviction = '';
        next.sentence = '';
      }

      if (fieldKey === 'dateOfDeathMode') {
        if (value !== 'approximate') {
          next.dateOfDeathEnd = '';
        }
        if (value === 'unknown') {
          next.dateOfDeath = '';
        }
      }

      return next;
    });
  }, []);

  const handleAddOutletOption = useCallback(async () => {
    const outlet = (documentFrontmatter.newsReportPlatform ?? '').trim();
    if (!outlet) {
      return;
    }

    const alreadyExists = outletOptions.some(
      (option) => option.toLowerCase() === outlet.toLowerCase(),
    );
    if (alreadyExists) {
      return;
    }

    try {
      setOutletSaving(true);
      const response = await fetch('/api/articles/outlets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ outlet }),
      });

      if (!response.ok) {
        return;
      }

      setOutletOptions((current) => [...current, outlet].sort((left, right) => left.localeCompare(right)));
    } finally {
      setOutletSaving(false);
    }
  }, [documentFrontmatter.newsReportPlatform, outletOptions]);

  const loadDocument = useCallback(async (pointer: DocumentPointer) => {
    setDocumentStatus('loading');
    setDocumentMessage('');

    try {
      const { getBaseUrl } = await import('@/lib/platform');
      const baseUrl = getBaseUrl();
      const reqUrl = `${baseUrl}${endpointByKind[pointer.kind]}?id=${encodeURIComponent(pointer.id)}`;
      const req = new Request(reqUrl);

      type OfflineGetFn = (req: Request) => Promise<{ success?: boolean; data?: Record<string, unknown> | null; error?: string; message?: string }>;
      let offlineGet: OfflineGetFn;

      if (pointer.kind === 'event') {
        const mod = await import('@/app/api/events/offline');
        offlineGet = mod.get as OfflineGetFn;
      } else if (pointer.kind === 'victim') {
        const mod = await import('@/app/api/victims/offline');
        offlineGet = mod.get as OfflineGetFn;
      } else if (pointer.kind === 'perpetrator') {
        const mod = await import('@/app/api/perpetrators/offline');
        offlineGet = mod.get as OfflineGetFn;
      } else {
        const mod = await import('@/app/api/articles/offline');
        offlineGet = mod.get as OfflineGetFn;
      }

      const payload = await offlineGet(req);

      if (!payload?.success || !payload.data) {
        throw new Error(payload?.error || payload?.message || 'Unable to load document');
      }

      const parsed = payloadToFormState(pointer.kind, payload.data);
      setDocumentFrontmatter(parsed.frontmatter);
      setDocumentNotes(parsed.notes);
      setDocumentStatus('idle');
      setDocumentMessage('');
    } catch (error) {
      setDocumentStatus('error');
      setDocumentMessage(error instanceof Error ? error.message : 'Unable to load document');
    }
  }, []);

  const handleSelectPointer = useCallback(
    (pointer: DocumentPointer) => {
      setDraftContext(null);
      setOpenTreeInsertMenu(null);
      setSelectedPointer(pointer);
      setMainView('document');
      if (pointer.caseId) {
        setSelectedCaseIds([pointer.caseId]);
      }
      loadDocument(pointer);
    },
    [loadDocument],
  );

  const handleSaveDocument = useCallback(async () => {
    if (!selectedPointer && !draftContext) {
      return;
    }

    setDocumentStatus('saving');
    setDocumentMessage('');

    try {
      let endpoint = '';
      let method: 'POST' | 'PUT' = 'PUT';
      let parsed: Record<string, unknown> = {};

      if (draftContext) {
        method = 'POST';

        if (draftContext.entryType === 'event') {
          endpoint = endpointByKind.event;
          parsed = {
            eventTypes: toStringArray(documentFrontmatter.eventTypes),
            articleIds: toStringArray(documentFrontmatter.articleIds).length > 0
              ? toStringArray(documentFrontmatter.articleIds)
              : [draftContext.articleId],
            participantIds: toStringArray(documentFrontmatter.participantIds),
            details: {
              typeOfMurder: documentFrontmatter.typeOfMurder || 'Unknown/Other',
              location: documentFrontmatter.location || null,
              incidentTime: documentFrontmatter.incidentTime || null,
              court: documentFrontmatter.court || null,
              hearingType: documentFrontmatter.hearingType || null,
              notes: documentNotes,
            },
          };
        } else {
          const subtype =
            documentFrontmatter.participantSubtype === 'perpetrator'
              ? 'perpetrator'
              : 'victim';

          if (subtype === 'victim') {
            endpoint = endpointByKind.victim;
            parsed = {
              articleId: documentFrontmatter.articleId || draftContext.articleId,
              victimName: documentFrontmatter.victimName || 'Unnamed Victim',
              victimAlias: documentFrontmatter.victimAlias || null,
              victimAliases: documentFrontmatter.victimAliases || null,
              dateOfDeath: documentFrontmatter.dateOfDeath || null,
              dateOfDeathMode: documentFrontmatter.dateOfDeathMode || null,
              dateOfDeathEnd: documentFrontmatter.dateOfDeathEnd || null,
              placeOfDeathProvince: documentFrontmatter.placeOfDeathProvince || null,
              placeOfDeathTown: documentFrontmatter.placeOfDeathTown || null,
              typeOfLocation: documentFrontmatter.typeOfLocation || null,
              policeStation: documentFrontmatter.policeStation || null,
              sexualAssault: documentFrontmatter.sexualAssault || null,
              genderOfVictim: documentFrontmatter.genderOfVictim || null,
              raceOfVictim: documentFrontmatter.raceOfVictim || null,
              nationality: documentFrontmatter.nationality || null,
              ageOfVictim:
                documentFrontmatter.ageOfVictim &&
                  !Number.isNaN(Number(documentFrontmatter.ageOfVictim))
                  ? Number(documentFrontmatter.ageOfVictim)
                  : null,
              ageRangeOfVictim: documentFrontmatter.ageRangeOfVictim || null,
              ageDescriptor: documentFrontmatter.ageDescriptor || null,
              modeOfDeathGeneral: documentFrontmatter.modeOfDeathGeneral || null,
              modeOfDeathSpecific: documentFrontmatter.modeOfDeathSpecific || null,
              typeOfMurder: documentFrontmatter.typeOfMurder || null,
              notes: documentNotes,
            };
          } else {
            endpoint = endpointByKind.perpetrator;
            parsed = {
              articleId: documentFrontmatter.articleId || draftContext.articleId,
              perpetratorName: documentFrontmatter.perpetratorName || 'Unnamed Perpetrator',
              perpetratorAlias: documentFrontmatter.perpetratorAlias || null,
              suspectAliases: documentFrontmatter.suspectAliases || null,
              perpetratorRelationshipToVictim:
                documentFrontmatter.perpetratorRelationshipToVictim || null,
              suspectIdentified: documentFrontmatter.suspectIdentified || null,
              suspectArrested: documentFrontmatter.suspectArrested || null,
              suspectCharged: documentFrontmatter.suspectCharged || null,
              charges: documentFrontmatter.charges || null,
              conviction: documentFrontmatter.conviction || null,
              sentence: documentFrontmatter.sentence || null,
              notes: documentNotes,
            };
          }
        }
      } else if (selectedPointer) {
        endpoint = endpointByKind[selectedPointer.kind];
        parsed = formStateToPayload(
          selectedPointer.kind,
          documentFrontmatter,
          documentNotes,
          selectedPointer.id,
        );
      }

      const { getBaseUrl } = await import('@/lib/platform');
      const baseUrl = getBaseUrl();

      type OfflineMutateFn = (req: Request) => Promise<{ success?: boolean; error?: string; message?: string; data?: Record<string, unknown> }>;
      let offlineMutate: OfflineMutateFn;
      if (endpoint === endpointByKind.event) {
        const mod = await import('@/app/api/events/offline');
        offlineMutate = (method === 'POST' ? mod.post : mod.put) as OfflineMutateFn;
      } else if (endpoint === endpointByKind.victim) {
        const mod = await import('@/app/api/victims/offline');
        offlineMutate = (method === 'POST' ? mod.post : mod.put) as OfflineMutateFn;
      } else if (endpoint === endpointByKind.perpetrator) {
        const mod = await import('@/app/api/perpetrators/offline');
        offlineMutate = (method === 'POST' ? mod.post : mod.put) as OfflineMutateFn;
      } else {
        const mod = await import('@/app/api/articles/offline');
        offlineMutate = (method === 'POST' ? mod.post : mod.put) as OfflineMutateFn;
      }

      const req = new Request(`${baseUrl}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const payload = await offlineMutate(req);

      if (!payload?.success) {
        throw new Error(payload?.error || payload?.message || 'Unable to save document');
      }

      if (draftContext && payload?.data?.id) {
        const subtype =
          draftContext.entryType === 'participant' &&
            documentFrontmatter.participantSubtype === 'perpetrator'
            ? 'perpetrator'
            : draftContext.entryType === 'participant'
              ? 'victim'
              : 'event';

        const createdPointer: DocumentPointer = {
          id: String(payload.data.id),
          kind: subtype,
          label:
            subtype === 'event'
              ? String((payload.data as Record<string, unknown>).typeOfMurder || 'New Event')
              : subtype === 'victim'
                ? String((payload.data as Record<string, unknown>).victimName || 'New Victim')
                : String(
                  (payload.data as Record<string, unknown>).perpetratorName ||
                  'New Perpetrator',
                ),
          articleId: draftContext.articleId,
          caseId: draftContext.caseId,
        };

        setDraftContext(null);
        setSelectedPointer(createdPointer);
        await loadDocument(createdPointer);
      }

      setDocumentStatus('saved');
      setDocumentMessage('Document saved');
      setAnnotationsRefreshKey((k) => k + 1);
      window.setTimeout(() => {
        setDocumentStatus('idle');
        setDocumentMessage('');
      }, 1500);
    } catch (error) {
      setDocumentStatus('error');
      setDocumentMessage(error instanceof Error ? error.message : 'Unable to save document');
    }
  }, [
    documentFrontmatter,
    documentNotes,
    draftContext,
    loadDocument,
    selectedPointer,
  ]);

  const startLinkedDraft = useCallback(
    (articlePointer: DocumentPointer, entryType: DraftEntryType) => {
      if (!articlePointer.articleId) {
        setDocumentStatus('error');
        setDocumentMessage('Cannot create a linked document without an article ID.');
        return;
      }

      setOpenTreeInsertMenu(null);
      setSelectedPointer(null);
      setDraftContext({
        articleId: articlePointer.articleId,
        caseId: articlePointer.caseId,
        entryType,
      });
      setMainView('document');

      if (entryType === 'event') {
        setDocumentFrontmatter({
          eventTypes: 'homicide',
          articleIds: articlePointer.articleId,
          participantIds: '',
          typeOfMurder: '',
          location: '',
          incidentTime: '',
          court: '',
          hearingType: '',
        });
      } else {
        setDocumentFrontmatter({
          participantSubtype: 'victim',
          articleId: articlePointer.articleId,
          victimName: '',
          victimAlias: '',
          victimAliases: '',
          dateOfDeath: '',
          dateOfDeathMode: 'exact',
          dateOfDeathEnd: '',
          placeOfDeathProvince: '',
          placeOfDeathTown: '',
          typeOfLocation: '',
          policeStation: '',
          sexualAssault: '',
          genderOfVictim: '',
          raceOfVictim: '',
          nationality: '',
          ageOfVictim: '',
          ageRangeOfVictim: '',
          ageDescriptor: 'Unknown',
          modeOfDeathGeneral: '',
          modeOfDeathSpecific: '',
          typeOfMurder: '',
          perpetratorName: '',
          perpetratorAlias: '',
          suspectAliases: '',
          perpetratorRelationshipToVictim: '',
          suspectIdentified: '',
          suspectArrested: '',
          suspectCharged: '',
          charges: '',
          conviction: '',
          sentence: '',
        });
      }
      setDocumentNotes('');
      setDocumentStatus('idle');
      setDocumentMessage('');
    },
    [],
  );

  const createArticleDocument = useCallback(async () => {
    setOpenTreeInsertMenu(null);
    setIsDeletingDocument(false);
    setDocumentStatus('saving');
    setDocumentMessage('');

    const timestamp = new Date().toISOString();
    const payload: Record<string, unknown> = {
      newsReportHeadline: `New Article ${timestamp}`,
      newsReportUrl: `https://local.seed/article/${encodeURIComponent(timestamp)}`,
      author: 'Unknown',
      dateOfPublication: timestamp.slice(0, 10),
      notes: '',
    };

    try {
      const response = await fetch('/api/articles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: Record<string, unknown>; error?: string; message?: string }
        | null;

      if (!response.ok || !result?.success || !result.data?.id) {
        throw new Error(result?.error || result?.message || 'Unable to create article');
      }

      const pointer: DocumentPointer = {
        id: String(result.data.id),
        kind: 'article',
        label: String(result.data.newsReportHeadline || 'New Article'),
        articleId: String(result.data.id),
      };

      setAnnotationsRefreshKey((k) => k + 1);
      setDraftContext(null);
      setSelectedPointer(pointer);
      setMainView('document');
      await loadDocument(pointer);
    } catch (error) {
      setDocumentStatus('error');
      setDocumentMessage(error instanceof Error ? error.message : 'Unable to create article');
    }
  }, [loadDocument]);

  const handleRefreshTree = () => {
    setAnnotationsRefreshKey((k) => k + 1);
    if (selectedPointer && !draftContext) {
      loadDocument(selectedPointer);
    }
  };

  const handleDeleteDocument = useCallback(async () => {
    if (!selectedPointer) {
      return;
    }

    const target = selectedPointer;
    const confirmationMessage =
      target.kind === 'article'
        ? 'Delete this article? Linked events/participants will be deleted unless they are still linked to another article.'
        : `Delete this ${target.kind}?`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setIsDeletingDocument(true);
    setDocumentStatus('saving');
    setDocumentMessage('');

    try {
      const { getBaseUrl } = await import('@/lib/platform');
      const baseUrl = getBaseUrl();
      const endpoint = endpointByKind[target.kind];
      const queryKey = target.kind === 'article' ? 'articleId' : 'id';
      const req = new Request(
        `${baseUrl}${endpoint}?${queryKey}=${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      );

      type OfflineDeleteFn = (req: Request) => Promise<{
        success?: boolean;
        error?: string;
        message?: string;
      }>;
      let offlineDelete: OfflineDeleteFn;

      if (target.kind === 'event') {
        const mod = await import('@/app/api/events/offline');
        offlineDelete = mod.del as OfflineDeleteFn;
      } else if (target.kind === 'victim') {
        const mod = await import('@/app/api/victims/offline');
        offlineDelete = mod.del as OfflineDeleteFn;
      } else if (target.kind === 'perpetrator') {
        const mod = await import('@/app/api/perpetrators/offline');
        offlineDelete = mod.del as OfflineDeleteFn;
      } else {
        const mod = await import('@/app/api/articles/offline');
        offlineDelete = mod.del as OfflineDeleteFn;
      }

      const payload = await offlineDelete(req);

      if (!payload?.success) {
        throw new Error(payload?.error || payload?.message || 'Unable to delete document');
      }

      setSelectedPointer(null);
      setDraftContext(null);
      setOpenTreeInsertMenu(null);
      setDocumentFrontmatter({});
      setDocumentNotes('');
      setSelectedCaseIds([]);
      setAnnotationsRefreshKey((k) => k + 1);

      setDocumentStatus('saved');
      setDocumentMessage(
        target.kind === 'article'
          ? 'Article deleted and linked documents were reconciled.'
          : `${kindLabel[target.kind]} deleted.`,
      );

      window.setTimeout(() => {
        setDocumentStatus('idle');
        setDocumentMessage('');
      }, 1500);
    } catch (error) {
      setDocumentStatus('error');
      setDocumentMessage(error instanceof Error ? error.message : 'Unable to delete document');
    } finally {
      setIsDeletingDocument(false);
    }
  }, [selectedPointer]);

  const toggleArticleExpanded = useCallback((articleId: string) => {
    setExpandedArticleIds((current) => ({
      ...current,
      [articleId]: !(current[articleId] ?? true),
    }));
  }, []);

  const toggleTreeInsertMenu = useCallback(
    (anchorId: string, articlePointer: DocumentPointer | null = null) => {
      setOpenTreeInsertMenu((current) =>
        current?.anchorId === anchorId
          ? null
          : {
            anchorId,
            articlePointer,
          },
      );
    },
    [],
  );

  const renderTreeInserter = useCallback(
    (anchorId: string, articlePointer: DocumentPointer | null = null) => {
      const menuOpen = openTreeInsertMenu?.anchorId === anchorId;

      return (
        <div
          className={`document-tree-inserter${menuOpen ? ' is-open' : ''}`}
          key={anchorId}
        >
          <button
            type="button"
            className="document-tree-inserter-button"
            onClick={() => toggleTreeInsertMenu(anchorId, articlePointer)}
            aria-label={
              articlePointer
                ? `Add document under ${articlePointer.label}`
                : 'Add article document'
            }
            title={
              articlePointer
                ? `Add document under ${articlePointer.label}`
                : 'Add article document'
            }
          >
            + Add
          </button>

          {menuOpen && (
            <div className="document-tree-add-menu document-tree-add-menu--inserter" role="menu">
              <button
                type="button"
                className="document-tree-add-menu-item"
                onClick={() => {
                  void createArticleDocument();
                }}
              >
                Add Article
              </button>
              {articlePointer && (
                <>
                  <button
                    type="button"
                    className="document-tree-add-menu-item"
                    onClick={() => startLinkedDraft(articlePointer, 'event')}
                  >
                    Add Event
                  </button>
                  <button
                    type="button"
                    className="document-tree-add-menu-item"
                    onClick={() => startLinkedDraft(articlePointer, 'participant')}
                  >
                    Add Participant
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    },
    [createArticleDocument, openTreeInsertMenu, startLinkedDraft, toggleTreeInsertMenu],
  );

  const viewLabel: Record<MainView, string> = {
    document: 'Document',
    graph: 'Graph',
    table: 'Table',
  };
  const nextThemeMode: ThemeMode = themeMode === 'dark' ? 'light' : 'dark';

  return (
    <div className="app-shell d-flex flex-column vh-100">
      {/* Minimal top navbar */}
      <header className="app-topbar d-flex align-items-center px-3 py-2 border-bottom">
        <span className="app-topbar-brand fw-bold me-4">
          News Report Tracker
        </span>
        <div className="me-auto" />

        {/* Status indicators */}
        <div className="d-flex align-items-center gap-2">
          {!isOnline && (
            <Badge bg="danger" className="px-2 py-1">
              <i className="bi bi-wifi-off me-1" />
              Offline
            </Badge>
          )}
          {isOnline && replaying && (
            <Badge bg="info" className="px-2 py-1">
              <Spinner
                animation="border"
                size="sm"
                className="me-1"
                style={{ width: '0.7rem', height: '0.7rem' }}
              />
              Syncing
            </Badge>
          )}
          {isOnline && !replaying && queueCount > 0 && (
            <Button
              variant="warning"
              size="sm"
              className="py-0 px-2"
              onClick={handleNavSync}
              title={`${queueCount} operation${queueCount !== 1 ? 's' : ''} queued — click to sync`}
            >
              <i className="bi bi-cloud-arrow-up me-1" />
              {queueCount} queued
            </Button>
          )}

          <Button
            variant="outline-secondary"
            size="sm"
            className="topbar-icon-button py-1 px-2"
            onClick={() => {
              if (useSystemTheme) setUseSystemTheme(false);
              setThemeMode(nextThemeMode);
            }}
            title={`Switch to ${nextThemeMode} theme`}
            aria-label={`Switch to ${nextThemeMode} theme`}
          >
            <i className={`bi ${themeMode === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} />
          </Button>

          {/* Settings gear */}
          <Button
            variant="outline-secondary"
            size="sm"
            className="topbar-icon-button py-1 px-2"
            onClick={() => setShowSettings(true)}
            title="Configuration &amp; Administration"
            aria-label="Open settings"
          >
            <i className="bi bi-gear" />
          </Button>
        </div>
      </header>

      {/* Main content area */}
      <div className="app-body d-flex flex-grow-1 overflow-hidden">
        <aside className="app-sidebar app-document-sidebar border-end d-flex flex-column">
          <div className="annotation-sidebar-tools border-bottom p-3">
            <Form
              onSubmit={handleSearchSubmit}
              role="search"
              aria-label="Filter documents"
            >
              <div className="d-flex align-items-center gap-2">
                <InputGroup size="sm">
                  <Form.Control
                    type="search"
                    placeholder="Filter documents"
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    aria-label="Filter documents"
                  />
                  <Button type="submit" variant="outline-secondary" size="sm">
                    <i className="bi bi-search" />
                  </Button>
                </InputGroup>
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  className="px-2"
                  onClick={cycleAnnotationStatusFilter}
                  aria-label="Cycle status filter"
                  title={`Status filter: ${annotationStatusFilter}`}
                >
                  <i className="bi bi-funnel" />
                </Button>
                <Button
                  type="button"
                  variant="outline-secondary"
                  size="sm"
                  className="px-2"
                  onClick={handleRefreshTree}
                  aria-label="Refresh tree data"
                  title="Refresh tree data"
                >
                  <i className="bi bi-arrow-clockwise" />
                </Button>
              </div>
            </Form>
            <small className="document-filter-caption mt-2 d-block">
              Start with an article, then add events and participant subtypes beneath it.
            </small>
          </div>

          <div className="document-tree flex-grow-1 overflow-auto p-2">
            {renderTreeInserter('tree-start')}
            {treeGroups.length === 0 && (
              <p className="document-tree-empty">No matching documents.</p>
            )}
            {treeGroups.map((group) => {
              const articleActive =
                selectedPointer?.kind === 'article' &&
                selectedPointer.id === group.article.id;
              const isExpanded = expandedArticleIds[group.article.id] ?? true;
              const childPointers = [...group.events, ...group.participants];

              return (
                <Fragment key={group.article.id}>
                  <div className="document-tree-group">
                    <div className={`document-tree-parent${articleActive ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        className="document-tree-item document-tree-item--parent"
                        onClick={() => handleSelectPointer(group.article)}
                      >
                        <span className="document-tree-kind">article</span>
                        <span className="document-tree-label">{group.article.label}</span>
                      </button>
                      <button
                        type="button"
                        className="document-tree-caret"
                        onClick={() => toggleArticleExpanded(group.article.id)}
                        aria-label={isExpanded ? 'Collapse article' : 'Expand article'}
                        title={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <i className={`bi ${isExpanded ? 'bi-caret-down-fill' : 'bi-caret-right-fill'}`} />
                      </button>
                    </div>

                    {renderTreeInserter(`after-article-${group.article.id}`, group.article)}

                    {isExpanded && (
                      <div className="document-tree-children">
                        {childPointers.map((pointer, index) => {
                          const active =
                            selectedPointer?.kind === pointer.kind &&
                            selectedPointer.id === pointer.id;

                          return (
                            <Fragment key={`${pointer.kind}:${pointer.id}`}>
                              {renderTreeInserter(`between-${group.article.id}-${index}`, group.article)}
                              <button
                                type="button"
                                className={`document-tree-item document-tree-item--child${active ? ' is-active' : ''}`}
                                onClick={() => handleSelectPointer(pointer)}
                              >
                                <span className="document-tree-kind">{pointer.kind}</span>
                                <span className="document-tree-label">{pointer.label}</span>
                              </button>
                            </Fragment>
                          );
                        })}
                        {renderTreeInserter(`after-children-${group.article.id}`, group.article)}
                      </div>
                    )}
                  </div>

                  {renderTreeInserter(`between-articles-${group.article.id}`)}
                </Fragment>
              );
            })}
          </div>
        </aside>

        {/* Primary content panel */}
        <main className="app-main flex-grow-1 overflow-hidden d-flex flex-column">
          <div className="app-view-tabs border-bottom px-3">
            <Nav
              className="view-toggle"
              as="nav"
              role="tablist"
              aria-label="Document | Graph | Table workspace"
            >
              {(['document', 'graph', 'table'] as MainView[]).map((view) => (
                <Nav.Link
                  key={view}
                  as="button"
                  type="button"
                  role="tab"
                  className={`view-toggle-link${mainView === view ? ' active' : ''}`}
                  onClick={() => handleMainViewChange(view)}
                  aria-selected={mainView === view}
                  aria-controls={`workspace-panel-${view}`}
                >
                  {viewLabel[view]}
                </Nav.Link>
              ))}
            </Nav>
          </div>

          <div className="d-none" aria-hidden key={annotationsRefreshKey}>
            <ListHomicides
              embedded
              selectedCaseIds={selectedCaseIds}
              onSelectedCaseIdsChange={setSelectedCaseIds}
              onCasesLoaded={setLoadedCases}
              externalSearchTerm={searchTerm}
              syncStatusFilter={listStatusFilter}
            />
          </div>

          {mainView === 'document' && (
            <div
              className="p-3 overflow-auto"
              id="workspace-panel-document"
              role="tabpanel"
            >
              <Card className="workspace-surface">
                <Card.Header className="workspace-surface-header d-flex justify-content-between align-items-center">
                  <div>
                    <h3 className="workspace-surface-title mb-1">Document</h3>
                    <small className="graph-muted-text">
                      {draftContext
                        ? `Draft ${draftContext.entryType === 'participant' ? 'Participant' : 'Event'} linked to article ${draftContext.articleId}`
                        : selectedPointer
                          ? formatPointerLabel(selectedPointer)
                          : 'Select a pointer from the left tree'}
                    </small>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {documentStatus === 'error' && (
                      <Badge bg="danger">Error</Badge>
                    )}
                    {documentStatus === 'saved' && (
                      <Badge bg="success">Saved</Badge>
                    )}
                    {documentStatus === 'loading' && (
                      <Badge bg="info">Loading</Badge>
                    )}
                    {!selectedPointer && !draftContext ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          void createArticleDocument();
                        }}
                        disabled={
                          isDeletingDocument ||
                          documentStatus === 'loading' ||
                          documentStatus === 'saving'
                        }
                      >
                        {documentStatus === 'saving' ? 'Creating...' : 'Add New Article'}
                      </Button>
                    ) : (
                      <>
                        {selectedPointer && !draftContext && (
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={handleDeleteDocument}
                            disabled={
                              isDeletingDocument ||
                              documentStatus === 'loading' ||
                              documentStatus === 'saving'
                            }
                          >
                            {isDeletingDocument ? 'Deleting...' : 'Delete'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={handleSaveDocument}
                          disabled={
                            isDeletingDocument ||
                            documentStatus === 'loading' ||
                            documentStatus === 'saving'
                          }
                        >
                          {documentStatus === 'saving' && !isDeletingDocument
                            ? 'Saving...'
                            : draftContext
                              ? 'Create Document'
                              : 'Save Document'}
                        </Button>
                      </>
                    )}
                  </div>
                </Card.Header>
                <Card.Body>
                  {!selectedPointer && !draftContext ? (
                    <p className="mb-0 text-muted">
                      Select an article, event, or participant pointer in the side panel to open it.
                    </p>
                  ) : (
                    <>
                      {documentMessage && (
                        <p
                          className={`mb-2 ${documentStatus === 'error' ? 'text-danger' : 'text-success'}`}
                        >
                          {documentMessage}
                        </p>
                      )}
                      <section className="document-properties" aria-label="Frontmatter properties">
                        <h4 className="document-properties-title">Properties</h4>
                        {visibleEditorFields.map((field) => {
                          const rawValue = documentFrontmatter[field.key] ?? '';
                          const value =
                            field.type === 'date'
                              ? normalizeDateForInput(rawValue)
                              : rawValue;

                          return (
                            <div className="document-property-row" key={field.key}>
                              <label className="document-property-label" htmlFor={`property-${field.key}`}>
                                {field.label}
                              </label>
                              {editorKind === 'article' && field.key === 'author' ? (
                                <div>
                                  {authorValues.map((authorValue, index) => (
                                    <div className="d-flex gap-2 mb-2" key={`author-input-${index}`}>
                                      <Form.Control
                                        type="text"
                                        value={authorValue}
                                        onChange={(event) => {
                                          const nextValue = event.currentTarget.value;
                                          setAuthorValues((current) =>
                                            current.map((entry, entryIndex) =>
                                              entryIndex === index ? nextValue : entry,
                                            ),
                                          );
                                        }}
                                        disabled={isAuthorOther}
                                      />
                                      {index > 0 && (
                                        <Button
                                          variant="outline-danger"
                                          type="button"
                                          onClick={() => {
                                            setAuthorValues((current) => {
                                              const next = current.filter((_, entryIndex) => entryIndex !== index);
                                              return next.length > 0 ? next : [''];
                                            });
                                          }}
                                          disabled={isAuthorOther}
                                        >
                                          x
                                        </Button>
                                      )}
                                    </div>
                                  ))}
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    type="button"
                                    className="me-3"
                                    onClick={() => setAuthorValues((current) => [...current, ''])}
                                    disabled={isAuthorOther}
                                  >
                                    + Add Author
                                  </Button>
                                  <Form.Check
                                    inline
                                    type="checkbox"
                                    id="author-other-checkbox"
                                    label="Other"
                                    checked={isAuthorOther}
                                    onChange={(event) => {
                                      const checked = event.currentTarget.checked;
                                      setIsAuthorOther(checked);
                                      if (checked) {
                                        setAuthorOtherValue(authorOtherOptions[0]);
                                      }
                                    }}
                                  />
                                  {isAuthorOther && (
                                    <Form.Select
                                      className="mt-2"
                                      value={authorOtherValue}
                                      onChange={(event) =>
                                        setAuthorOtherValue(
                                          event.currentTarget.value as (typeof authorOtherOptions)[number],
                                        )
                                      }
                                    >
                                      {authorOtherOptions.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </Form.Select>
                                  )}
                                </div>
                              ) : editorKind === 'article' && field.key === 'newsReportPlatform' ? (
                                <div>
                                  <Form.Control
                                    id={`property-${field.key}`}
                                    type="text"
                                    list="news-outlet-options"
                                    value={value}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setFrontmatterValue(field.key, nextValue);
                                    }}
                                  />
                                  <datalist id="news-outlet-options">
                                    {outletOptions.map((option) => (
                                      <option key={option} value={option} />
                                    ))}
                                  </datalist>
                                  <div className="d-flex justify-content-between mt-2">
                                    <Form.Text className="text-muted">
                                      {outletLoading
                                        ? 'Loading platform matches...'
                                        : 'Search existing platforms or enter a new one.'}
                                    </Form.Text>
                                    {value.trim().length > 0 &&
                                      !outletOptions.some(
                                        (option) => option.toLowerCase() === value.trim().toLowerCase(),
                                      ) && (
                                        <Button
                                          variant="outline-secondary"
                                          size="sm"
                                          type="button"
                                          onClick={() => {
                                            void handleAddOutletOption();
                                          }}
                                          disabled={outletSaving}
                                        >
                                          {outletSaving ? 'Adding...' : `Add "${value.trim()}"`}
                                        </Button>
                                      )}
                                  </div>
                                </div>
                              ) : editorKind === 'event' && (field.key === 'articleIds' || field.key === 'participantIds') ? (
                                (() => {
                                  const entityLabel = field.key === 'articleIds' ? 'articles' : 'participants';
                                  const selectedIds = toStringArray(value);
                                  const allOptions = field.key === 'articleIds'
                                    ? eventArticleOptions
                                    : (() => {
                                      const optionsById = new Map<string, MultiSelectOption>();
                                      eventParticipantOptions.forEach((option) => {
                                        optionsById.set(option.id, option);
                                      });
                                      selectedIds.forEach((participantId) => {
                                        if (optionsById.has(participantId)) {
                                          return;
                                        }
                                        const resolved = resolvedParticipantOptionsById[participantId];
                                        optionsById.set(
                                          participantId,
                                          resolved || buildParticipantFallbackOption(participantId),
                                        );
                                      });
                                      return Array.from(optionsById.values());
                                    })();
                                  const labelById =
                                    field.key === 'articleIds'
                                      ? eventArticleLabelById
                                      : eventParticipantLabelById;
                                  const searchValue = pickerSearch[field.key] ?? '';
                                  const filteredOptions = allOptions.filter((option) => {
                                    if (!searchValue.trim()) {
                                      return true;
                                    }
                                    const filter = searchValue.trim().toLowerCase();
                                    return (
                                      option.label.toLowerCase().includes(filter) ||
                                      option.id.toLowerCase().includes(filter)
                                    );
                                  });
                                  const selectedOptions = selectedIds.map((id) => {
                                    const matched = allOptions.find((option) => option.id === id);
                                    if (matched) {
                                      return matched;
                                    }

                                    return {
                                      id,
                                      label: labelById.get(id) || id,
                                    } satisfies MultiSelectOption;
                                  });

                                  return (
                                    <>
                                      <Dropdown autoClose="outside">
                                        <Dropdown.Toggle
                                          variant="outline-secondary"
                                          id={`picker-${field.key}`}
                                          className="w-100 text-start d-flex justify-content-between align-items-center link-picker-toggle"
                                        >
                                          <span>
                                            {selectedIds.length > 0
                                              ? `${selectedIds.length} selected ${entityLabel}`
                                              : `Select ${entityLabel}`}
                                          </span>
                                        </Dropdown.Toggle>
                                        <Dropdown.Menu className="w-100 p-2 link-picker-menu" style={{ maxHeight: '18rem', overflowY: 'auto' }}>
                                          <Form.Control
                                            type="text"
                                            placeholder="Search by name or ID"
                                            className="mb-2 link-picker-search"
                                            value={searchValue}
                                            onChange={(event) => {
                                              const nextSearch = event.currentTarget.value;
                                              setPickerSearch((current) => ({
                                                ...current,
                                                [field.key]: nextSearch,
                                              }));
                                            }}
                                          />
                                          {selectedIds.length > 0 && (
                                            <div className="d-flex justify-content-end mb-2">
                                              <Button
                                                size="sm"
                                                variant="link"
                                                className="p-0 link-picker-clear"
                                                onClick={() => {
                                                  setFrontmatterValue(field.key, '');
                                                }}
                                              >
                                                Clear all
                                              </Button>
                                            </div>
                                          )}
                                          {filteredOptions.length === 0 ? (
                                            <div className="text-muted small px-1 py-1">No matches found.</div>
                                          ) : (
                                            filteredOptions.map((option) => {
                                              const checked = selectedIds.includes(option.id);

                                              return (
                                                <Form.Check
                                                  key={option.id}
                                                  id={`picker-${field.key}-${option.id}`}
                                                  type="checkbox"
                                                  className="mb-2 link-picker-option"
                                                  label={
                                                    <span className="link-picker-option-content">
                                                      <span className="link-picker-option-label">
                                                        {option.description
                                                          ? `${option.description}: ${option.label}`
                                                          : option.label}
                                                      </span>
                                                      <span className="link-picker-option-meta">{option.id}</span>
                                                    </span>
                                                  }
                                                  checked={checked}
                                                  onChange={(event) => {
                                                    const nextSelected = event.currentTarget.checked
                                                      ? [...selectedIds, option.id]
                                                      : selectedIds.filter((selectedId) => selectedId !== option.id);
                                                    setFrontmatterValue(field.key, nextSelected.join(', '));
                                                  }}
                                                />
                                              );
                                            })
                                          )}
                                        </Dropdown.Menu>
                                      </Dropdown>
                                      {selectedOptions.length > 0 ? (
                                        <div className="link-picker-selected-table-wrapper mt-2" aria-live="polite">
                                          <table className="table table-sm mb-0 link-picker-selected-table">
                                            <thead>
                                              <tr>
                                                <th scope="col">Name</th>
                                                <th scope="col">Type</th>
                                                <th scope="col">ID</th>
                                                <th scope="col" aria-label="Remove" />
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {selectedOptions.map((option) => {
                                                const resolvedType =
                                                  field.key === 'articleIds'
                                                    ? 'Article'
                                                    : option.description || 'Participant';
                                                const resolvedName = option.label || option.id;

                                                return (
                                                  <tr key={`selected-${field.key}-${option.id}`}>
                                                    <td title={resolvedName}>{resolvedName}</td>
                                                    <td>{resolvedType}</td>
                                                    <td className="link-picker-selected-id" title={option.id}>
                                                      {option.id}
                                                    </td>
                                                    <td>
                                                      <button
                                                        type="button"
                                                        className="link-picker-selected-remove"
                                                        onClick={() => {
                                                          const nextSelected = selectedIds.filter((selectedId) => selectedId !== option.id);
                                                          setFrontmatterValue(field.key, nextSelected.join(', '));
                                                        }}
                                                        aria-label={`Remove ${resolvedType}: ${resolvedName}`}
                                                      >
                                                        ×
                                                      </button>
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <Form.Text className="text-muted d-block mt-2">
                                          {`No ${entityLabel} selected.`}
                                        </Form.Text>
                                      )}
                                    </>
                                  );
                                })()
                              ) : field.key === 'victimName' || field.key === 'perpetratorName' ? (
                                <div>
                                  <Form.Control
                                    id={`property-${field.key}`}
                                    type="text"
                                    value={value}
                                    disabled={value.trim().toLowerCase() === 'unknown'}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setFrontmatterValue(field.key, nextValue);
                                    }}
                                  />
                                  <Form.Check
                                    type="checkbox"
                                    className="mt-2"
                                    id={`property-${field.key}-unknown`}
                                    label="Unknown"
                                    checked={value.trim().toLowerCase() === 'unknown'}
                                    onChange={(event) => {
                                      const checked = event.currentTarget.checked;
                                      setFrontmatterValue(field.key, checked ? 'Unknown' : '');
                                    }}
                                  />
                                </div>
                              ) : field.key === 'ageOfVictim' ? (
                                <div>
                                  <Form.Control
                                    id={`property-${field.key}`}
                                    type="number"
                                    min={0}
                                    max={150}
                                    value={value.trim().toLowerCase() === 'unknown' ? '' : value}
                                    disabled={value.trim().toLowerCase() === 'unknown'}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setFrontmatterValue(field.key, nextValue);
                                    }}
                                  />
                                  <Form.Check
                                    type="checkbox"
                                    className="mt-2"
                                    id={`property-${field.key}-unknown`}
                                    label="Unknown"
                                    checked={value.trim().toLowerCase() === 'unknown'}
                                    onChange={(event) => {
                                      const checked = event.currentTarget.checked;
                                      setFrontmatterValue(field.key, checked ? 'Unknown' : '');
                                    }}
                                  />
                                </div>
                              ) : field.key === 'victimAliases' || field.key === 'suspectAliases' ? (
                                <>
                                  <Form.Control
                                    id={`property-${field.key}`}
                                    type="text"
                                    value={value}
                                    onChange={(event) => {
                                      const nextValue = event.currentTarget.value;
                                      setFrontmatterValue(field.key, nextValue);
                                    }}
                                    placeholder="Comma separated aliases"
                                  />
                                  <Form.Text className="text-muted">
                                    Separate multiple aliases with commas.
                                  </Form.Text>
                                </>
                              ) : field.type === 'select' ? (
                                <Form.Select
                                  id={`property-${field.key}`}
                                  value={value}
                                  onChange={(event) => {
                                    const nextValue = event.currentTarget.value;
                                    setFrontmatterValue(field.key, nextValue);
                                  }}
                                >
                                  {(field.options ?? []).map((option) => (
                                    <option key={option} value={option}>
                                      {field.key === 'ageDescriptor' && option === ''
                                        ? 'Unselected'
                                        : getSelectOptionLabel(option)}
                                    </option>
                                  ))}
                                </Form.Select>
                              ) : field.type === 'textarea' ? (
                                <Form.Control
                                  as="textarea"
                                  id={`property-${field.key}`}
                                  rows={3}
                                  value={value}
                                  onChange={(event) => {
                                    const nextValue = event.currentTarget.value;
                                    setDocumentFrontmatter((current) => ({
                                      ...current,
                                      [field.key]: nextValue,
                                    }));
                                  }}
                                />
                              ) : (
                                <Form.Control
                                  id={`property-${field.key}`}
                                  type={field.type === 'date' ? 'date' : 'text'}
                                  value={value}
                                  onChange={(event) => {
                                    const nextValue = event.currentTarget.value;
                                    setFrontmatterValue(field.key, nextValue);
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </section>

                      <Form.Group controlId="document-notes" className="mt-4">
                        <Form.Label className="mb-1">Notes</Form.Label>
                        <Form.Control
                          as="textarea"
                          rows={12}
                          className="document-editor-textarea"
                          value={documentNotes}
                          onChange={(event) => setDocumentNotes(event.currentTarget.value)}
                          spellCheck={false}
                        />
                        <Form.Text className="text-muted">
                          Free-text narrative content stored below frontmatter.
                        </Form.Text>
                      </Form.Group>
                    </>
                  )}
                </Card.Body>
              </Card>
            </div>
          )}

          {mainView === 'graph' && (
            <div
              className="p-3 h-100 overflow-auto"
              id="workspace-panel-graph"
              role="tabpanel"
            >
              {/* Connected Graph workspace — shows relationships between events */}
              <ConnectedGraphWorkspace
                cases={graphCases}
                selectedCaseIds={selectedCaseIds}
                onSelectedCaseIdsChange={setSelectedCaseIds}
              />
            </div>
          )}

          {mainView === 'table' && (
            <div
              className="p-3 h-100 overflow-auto"
              id="workspace-panel-table"
              role="tabpanel"
            >
              <Card className="workspace-surface">
                <Card.Header className="workspace-surface-header">
                  <h3 className="workspace-surface-title mb-0">Documents Table</h3>
                </Card.Header>
                <Card.Body className="p-0">
                  <table className="table mb-0 document-table">
                    <thead>
                      <tr>
                        <th scope="col">Article</th>
                        <th scope="col">Linked Event</th>
                        <th scope="col">Linked Participant</th>
                        <th scope="col">Pointer Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {treeGroups.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-muted">
                            No matching documents.
                          </td>
                        </tr>
                      )}
                      {treeGroups.map((group) => {
                        const maxRows = Math.max(1, group.events.length, group.participants.length);
                        return Array.from({ length: maxRows }, (_, index) => {
                          const eventPointer = group.events[index] ?? null;
                          const participantPointer = group.participants[index] ?? null;
                          return (
                            <tr key={`${group.article.id}-${index}`}>
                              {index === 0 && (
                                <td rowSpan={maxRows}>
                                  <button
                                    type="button"
                                    className="document-table-link"
                                    onClick={() => handleSelectPointer(group.article)}
                                  >
                                    {group.article.label}
                                  </button>
                                </td>
                              )}
                              <td>
                                {eventPointer ? (
                                  <button
                                    type="button"
                                    className="document-table-link"
                                    onClick={() => handleSelectPointer(eventPointer)}
                                  >
                                    {eventPointer.label}
                                  </button>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                {participantPointer ? (
                                  <button
                                    type="button"
                                    className="document-table-link"
                                    onClick={() => handleSelectPointer(participantPointer)}
                                  >
                                    {participantPointer.label}
                                  </button>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                {participantPointer
                                  ? kindLabel[participantPointer.kind]
                                  : eventPointer
                                    ? kindLabel[eventPointer.kind]
                                    : kindLabel[group.article.kind]}
                              </td>
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </Card.Body>
              </Card>
            </div>
          )}
        </main>
      </div >

      {/* Settings modal */}
      < SettingsPanel
        show={showSettings}
        onHide={() => setShowSettings(false)
        }
      />
    </div >
  );
}
