import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Bus,
  CheckCircle2,
  Clock,
  Dumbbell,
  Link2,
  Minus,
  Moon,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import type {
  AppLanguage,
  HomeworkItem,
  LessonSlot,
  PersonalBlockAnchor,
  PersonalBlockCategory,
  PersonalTimeBlock,
  RuleDayOfWeek,
  ScheduleExemption,
  SchoolTest,
  UserSettings,
} from '../types';
import { tr } from '../utils/i18n';
import { addDaysYmd, formatWeekdayShort, getMondayYmd } from '../utils/packingEngine';
import {
  describePersonalBlockAnchor,
  formatDurationMinutes,
  getPersonalBlockDurationMinutes,
  hhmmToMinutes,
  personalBlockCategoryLabel,
  resolvePersonalBlocksForDate,
} from '../utils/shortsBuilder';
import {
  ALL_RULE_DAYS,
  SCHOOL_RULE_DAYS,
  getDaySchedule,
  ruleWeekdayLabel,
} from '../utils/smartEngine';

export type RoutineScope = RuleDayOfWeek | 'all';

type ExampleChipKind = 'to-school' | 'home' | 'breakfast' | 'dinner' | 'sleep';

const DURATION_PRESETS = [15, 20, 30, 40, 45, 60];
const GAP_PRESETS = [0, 5, 10, 15, 30];

export function removePersonalBlockSafely(
  blocks: PersonalTimeBlock[],
  blockId: string,
): PersonalTimeBlock[] {
  return blocks
    .filter((b) => b.id !== blockId)
    .map((b) => {
      if (b.anchorBlockId !== blockId) return b;
      return {
        ...b,
        anchor: (b.anchor === 'before-block'
          ? 'before-school-start'
          : 'after-school-end') as PersonalBlockAnchor,
        anchorBlockId: undefined,
      };
    });
}

export function upsertPersonalBlock(
  blocks: PersonalTimeBlock[],
  saved: PersonalTimeBlock,
): PersonalTimeBlock[] {
  const exists = blocks.some((b) => b.id === saved.id);
  if (exists) {
    return blocks.map((b) => (b.id === saved.id ? saved : b));
  }
  return [...blocks, saved];
}

function fullDayName(day: RuleDayOfWeek, lang: AppLanguage): string {
  const pl: Record<RuleDayOfWeek, string> = {
    1: 'Poniedziałek',
    2: 'Wtorek',
    3: 'Środa',
    4: 'Czwartek',
    5: 'Piątek',
    6: 'Sobota',
    7: 'Niedziela',
  };
  const en: Record<RuleDayOfWeek, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
  };
  return lang === 'pl' ? pl[day] : en[day];
}

function summarizeDays(days: RuleDayOfWeek[], lang: AppLanguage): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return tr(lang, 'Codziennie', 'Every day');
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) {
    return tr(lang, 'Pn–Pt', 'Mon–Fri');
  }
  if (sorted.length === 2 && sorted[0] === 6 && sorted[1] === 7) {
    return tr(lang, 'Weekend', 'Weekend');
  }
  return sorted.map((d) => ruleWeekdayLabel(d, lang)).join(', ');
}

function hasExampleBlock(blocks: PersonalTimeBlock[], kind: ExampleChipKind): boolean {
  if (kind === 'to-school') {
    return blocks.some(
      (b) =>
        (b.category === 'transit' && b.anchor === 'before-school-start') ||
        /dojazd do szkoły|transit to school|morning transit/i.test(b.name),
    );
  }
  if (kind === 'home') {
    return blocks.some(
      (b) =>
        (b.category === 'transit' && b.anchor === 'after-school-end') ||
        /powrót do domu|transit home/i.test(b.name),
    );
  }
  if (kind === 'breakfast') {
    return blocks.some(
      (b) =>
        /śniadanie|breakfast/i.test(b.name) ||
        (b.category === 'meal' &&
          (b.anchor === 'before-school-start' || b.anchor === 'before-block')),
    );
  }
  if (kind === 'dinner') {
    return blocks.some(
      (b) =>
        /obiad|dinner/i.test(b.name) ||
        (b.category === 'meal' &&
          (b.anchor === 'after-school-end' || b.anchor === 'after-block')),
    );
  }
  return blocks.some((b) => b.category === 'sleep' || /^sen$|sleep/i.test(b.name));
}

function countDuplicateBlocks(blocks: PersonalTimeBlock[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const b of blocks) {
    const key = `${b.name.trim().toLowerCase()}|${b.category}|${b.anchor ?? 'fixed'}|${[...b.daysOfWeek].sort().join(',')}`;
    if (seen.has(key)) {
      duplicates += 1;
    } else {
      seen.add(key);
    }
  }
  return duplicates;
}

function CategoryIcon({
  category,
  className = 'h-4 w-4',
}: {
  category: PersonalBlockCategory;
  className?: string;
}) {
  if (category === 'meal') return <Utensils className={className} />;
  if (category === 'transit') return <Bus className={className} />;
  if (category === 'sleep') return <Moon className={className} />;
  if (category === 'hobby') return <Dumbbell className={className} />;
  return <Clock className={className} />;
}

interface EditorState {
  mode: 'create' | 'edit';
  editingBlock: PersonalTimeBlock | null;
  editTargetScope: 'single-day' | 'all-block-days';
  name: string;
  category: PersonalBlockCategory;
  anchor: PersonalBlockAnchor;
  anchorBlockId: string;
  durationMinutes: number;
  offsetMinutes: number;
  startTime: string;
  endTime: string;
  daysOfWeek: RuleDayOfWeek[];
  enabled: boolean;
  note: string;
}

interface PersonalBlocksManagerProps {
  blocks: PersonalTimeBlock[];
  timetable: LessonSlot[];
  exemptions: ScheduleExemption[];
  referenceDateYmd: string;
  lang: AppLanguage;
  settings?: UserSettings;
  homework?: HomeworkItem[];
  tests?: SchoolTest[];
  initialScope?: RoutineScope;
  initialEditBlockId?: string | null;
  onSaveBlocks: (next: PersonalTimeBlock[]) => void;
}

export function PersonalBlocksManager({
  blocks,
  timetable,
  exemptions,
  referenceDateYmd,
  lang,
  settings,
  homework,
  tests,
  initialScope = 'all',
  initialEditBlockId = null,
  onSaveBlocks,
}: PersonalBlocksManagerProps) {
  const [scope, setScope] = useState<RoutineScope>(initialScope);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);

  const mondayYmd = useMemo(() => getMondayYmd(referenceDateYmd), [referenceDateYmd]);

  // 7 dates Mon..Sun for the reference week
  const fullWeekDates = useMemo(() => {
    const map = {} as Record<RuleDayOfWeek, string>;
    for (const day of ALL_RULE_DAYS) {
      map[day] = addDaysYmd(mondayYmd, day - 1);
    }
    return map;
  }, [mondayYmd]);

  const buildCreateEditor = (targetScope: RoutineScope): EditorState => {
    const isSingleDay = targetScope !== 'all';
    const isWeekendDay = targetScope === 6 || targetScope === 7;
    const defaultAnchor: PersonalBlockAnchor = isWeekendDay ? 'fixed' : 'before-school-start';
    const defaultDays: RuleDayOfWeek[] = isSingleDay
      ? [targetScope]
      : defaultAnchor === 'fixed'
        ? [...ALL_RULE_DAYS]
        : [...SCHOOL_RULE_DAYS];

    return {
      mode: 'create',
      editingBlock: null,
      editTargetScope: isSingleDay ? 'single-day' : 'all-block-days',
      name: '',
      category: isWeekendDay ? 'meal' : 'transit',
      anchor: defaultAnchor,
      anchorBlockId: blocks[0]?.id ?? '',
      durationMinutes: 40,
      offsetMinutes: 0,
      startTime: '16:00',
      endTime: '16:45',
      daysOfWeek: defaultDays,
      enabled: true,
      note: '',
    };
  };

  const buildEditEditor = (
    block: PersonalTimeBlock,
    currentScope: RoutineScope,
  ): EditorState => {
    const isMultiDay = block.daysOfWeek.length > 1;
    const defaultTarget =
      currentScope !== 'all' && isMultiDay ? 'single-day' : 'all-block-days';

    return {
      mode: 'edit',
      editingBlock: block,
      editTargetScope: defaultTarget,
      name: block.name,
      category: block.category,
      anchor: block.anchor ?? 'fixed',
      anchorBlockId: block.anchorBlockId ?? '',
      durationMinutes:
        block.durationMinutes ?? getPersonalBlockDurationMinutes(block.startTime, block.endTime),
      offsetMinutes: block.offsetMinutes ?? 0,
      startTime: block.startTime || '16:00',
      endTime: block.endTime || '16:45',
      daysOfWeek: [...block.daysOfWeek],
      enabled: block.enabled,
      note: block.note ?? '',
    };
  };

  const [editor, setEditor] = useState<EditorState | null>(() => {
    if (!initialEditBlockId) return null;
    const target = blocks.find((b) => b.id === initialEditBlockId);
    return target ? buildEditEditor(target, initialScope) : null;
  });

  useEffect(() => {
    if (!feedback && highlightedIds.length === 0) return;
    const timer = window.setTimeout(() => {
      setFeedback(null);
      setHighlightedIds([]);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [feedback, highlightedIds]);

  // Resolve blocks for each day 1..7 so every day tab shows exact count and times
  const resolvedByDay = useMemo(() => {
    const map = {} as Record<
      RuleDayOfWeek,
      ReturnType<typeof resolvePersonalBlocksForDate>
    >;
    for (const day of ALL_RULE_DAYS) {
      map[day] = resolvePersonalBlocksForDate({
        date: fullWeekDates[day],
        blocks,
        timetable,
        exemptions,
        lang,
        settings,
        homework,
        tests,
      });
    }
    return map;
  }, [fullWeekDates, blocks, timetable, exemptions, lang, settings, homework, tests]);

  // Also include disabled blocks assigned to a specific day so user can see/re-enable/delete them
  const blocksForSelectedDay = useMemo(() => {
    if (scope === 'all') return [];
    const resolvedList = resolvedByDay[scope];
    const resolvedMap = new Map(resolvedList.map((r) => [r.block.id, r]));
    const matching = blocks.filter((b) => b.daysOfWeek.includes(scope));
    return matching
      .map((block) => ({
        block,
        resolved: resolvedMap.get(block.id) ?? null,
      }))
      .sort((a, b) => {
        const aMin = a.resolved ? a.resolved.startMin : hhmmToMinutes(a.block.startTime);
        const bMin = b.resolved ? b.resolved.startMin : hhmmToMinutes(b.block.startTime);
        return aMin - bMin;
      });
  }, [scope, resolvedByDay, blocks]);

  const sortedAllBlocks = useMemo(() => {
    return [...blocks].sort((a, b) => {
      const aSample =
        ALL_RULE_DAYS.map((d) => resolvedByDay[d].find((r) => r.block.id === a.id)).find(Boolean) ??
        null;
      const bSample =
        ALL_RULE_DAYS.map((d) => resolvedByDay[d].find((r) => r.block.id === b.id)).find(Boolean) ??
        null;
      const aMin = aSample ? aSample.startMin : hhmmToMinutes(a.startTime);
      const bMin = bSample ? bSample.startMin : hhmmToMinutes(b.startTime);
      return aMin - bMin;
    });
  }, [blocks, resolvedByDay]);

  const selectedDaySchedule = useMemo(() => {
    if (scope === 'all') return null;
    return getDaySchedule(fullWeekDates[scope], timetable, exemptions);
  }, [scope, fullWeekDates, timetable, exemptions]);

  const duplicateCount = useMemo(() => countDuplicateBlocks(blocks), [blocks]);

  const announce = (msg: string, ids: string[] = []) => {
    setFeedback(msg);
    setHighlightedIds(ids);
  };

  // Starter example chips — disappear automatically once added
  const morningTransitBlock = blocks.find((b) => b.anchor === 'before-school-start');
  const transitHomeBlock = blocks.find((b) => b.anchor === 'after-school-end');

  const availableExampleChips = (
    [
      {
        kind: 'to-school' as const,
        title: tr(lang, 'Dojazd do szkoły', 'Transit to School'),
        detail: tr(lang, '40m przed szkołą', '40m before school'),
      },
      {
        kind: 'home' as const,
        title: tr(lang, 'Powrót do domu', 'Transit Home'),
        detail: tr(lang, '40m po lekcjach', '40m after school'),
      },
      {
        kind: 'breakfast' as const,
        title: tr(lang, 'Śniadanie', 'Breakfast'),
        detail: morningTransitBlock
          ? tr(lang, `30m przed: ${morningTransitBlock.name}`, `30m before ${morningTransitBlock.name}`)
          : tr(lang, '30m przed szkołą', '30m before school'),
      },
      {
        kind: 'dinner' as const,
        title: tr(lang, 'Obiad', 'Dinner'),
        detail: transitHomeBlock
          ? tr(lang, `45m po: ${transitHomeBlock.name}`, `45m after ${transitHomeBlock.name}`)
          : tr(lang, '45m po lekcjach', '45m after school'),
      },
      {
        kind: 'sleep' as const,
        title: tr(lang, 'Sen', 'Sleep'),
        detail: '22:30–07:00',
      },
    ] as Array<{ kind: ExampleChipKind; title: string; detail: string }>
  ).filter((chip) => !hasExampleBlock(blocks, chip.kind));

  const canAutoBuildTypicalDay =
    !hasExampleBlock(blocks, 'to-school') ||
    !hasExampleBlock(blocks, 'home') ||
    !hasExampleBlock(blocks, 'dinner') ||
    !hasExampleBlock(blocks, 'sleep');

  const handleApplyTypicalDay = () => {
    const base = Date.now();
    const toSchoolId = `pblock-${base}-to`;
    const homeId = `pblock-${base}-home`;
    const dinnerId = `pblock-${base}-din`;
    const sleepId = `pblock-${base}-slp`;

    const existingHomeTransit = blocks.find(
      (b) => b.category === 'transit' && b.anchor === 'after-school-end',
    );
    const toAdd: PersonalTimeBlock[] = [];

    if (!hasExampleBlock(blocks, 'to-school')) {
      toAdd.push({
        id: toSchoolId,
        name: tr(lang, 'Dojazd do szkoły', 'Transit to School'),
        category: 'transit',
        startTime: '07:20',
        endTime: '08:00',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: 'before-school-start',
        durationMinutes: 40,
        offsetMinutes: 0,
      });
    }
    const homeTargetId = existingHomeTransit?.id ?? homeId;
    if (!hasExampleBlock(blocks, 'home')) {
      toAdd.push({
        id: homeId,
        name: tr(lang, 'Powrót do domu', 'Transit Home'),
        category: 'transit',
        startTime: '14:40',
        endTime: '15:20',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: 'after-school-end',
        durationMinutes: 40,
        offsetMinutes: 0,
      });
    }
    if (!hasExampleBlock(blocks, 'dinner')) {
      toAdd.push({
        id: dinnerId,
        name: tr(lang, 'Obiad', 'Dinner'),
        category: 'meal',
        startTime: '15:30',
        endTime: '16:15',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: 'after-block',
        anchorBlockId: homeTargetId,
        durationMinutes: 45,
        offsetMinutes: 10,
      });
    }
    if (!hasExampleBlock(blocks, 'sleep')) {
      toAdd.push({
        id: sleepId,
        name: tr(lang, 'Sen', 'Sleep'),
        category: 'sleep',
        startTime: '22:30',
        endTime: '07:00',
        daysOfWeek: [...ALL_RULE_DAYS],
        enabled: true,
        anchor: 'fixed',
      });
    }

    if (toAdd.length > 0) {
      onSaveBlocks([...blocks, ...toAdd]);
      announce(
        tr(
          lang,
          `Dodano ${toAdd.length} bloki na cały tydzień. Wybierz dowolny dzień powyżej, aby je sprawdzić lub edytować.`,
          `Added ${toAdd.length} blocks for the whole week. Tap any day above to inspect or edit them.`,
        ),
        toAdd.map((b) => b.id),
      );
    }
  };

  const handleQuickChip = (kind: ExampleChipKind) => {
    if (hasExampleBlock(blocks, kind)) return;
    const id = `pblock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let created: PersonalTimeBlock;

    if (kind === 'to-school') {
      created = {
        id,
        name: tr(lang, 'Dojazd do szkoły', 'Transit to School'),
        category: 'transit',
        startTime: '07:20',
        endTime: '08:00',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: 'before-school-start',
        durationMinutes: 40,
        offsetMinutes: 0,
      };
    } else if (kind === 'home') {
      created = {
        id,
        name: tr(lang, 'Powrót do domu', 'Transit Home'),
        category: 'transit',
        startTime: '14:40',
        endTime: '15:20',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: 'after-school-end',
        durationMinutes: 40,
        offsetMinutes: 0,
      };
    } else if (kind === 'breakfast') {
      created = {
        id,
        name: tr(lang, 'Śniadanie i szykowanie', 'Breakfast & Getting Ready'),
        category: 'meal',
        startTime: '06:50',
        endTime: '07:20',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: morningTransitBlock ? 'before-block' : 'before-school-start',
        anchorBlockId: morningTransitBlock?.id,
        durationMinutes: 30,
        offsetMinutes: 0,
      };
    } else if (kind === 'dinner') {
      created = {
        id,
        name: tr(lang, 'Obiad', 'Dinner'),
        category: 'meal',
        startTime: '15:30',
        endTime: '16:15',
        daysOfWeek: [...SCHOOL_RULE_DAYS],
        enabled: true,
        anchor: transitHomeBlock ? 'after-block' : 'after-school-end',
        anchorBlockId: transitHomeBlock?.id,
        durationMinutes: 45,
        offsetMinutes: transitHomeBlock ? 10 : 15,
      };
    } else {
      created = {
        id,
        name: tr(lang, 'Sen', 'Sleep'),
        category: 'sleep',
        startTime: '22:30',
        endTime: '07:00',
        daysOfWeek: [...ALL_RULE_DAYS],
        enabled: true,
        anchor: 'fixed',
      };
    }

    onSaveBlocks([...blocks, created]);
    announce(
      tr(lang, `Dodano „${created.name}” do Twojego planu.`, `Added “${created.name}” to your plan.`),
      [created.id],
    );
  };

  const handleRemoveDuplicates = () => {
    const seen = new Map<string, string>();
    const kept: PersonalTimeBlock[] = [];
    const removedToKept = new Map<string, string>();

    for (const b of blocks) {
      const key = `${b.name.trim().toLowerCase()}|${b.category}|${b.anchor ?? 'fixed'}|${[...b.daysOfWeek].sort().join(',')}`;
      const existingId = seen.get(key);
      if (existingId) {
        removedToKept.set(b.id, existingId);
      } else {
        seen.set(key, b.id);
        kept.push(b);
      }
    }

    const remapped = kept.map((b) =>
      b.anchorBlockId && removedToKept.has(b.anchorBlockId)
        ? { ...b, anchorBlockId: removedToKept.get(b.anchorBlockId) }
        : b,
    );
    onSaveBlocks(remapped);
    announce(
      tr(
        lang,
        `Usunięto ${removedToKept.size} zduplikowane bloki.`,
        `Removed ${removedToKept.size} duplicate blocks.`,
      ),
    );
  };

  const handleRemoveFromSingleDay = (block: PersonalTimeBlock, day: RuleDayOfWeek) => {
    if (block.daysOfWeek.length <= 1) {
      onSaveBlocks(removePersonalBlockSafely(blocks, block.id));
      announce(
        tr(
          lang,
          `Usunięto „${block.name}” z: ${fullDayName(day, lang)}.`,
          `Removed “${block.name}” from ${fullDayName(day, lang)}.`,
        ),
      );
      return;
    }
    const nextDays = block.daysOfWeek.filter((d) => d !== day) as RuleDayOfWeek[];
    onSaveBlocks(blocks.map((b) => (b.id === block.id ? { ...b, daysOfWeek: nextDays } : b)));
    announce(
      tr(
        lang,
        `Usunięto „${block.name}” tylko z: ${fullDayName(day, lang)} (pozostałe dni bez zmian).`,
        `Removed “${block.name}” from ${fullDayName(day, lang)} only (other days kept).`,
      ),
    );
  };

  const handleDeleteEntireWeek = (block: PersonalTimeBlock) => {
    onSaveBlocks(removePersonalBlockSafely(blocks, block.id));
    announce(
      tr(
        lang,
        `Usunięto „${block.name}” z całego tygodnia.`,
        `Deleted “${block.name}” from the entire week.`,
      ),
    );
  };

  const handleAdjustDuration = (blockId: string, delta: number) => {
    onSaveBlocks(
      blocks.map((b) => {
        if (b.id !== blockId || (b.anchor ?? 'fixed') === 'fixed') return b;
        const current = Math.max(5, Math.round(b.durationMinutes ?? 30));
        return { ...b, durationMinutes: Math.max(5, Math.min(360, current + delta)) };
      }),
    );
  };

  const handleToggleEnabled = (blockId: string) => {
    onSaveBlocks(blocks.map((b) => (b.id === blockId ? { ...b, enabled: !b.enabled } : b)));
  };

  // --- Editor computations ---
  const editorAnchorTargets = useMemo(() => {
    if (!editor) return [];
    const selfId = editor.editingBlock?.id;
    return blocks.filter((b) => {
      if (selfId && (b.id === selfId || b.anchorBlockId === selfId)) return false;
      if (scope !== 'all' && !b.daysOfWeek.includes(scope)) return false;
      return true;
    });
  }, [editor, blocks, scope]);

  const effectiveEditorAnchorTargetId = useMemo(() => {
    if (!editor) return '';
    if (editor.anchorBlockId && editorAnchorTargets.some((b) => b.id === editor.anchorBlockId)) {
      return editor.anchorBlockId;
    }
    return editorAnchorTargets[0]?.id ?? '';
  }, [editor, editorAnchorTargets]);

  const editorPreviewSlots = useMemo(() => {
    if (!editor) return [];
    const isFixed = editor.anchor === 'fixed';
    const effectiveDays: RuleDayOfWeek[] =
      scope !== 'all' &&
      ((editor.mode === 'create' && editor.daysOfWeek.length === 1 && editor.daysOfWeek[0] === scope) ||
        (editor.mode === 'edit' && editor.editTargetScope === 'single-day'))
        ? [scope]
        : editor.daysOfWeek.length > 0
          ? editor.daysOfWeek
          : [...SCHOOL_RULE_DAYS];

    const draft: PersonalTimeBlock = {
      id: editor.editingBlock?.id ?? '__editor_preview__',
      name: editor.name.trim() || tr(lang, 'Podgląd', 'Preview'),
      category: editor.category,
      startTime: isFixed ? editor.startTime || '16:00' : '07:20',
      endTime: isFixed ? editor.endTime || '16:45' : '08:00',
      daysOfWeek: effectiveDays,
      enabled: true,
      anchor: editor.anchor,
      anchorBlockId:
        editor.anchor === 'before-block' || editor.anchor === 'after-block'
          ? effectiveEditorAnchorTargetId || undefined
          : undefined,
      durationMinutes: isFixed ? undefined : Math.max(5, Math.min(360, editor.durationMinutes)),
      offsetMinutes: isFixed ? undefined : Math.max(0, Math.min(240, editor.offsetMinutes)),
    };

    const combined = upsertPersonalBlock(blocks, draft);
    const daysToInspect: RuleDayOfWeek[] = scope !== 'all' ? [scope] : [...ALL_RULE_DAYS];
    const results: Array<{ day: RuleDayOfWeek; date: string; startTime: string; endTime: string }> =
      [];

    for (const day of daysToInspect) {
      const date = fullWeekDates[day];
      const resolved = resolvePersonalBlocksForDate({
        date,
        blocks: combined,
        timetable,
        exemptions,
        lang,
        settings,
        homework,
        tests,
      });
      const hit = resolved.find((r) => r.block.id === draft.id);
      if (hit) {
        results.push({ day, date, startTime: hit.startTime, endTime: hit.endTime });
      }
    }
    return results;
  }, [
    editor,
    scope,
    effectiveEditorAnchorTargetId,
    blocks,
    fullWeekDates,
    timetable,
    exemptions,
    lang,
    settings,
    homework,
    tests,
  ]);

  const handleSaveEditor = (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const cleaned = editor.name.trim();
    if (!cleaned) return;
    if (
      (editor.anchor === 'before-block' || editor.anchor === 'after-block') &&
      !effectiveEditorAnchorTargetId
    ) {
      return;
    }

    const isFixed = editor.anchor === 'fixed';
    const previewSample = editorPreviewSlots[0];

    // Splitting a multi-day block when editing ONLY the selected single day
    if (
      editor.mode === 'edit' &&
      editor.editingBlock &&
      scope !== 'all' &&
      editor.editTargetScope === 'single-day' &&
      editor.editingBlock.daysOfWeek.length > 1
    ) {
      const original = editor.editingBlock;
      const remainingDays = original.daysOfWeek.filter((d) => d !== scope) as RuleDayOfWeek[];
      const splitBlock: PersonalTimeBlock = {
        id: `pblock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleaned,
        category: editor.category,
        startTime: isFixed ? editor.startTime || '16:00' : previewSample?.startTime ?? original.startTime,
        endTime: isFixed ? editor.endTime || '16:45' : previewSample?.endTime ?? original.endTime,
        daysOfWeek: [scope],
        enabled: editor.enabled,
        note: editor.note.trim() || undefined,
        anchor: editor.anchor,
        anchorBlockId:
          editor.anchor === 'before-block' || editor.anchor === 'after-block'
            ? effectiveEditorAnchorTargetId
            : undefined,
        durationMinutes: isFixed ? undefined : Math.max(5, Math.min(360, editor.durationMinutes)),
        offsetMinutes: isFixed ? undefined : Math.max(0, Math.min(240, editor.offsetMinutes)),
      };
      const updated = blocks.map((b) =>
        b.id === original.id ? { ...b, daysOfWeek: remainingDays } : b,
      );
      onSaveBlocks([...updated, splitBlock]);
      setEditor(null);
      announce(
        tr(
          lang,
          `Zapisano „${splitBlock.name}” osobno dla: ${fullDayName(scope, lang)}.`,
          `Saved “${splitBlock.name}” separately for ${fullDayName(scope, lang)}.`,
        ),
        [splitBlock.id],
      );
      return;
    }

    const finalDays = (
      editor.daysOfWeek.length > 0
        ? [...editor.daysOfWeek].sort((a, b) => a - b)
        : scope !== 'all'
          ? [scope]
          : [...SCHOOL_RULE_DAYS]
    ) as RuleDayOfWeek[];

    const saved: PersonalTimeBlock = {
      id:
        editor.editingBlock?.id ??
        `pblock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleaned,
      category: editor.category,
      startTime: isFixed
        ? editor.startTime || '16:00'
        : previewSample?.startTime ?? editor.editingBlock?.startTime ?? '07:20',
      endTime: isFixed
        ? editor.endTime || '16:45'
        : previewSample?.endTime ?? editor.editingBlock?.endTime ?? '08:00',
      daysOfWeek: finalDays,
      enabled: editor.enabled,
      note: editor.note.trim() || undefined,
      anchor: editor.anchor,
      anchorBlockId:
        editor.anchor === 'before-block' || editor.anchor === 'after-block'
          ? effectiveEditorAnchorTargetId
          : undefined,
      durationMinutes: isFixed ? undefined : Math.max(5, Math.min(360, editor.durationMinutes)),
      offsetMinutes: isFixed ? undefined : Math.max(0, Math.min(240, editor.offsetMinutes)),
    };

    onSaveBlocks(upsertPersonalBlock(blocks, saved));
    setEditor(null);
    announce(
      editor.mode === 'create'
        ? tr(lang, `Dodano blok „${saved.name}”.`, `Added “${saved.name}”.`)
        : tr(lang, `Zapisano zmiany w „${saved.name}”.`, `Saved changes to “${saved.name}”.`),
      [saved.id],
    );
  };

  return (
    <div className="space-y-4">
      {/* 8-Option Selector: Mon..Sun + 8th Option "Whole Week" */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-blue-400">
          {tr(
            lang,
            'Wybierz dzień tygodnia albo 8. opcję „Cały tydzień”:',
            'Pick a day of the week, or the 8th option “Whole Week”:',
          )}
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
          {ALL_RULE_DAYS.map((day) => {
            const isSelected = scope === day;
            const count = blocks.filter((b) => b.daysOfWeek.includes(day)).length;
            return (
              <button
                key={day}
                type="button"
                onClick={() => {
                  setScope(day);
                  setEditor(null);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-colors min-w-0 ${
                  isSelected
                    ? 'bg-blue-500 text-black border-blue-400 font-bold'
                    : 'bg-black border-blue-950 text-blue-200 hover:border-blue-600'
                }`}
              >
                <span className="text-xs leading-tight truncate">
                  {ruleWeekdayLabel(day, lang)}
                </span>
                <span
                  className={`font-mono text-[10px] mt-0.5 tabular-nums ${
                    isSelected ? 'text-black/80 font-bold' : 'text-blue-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* 8th Option: Whole Week */}
          <button
            type="button"
            onClick={() => {
              setScope('all');
              setEditor(null);
            }}
            className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-colors min-w-0 ${
              scope === 'all'
                ? 'bg-cyan-400 text-black border-cyan-300 font-bold'
                : 'bg-black border-cyan-900/70 text-cyan-300 hover:border-cyan-500'
            }`}
          >
            <span className="text-xs leading-tight truncate">
              {tr(lang, 'Tydzień', 'All Week')}
            </span>
            <span
              className={`font-mono text-[10px] mt-0.5 tabular-nums ${
                scope === 'all' ? 'text-black/80 font-bold' : 'text-cyan-400/80'
              }`}
            >
              {blocks.length}
            </span>
          </button>
        </div>
      </div>

      {/* Confirmation Feedback Banner */}
      {feedback && (
        <div className="px-3.5 py-2.5 bg-emerald-950/40 border border-emerald-700/60 rounded-xl flex items-center gap-2 text-xs text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* VIEW A: Clean Inline Add / Edit Form (NEVER overlays or stacks!) */}
      {editor ? (
        <form
          onSubmit={handleSaveEditor}
          className="bg-black border border-blue-900 rounded-2xl p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-blue-950">
            <button
              type="button"
              onClick={() => setEditor(null)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-300 hover:text-cyan-300"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {tr(lang, 'Wróć do listy', 'Back to list')}
            </button>
            <div className="text-xs font-bold text-cyan-300">
              {editor.mode === 'create'
                ? scope === 'all'
                  ? tr(lang, 'Nowy blok — Cały tydzień', 'New Block — Whole Week')
                  : tr(lang, `Nowy blok — ${fullDayName(scope, lang)}`, `New Block — ${fullDayName(scope, lang)}`)
                : tr(lang, `Edycja: ${editor.editingBlock?.name}`, `Editing: ${editor.editingBlock?.name}`)}
            </div>
          </div>

          {/* When editing a multi-day block from a specific day tab, let user pick single-day vs all-days */}
          {editor.mode === 'edit' &&
            editor.editingBlock &&
            scope !== 'all' &&
            editor.editingBlock.daysOfWeek.length > 1 && (
              <div className="p-3 bg-[#070B14] border border-blue-950 rounded-xl space-y-2">
                <div className="text-xs font-medium text-blue-300">
                  {tr(lang, 'Zakres tej zmiany:', 'Apply this edit to:')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, editTargetScope: 'single-day' })}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-colors ${
                      editor.editTargetScope === 'single-day'
                        ? 'bg-cyan-400 text-black border-cyan-400'
                        : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                    }`}
                  >
                    {tr(lang, `Tylko ${fullDayName(scope, lang)}`, `Only ${fullDayName(scope, lang)}`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, editTargetScope: 'all-block-days' })}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-colors ${
                      editor.editTargetScope === 'all-block-days'
                        ? 'bg-cyan-400 text-black border-cyan-400'
                        : 'bg-black border-blue-950 text-blue-300 hover:border-blue-600'
                    }`}
                  >
                    {tr(
                      lang,
                      `Wszystkie dni bloku (${summarizeDays(editor.editingBlock.daysOfWeek, lang)})`,
                      `All block days (${summarizeDays(editor.editingBlock.daysOfWeek, lang)})`,
                    )}
                  </button>
                </div>
              </div>
            )}

          {/* Block Name */}
          <div>
            <label htmlFor="mgr-block-name" className="block text-xs font-medium text-blue-300 mb-1">
              {tr(lang, 'Nazwa bloku', 'Block name')}
            </label>
            <input
              id="mgr-block-name"
              type="text"
              required
              autoFocus
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder={tr(lang, 'np. Dojazd, Obiad, Trening, Sen...', 'e.g. Transit, Dinner, Practice, Sleep...')}
              className="w-full min-w-0 px-3 py-2 text-xs bg-[#070B14] text-blue-100 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Anchor Mode */}
          <div>
            <div className="text-xs font-medium text-blue-300 mb-1.5 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-cyan-300" />
              {tr(lang, 'Kiedy się odbywa?', 'When does it happen?')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'before-school-start', label: tr(lang, 'Przed szkołą', 'Before school') },
                  { id: 'after-school-end', label: tr(lang, 'Po lekcjach', 'After school') },
                  { id: 'before-study', label: tr(lang, 'Przed nauką / PD', 'Before study / HW') },
                  { id: 'after-study', label: tr(lang, 'Po nauce / PD', 'After study / HW') },
                  {
                    id: 'before-block',
                    label: tr(lang, 'Przed blokiem', 'Before block'),
                    disabled: editorAnchorTargets.length === 0,
                  },
                  {
                    id: 'after-block',
                    label: tr(lang, 'Po bloku', 'After block'),
                    disabled: editorAnchorTargets.length === 0,
                  },
                  { id: 'fixed', label: tr(lang, 'Stała godzina', 'Fixed time') },
                ] as Array<{ id: PersonalBlockAnchor; label: string; disabled?: boolean }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() =>
                    setEditor({
                      ...editor,
                      anchor: opt.id,
                      daysOfWeek:
                        scope === 'all' && editor.mode === 'create'
                          ? opt.id === 'fixed' || opt.id === 'before-study' || opt.id === 'after-study'
                            ? [...ALL_RULE_DAYS]
                            : [...SCHOOL_RULE_DAYS]
                          : editor.daysOfWeek,
                    })
                  }
                  className={`px-2.5 py-2 text-[11px] font-semibold rounded-lg border transition-colors text-center ${
                    editor.anchor === opt.id
                      ? 'bg-cyan-400 text-black border-cyan-400'
                      : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600 disabled:opacity-35 disabled:cursor-not-allowed'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Block Dropdown for Chained Anchor */}
          {(editor.anchor === 'before-block' || editor.anchor === 'after-block') &&
            editorAnchorTargets.length > 0 && (
              <div>
                <label htmlFor="mgr-anchor-target" className="block text-xs font-medium text-blue-300 mb-1">
                  {editor.anchor === 'before-block'
                    ? tr(lang, 'Bezpośrednio przed blokiem:', 'Right before block:')
                    : tr(lang, 'Bezpośrednio po bloku:', 'Right after block:')}
                </label>
                <select
                  id="mgr-anchor-target"
                  value={effectiveEditorAnchorTargetId}
                  onChange={(e) => setEditor({ ...editor, anchorBlockId: e.target.value })}
                  className="w-full min-w-0 px-3 py-2 text-xs bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
                >
                  {editorAnchorTargets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({describePersonalBlockAnchor(b, blocks, lang)})
                    </option>
                  ))}
                </select>
              </div>
            )}

          {/* Fixed Clock Inputs OR Relative Duration + Buffer */}
          {editor.anchor === 'fixed' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor="mgr-start-time" className="block text-xs font-medium text-blue-300 mb-1">
                    {tr(lang, 'Początek', 'Start time')}
                  </label>
                  <input
                    id="mgr-start-time"
                    type="time"
                    required
                    value={editor.startTime}
                    onChange={(e) => setEditor({ ...editor, startTime: e.target.value })}
                    className="w-full min-w-0 px-3 py-2 text-xs font-mono bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="min-w-0">
                  <label htmlFor="mgr-end-time" className="block text-xs font-medium text-blue-300 mb-1">
                    {tr(lang, 'Koniec', 'End time')}
                  </label>
                  <input
                    id="mgr-end-time"
                    type="time"
                    required
                    value={editor.endTime}
                    onChange={(e) => setEditor({ ...editor, endTime: e.target.value })}
                    className="w-full min-w-0 px-3 py-2 text-xs font-mono bg-[#070B14] text-blue-200 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
              <div className="text-[11px] font-mono text-blue-400">
                {tr(lang, 'Czas trwania:', 'Duration:')}{' '}
                <span className="text-cyan-300 font-semibold">
                  {formatDurationMinutes(
                    getPersonalBlockDurationMinutes(editor.startTime, editor.endTime),
                    lang,
                  )}
                </span>
                {hhmmToMinutes(editor.endTime) < hhmmToMinutes(editor.startTime) && (
                  <span className="text-blue-500 ml-1.5">
                    ({tr(lang, 'przez noc', 'overnight')})
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-blue-300">
                    {tr(lang, 'Ile to trwa?', 'Duration')}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={5}
                      max={360}
                      step={5}
                      value={editor.durationMinutes}
                      onChange={(e) =>
                        setEditor({
                          ...editor,
                          durationMinutes: Math.max(5, Math.min(360, Number(e.target.value) || 5)),
                        })
                      }
                      className="w-16 px-2 py-1 text-xs font-mono text-right bg-[#070B14] text-cyan-300 border border-blue-900 rounded-md focus:outline-none focus:border-cyan-400"
                    />
                    <span className="text-[11px] font-mono text-blue-500">min</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DURATION_PRESETS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEditor({ ...editor, durationMinutes: mins })}
                      className={`px-2.5 py-1.5 font-mono text-xs font-bold rounded-lg border transition-colors ${
                        editor.durationMinutes === mins
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-blue-300">
                  {tr(lang, 'Zapas czasu / przerwa', 'Buffer / gap')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GAP_PRESETS.map((gap) => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => setEditor({ ...editor, offsetMinutes: gap })}
                      className={`px-2.5 py-1 font-mono text-[11px] font-semibold rounded-lg border transition-colors ${
                        editor.offsetMinutes === gap
                          ? 'bg-blue-500/20 text-cyan-300 border-cyan-400'
                          : 'bg-[#070B14] border-blue-950 text-blue-400 hover:border-blue-700'
                      }`}
                    >
                      {gap === 0 ? tr(lang, 'Brak', 'None') : `+${gap}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Live Computed Time Preview */}
          <div className="p-3 bg-[#070B14] border border-cyan-950/90 rounded-xl space-y-1.5">
            <div className="text-[11px] font-semibold text-cyan-300">
              {tr(lang, 'Wyliczone godziny w planie:', 'Resolved schedule times:')}
            </div>
            {editorPreviewSlots.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {editorPreviewSlots.map((slot) => (
                  <span
                    key={slot.date}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono bg-black border border-blue-950 rounded text-blue-200 tabular-nums"
                  >
                    <span className="text-blue-400">{formatWeekdayShort(slot.date, lang)}</span>
                    <span className="text-cyan-300">
                      {slot.startTime}–{slot.endTime}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-blue-500">
                {tr(
                  lang,
                  'W wybrane dni brak lekcji do podpięcia — zmień tryb na „Stała godzina” lub wybierz dni z lekcjami.',
                  'No school classes on the selected day to anchor to — switch to “Fixed time” or pick school days.',
                )}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <div className="text-xs font-medium text-blue-300 mb-1.5">
              {tr(lang, 'Kategoria', 'Category')}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['transit', 'meal', 'sleep', 'hobby', 'custom'] as PersonalBlockCategory[]).map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEditor({ ...editor, category: cat })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                      editor.category === cat
                        ? 'bg-blue-500 text-black border-blue-500'
                        : 'bg-[#070B14] border-blue-950 text-blue-300 hover:border-blue-600'
                    }`}
                  >
                    <CategoryIcon category={cat} className="h-3 w-3" />
                    {personalBlockCategoryLabel(cat, lang)}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Days of Week (shown when in Whole Week mode OR editing all days of a block) */}
          {(scope === 'all' || editor.editTargetScope === 'all-block-days') && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-blue-300">
                  {tr(lang, 'Dni tygodnia', 'Days of week')}
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, daysOfWeek: [...SCHOOL_RULE_DAYS] })}
                    className="text-blue-400 hover:text-blue-200 underline"
                  >
                    {tr(lang, 'Pn–Pt', 'Mon–Fri')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, daysOfWeek: [...ALL_RULE_DAYS] })}
                    className="text-blue-400 hover:text-blue-200 underline"
                  >
                    {tr(lang, 'Codziennie', 'Every day')}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {ALL_RULE_DAYS.map((day) => {
                  const active = editor.daysOfWeek.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const exists = editor.daysOfWeek.includes(day);
                        const next = exists
                          ? editor.daysOfWeek.filter((d) => d !== day)
                          : ([...editor.daysOfWeek, day].sort((a, b) => a - b) as RuleDayOfWeek[]);
                        if (next.length > 0) setEditor({ ...editor, daysOfWeek: next });
                      }}
                      className={`py-1.5 text-[11px] font-semibold rounded border transition-colors text-center ${
                        active
                          ? 'bg-blue-500 text-black border-blue-500'
                          : 'bg-[#070B14] border-blue-950 text-blue-400 hover:border-blue-700'
                      }`}
                    >
                      {ruleWeekdayLabel(day, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Note */}
          <input
            type="text"
            value={editor.note}
            onChange={(e) => setEditor({ ...editor, note: e.target.value })}
            placeholder={tr(lang, 'Krótka notatka (opcjonalnie)', 'Short note (optional)')}
            className="w-full min-w-0 px-3 py-2 text-xs bg-[#070B14] text-blue-200 placeholder:text-blue-500/70 border border-blue-900 rounded-lg focus:outline-none focus:border-cyan-400"
          />

          {/* Clean Non-Overlapping Footer Actions */}
          <div className="pt-3 border-t border-blue-950 flex flex-wrap items-center justify-between gap-2">
            {editor.mode === 'edit' && editor.editingBlock ? (
              <button
                type="button"
                onClick={() => {
                  const target = editor.editingBlock!;
                  if (scope !== 'all' && editor.editTargetScope === 'single-day') {
                    handleRemoveFromSingleDay(target, scope);
                  } else {
                    handleDeleteEntireWeek(target);
                  }
                  setEditor(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/60 border border-rose-900/70 rounded-lg whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {scope !== 'all' && editor.editTargetScope === 'single-day'
                  ? tr(lang, `Usuń z: ${ruleWeekdayLabel(scope, lang)}`, `Remove from ${ruleWeekdayLabel(scope, lang)}`)
                  : tr(lang, 'Usuń z tygodnia', 'Delete from Week')}
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="px-3.5 py-2 text-xs font-semibold text-blue-300 hover:text-blue-100 bg-[#070B14] border border-blue-900 hover:border-blue-600 rounded-lg whitespace-nowrap"
              >
                {tr(lang, 'Anuluj', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={!editor.name.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 disabled:opacity-40 rounded-lg whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                {editor.mode === 'edit'
                  ? tr(lang, 'Zapisz zmiany', 'Save Changes')
                  : tr(lang, 'Dodaj blok', 'Add Block')}
              </button>
            </div>
          </div>
        </form>
      ) : (
        /* VIEW B: Clean Day or Whole Week List View */
        <div className="space-y-3.5">
          {/* Header Bar for Selected Day or Whole Week */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-blue-950">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-blue-100">
                {scope === 'all'
                  ? tr(lang, 'Cały tydzień — wszystkie bloki', 'Whole Week — All Blocks')
                  : fullDayName(scope, lang)}
              </h3>
              <p className="text-xs text-blue-400 mt-0.5">
                {scope === 'all'
                  ? tr(
                      lang,
                      'Dodawaj lub usuwaj bloki obowiązujące w całym tygodniu.',
                      'Add, edit, or remove blocks across the entire week.',
                    )
                  : selectedDaySchedule && selectedDaySchedule.activeLessons.length > 0
                    ? tr(
                        lang,
                        `Lekcje: ${selectedDaySchedule.activeLessons[0].startTime}–${selectedDaySchedule.dismissalTime ?? ''}`,
                        `School: ${selectedDaySchedule.activeLessons[0].startTime}–${selectedDaySchedule.dismissalTime ?? ''}`,
                      )
                    : tr(lang, 'Brak zaplanowanych lekcji w ten dzień', 'No school lessons scheduled on this day')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {duplicateCount > 0 && (
                <button
                  type="button"
                  onClick={handleRemoveDuplicates}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-300 bg-amber-950/35 hover:bg-amber-950/60 border border-amber-700/60 rounded-lg whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {tr(lang, `Usuń duplikaty (${duplicateCount})`, `Remove duplicates (${duplicateCount})`)}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditor(buildCreateEditor(scope))}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-black bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {scope === 'all'
                  ? tr(lang, 'Dodaj na cały tydzień', 'Add for Whole Week')
                  : tr(lang, `Dodaj na ${ruleWeekdayLabel(scope, lang)}`, `Add for ${ruleWeekdayLabel(scope, lang)}`)}
              </button>
            </div>
          </div>

          {/* Starter Example Chips (disappear once added; shown in Whole Week or when empty) */}
          {(scope === 'all' || blocks.length === 0) && availableExampleChips.length > 0 && (
            <div className="p-3.5 bg-black border border-blue-950 rounded-xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-blue-300">
                  {tr(
                    lang,
                    'Szybkie przykłady (znikają po dodaniu):',
                    'Quick starter blocks (disappear once added):',
                  )}
                </span>
                {canAutoBuildTypicalDay && (
                  <button
                    type="button"
                    onClick={handleApplyTypicalDay}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded-lg whitespace-nowrap"
                  >
                    <Sparkles className="h-3 w-3" />
                    {tr(lang, 'Typowy dzień ucznia (1 klik)', 'Typical Student Day (1 click)')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableExampleChips.map((chip) => (
                  <button
                    key={chip.kind}
                    type="button"
                    onClick={() => handleQuickChip(chip.kind)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-200 bg-[#070B14] border border-blue-900 hover:border-cyan-400 rounded-lg transition-colors"
                  >
                    <Plus className="h-3 w-3 text-cyan-300 shrink-0" />
                    <span>{chip.title}</span>
                    <span className="font-mono text-[11px] text-cyan-300/80">{chip.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Block Cards for Selected Day OR Whole Week */}
          {scope === 'all' ? (
            sortedAllBlocks.length === 0 ? (
              <div className="p-6 bg-black border border-dashed border-blue-950 rounded-xl text-center space-y-2">
                <Clock className="h-5 w-5 text-blue-500 mx-auto" />
                <div className="text-xs font-semibold text-blue-300">
                  {tr(lang, 'Brak prywatnych bloków w tygodniu', 'No personal blocks yet')}
                </div>
                <p className="text-xs text-blue-500 max-w-sm mx-auto">
                  {tr(
                    lang,
                    'Wybierz szybki przykład powyżej albo kliknij „Dodaj na cały tydzień”.',
                    'Tap a quick starter above or click “Add for Whole Week”.',
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedAllBlocks.map((block) => {
                  const isRelative = (block.anchor ?? 'fixed') !== 'fixed';
                  const anchorText = describePersonalBlockAnchor(block, blocks, lang);
                  const isHighlighted = highlightedIds.includes(block.id);

                  return (
                    <div
                      key={block.id}
                      className={`p-3.5 rounded-xl border transition-colors ${
                        isHighlighted
                          ? 'bg-emerald-950/20 border-emerald-500/70'
                          : 'bg-black border-blue-950'
                      } ${!block.enabled ? 'opacity-55' : ''}`}
                    >
                      {/* Row 1: Info */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="mt-0.5 p-1.5 rounded-lg bg-[#070B14] border border-blue-950 text-cyan-300 shrink-0">
                            <CategoryIcon category={block.category} className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-blue-100">
                                {block.name}
                              </span>
                              {isHighlighted && (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700/60 px-1.5 py-0.5 rounded">
                                  {tr(lang, 'Zapisano', 'Saved')}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-cyan-300 mt-0.5">{anchorText}</div>
                            {block.note && (
                              <div className="text-[11px] text-blue-400 mt-0.5">{block.note}</div>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-blue-300 bg-[#070B14] border border-blue-950 px-2 py-0.5 rounded shrink-0">
                          {summarizeDays(block.daysOfWeek, lang)}
                        </span>
                      </div>

                      {/* Row 2: Clean Dedicated Action Bar */}
                      <div className="pt-2.5 mt-2.5 border-t border-blue-950/80 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isRelative && (
                            <div className="inline-flex items-center bg-[#070B14] border border-blue-950 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => handleAdjustDuration(block.id, -5)}
                                aria-label={tr(lang, 'Skróć o 5 min', 'Shorten by 5 min')}
                                className="px-2 py-1 text-blue-400 hover:text-blue-100 hover:bg-blue-950/60"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="px-2 font-mono text-[11px] font-bold text-cyan-300 tabular-nums">
                                {Math.max(5, Math.round(block.durationMinutes ?? 30))}m
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustDuration(block.id, 5)}
                                aria-label={tr(lang, 'Wydłuż o 5 min', 'Extend by 5 min')}
                                className="px-2 py-1 text-blue-400 hover:text-blue-100 hover:bg-blue-950/60"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(block.id)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border ${
                              block.enabled
                                ? 'border-cyan-500/50 text-cyan-300'
                                : 'border-blue-900 text-blue-500'
                            }`}
                          >
                            {block.enabled ? tr(lang, 'Aktywny', 'On') : tr(lang, 'Wyłączony', 'Off')}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditor(buildEditEditor(block, 'all'))}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-200 hover:text-cyan-300 bg-[#070B14] border border-blue-900 hover:border-cyan-400 rounded-lg whitespace-nowrap"
                          >
                            <Pencil className="h-3 w-3" />
                            {tr(lang, 'Edytuj', 'Edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntireWeek(block)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/25 hover:bg-rose-950/50 border border-rose-900/60 rounded-lg whitespace-nowrap"
                          >
                            <Trash2 className="h-3 w-3" />
                            {tr(lang, 'Usuń z tygodnia', 'Remove from Week')}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : blocksForSelectedDay.length === 0 ? (
            <div className="p-6 bg-black border border-dashed border-blue-950 rounded-xl text-center space-y-2">
              <Clock className="h-5 w-5 text-blue-500 mx-auto" />
              <div className="text-xs font-semibold text-blue-300">
                {tr(
                  lang,
                  `Brak bloków w: ${fullDayName(scope, lang)}`,
                  `No personal blocks on ${fullDayName(scope, lang)}`,
                )}
              </div>
              <p className="text-xs text-blue-500 max-w-sm mx-auto">
                {tr(
                  lang,
                  `Kliknij „Dodaj na ${ruleWeekdayLabel(scope, lang)}”, aby dodać blok tylko na ten dzień, albo przejdź do 8. zakładki „Tydzień”.`,
                  `Click “Add for ${ruleWeekdayLabel(scope, lang)}” to add a block for this day, or switch to the 8th “All Week” tab.`,
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {blocksForSelectedDay.map(({ block, resolved }) => {
                const isRelative = (block.anchor ?? 'fixed') !== 'fixed';
                const anchorText = describePersonalBlockAnchor(block, blocks, lang);
                const isHighlighted = highlightedIds.includes(block.id);

                return (
                  <div
                    key={block.id}
                    className={`p-3.5 rounded-xl border transition-colors ${
                      isHighlighted
                        ? 'bg-emerald-950/20 border-emerald-500/70'
                        : 'bg-black border-blue-950'
                    } ${!block.enabled ? 'opacity-55' : ''}`}
                  >
                    {/* Row 1: Info + Exact Resolved Time for This Day */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-[#070B14] border border-blue-950 text-cyan-300 shrink-0">
                          <CategoryIcon category={block.category} className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-blue-100">
                              {block.name}
                            </span>
                            {isHighlighted && (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/70 border border-emerald-700/60 px-1.5 py-0.5 rounded">
                                {tr(lang, 'Zapisano', 'Saved')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-blue-400 mt-0.5">
                            {isRelative ? anchorText : personalBlockCategoryLabel(block.category, lang)}
                            {block.note ? ` · ${block.note}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="font-mono text-xs font-bold text-cyan-300 tabular-nums bg-[#070B14] border border-blue-950 px-2.5 py-1 rounded-lg shrink-0">
                        {resolved
                          ? `${resolved.startTime}–${resolved.endTime}`
                          : !block.enabled
                            ? tr(lang, 'Wył.', 'Off')
                            : tr(lang, 'Brak lekcji', 'No class')}
                      </div>
                    </div>

                    {/* Row 2: Clean Dedicated Action Bar */}
                    <div className="pt-2.5 mt-2.5 border-t border-blue-950/80 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isRelative && (
                          <div className="inline-flex items-center bg-[#070B14] border border-blue-950 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleAdjustDuration(block.id, -5)}
                              aria-label={tr(lang, 'Skróć o 5 min', 'Shorten by 5 min')}
                              className="px-2 py-1 text-blue-400 hover:text-blue-100 hover:bg-blue-950/60"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-2 font-mono text-[11px] font-bold text-cyan-300 tabular-nums">
                              {Math.max(5, Math.round(block.durationMinutes ?? 30))}m
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustDuration(block.id, 5)}
                              aria-label={tr(lang, 'Wydłuż o 5 min', 'Extend by 5 min')}
                              className="px-2 py-1 text-blue-400 hover:text-blue-100 hover:bg-blue-950/60"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        {!block.enabled && (
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(block.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-blue-900 text-blue-300 hover:border-cyan-400"
                          >
                            {tr(lang, 'Włącz', 'Turn On')}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditor(buildEditEditor(block, scope))}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-200 hover:text-cyan-300 bg-[#070B14] border border-blue-900 hover:border-cyan-400 rounded-lg whitespace-nowrap"
                        >
                          <Pencil className="h-3 w-3" />
                          {tr(lang, 'Edytuj', 'Edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromSingleDay(block, scope)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/25 hover:bg-rose-950/50 border border-rose-900/60 rounded-lg whitespace-nowrap"
                        >
                          <Trash2 className="h-3 w-3" />
                          {tr(lang, `Usuń z ${ruleWeekdayLabel(scope, lang)}`, `Remove from ${ruleWeekdayLabel(scope, lang)}`)}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
