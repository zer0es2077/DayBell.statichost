export type DayOfWeek = 1 | 2 | 3 | 4 | 5; // 1 = Monday ... 5 = Friday
export type RuleDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday ... 7 = Sunday

export interface LessonSlot {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: DayOfWeek;
  lessonNumber: number;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  subject: string;
  teacher: string;
  room: string;
  isCancelled?: boolean;
  isSubstitution?: boolean;
  note?: string;
}

export interface ExamSharedNote {
  id: string;
  text: string;
  author: string;
  updatedAt: string;
}

export interface SchoolTest {
  id: string;
  date: string; // YYYY-MM-DD
  subject: string;
  category: string; // e.g., "Sprawdzian", "Kartkówka", "Praca klasowa", "Quiz"
  title: string;
  description: string;
  teacher: string;
  source: 'librus-import' | 'ai-message' | 'manual';
  sourceMessageId?: string;
  sharedNotes?: ExamSharedNote[];
}

export interface SchoolMessage {
  id: string;
  kind: 'message' | 'announcement';
  title: string;
  author: string;
  date: string; // YYYY-MM-DD or YYYY-MM-DD HH:mm
  body: string;
  unread?: boolean;
  source: 'import' | 'manual';
}

export interface HomeworkItem {
  id: string;
  subject: string;
  dueDate: string; // YYYY-MM-DD
  title: string;
  notes?: string;
  neededSupplies: string[];
  completed: boolean;
  source: 'import' | 'ai-command' | 'manual';
}

export interface CommutePlace {
  id: string;
  name: string; // e.g. "Shopping Centre"
  daysOfWeek: DayOfWeek[]; // e.g. [1, 3, 4]
  when: 'after-school' | 'before-school';
  notes?: string;
}

export type RuleTriggerKind = 'always' | 'on-subject-day' | 'on-homework';
export type RuleEffectKind = 'add-task' | 'pack-item' | 'skip-pack-item' | 'notify-only';

export interface SmartRule {
  id: string;
  name: string;
  naturalText: string;
  enabled: boolean;
  triggerKind?: RuleTriggerKind; // 'always' | 'on-subject-day' | 'on-homework'
  effectKind?: RuleEffectKind; // 'add-task' | 'pack-item' | 'skip-pack-item' | 'notify-only'
  effectText?: string; // reminder / task text for add-task or notify-only
  effectItem?: string; // packing item label to add or skip for pack-item / skip-pack-item
  customTime?: string; // HH:MM when timing === 'custom'
  subjectMatch: string; // e.g. "Plastyka" or "*"
  requireHomework: boolean;
  requireSupplies: boolean;
  placeName: string; // e.g. "Shopping Centre" or empty
  activeDays?: RuleDayOfWeek[]; // 1 = Mon ... 7 = Sun (days this rule takes effect)
  timing: 'at-dismissal' | 'before-school' | 'evening' | 'custom';
  offsetMinutes: number; // 0 = right as school ends
  taskTemplate: string; // e.g. "Buy {supplies} for {subject} at {place}"
  notifyBrowser: boolean;
}

export type TaskLocationConstraint = 'at-school' | 'after-school' | 'at-home' | 'anywhere';

export interface OneOffTask {
  id: string;
  title: string;
  notes?: string;
  priority: 'urgent' | 'normal';
  location: TaskLocationConstraint;
  beforeSubject?: string; // e.g. "Wychowanie fizyczne"
  deadlineDate: string; // YYYY-MM-DD (must be completed before or on this day)
  targetDate: string; // YYYY-MM-DD (best valid day to do it)
  triggerTime?: string; // HH:MM
  completed: boolean;
  naturalSource?: string;
}

export type ExemptionKind =
  | 'skip-subject'
  | 'skip-item'
  | 'add-item'
  | 'early-dismissal';

export interface ScheduleExemption {
  id: string;
  date: string; // YYYY-MM-DD
  kind: ExemptionKind;
  subject?: string;
  itemLabel?: string;
  customDismissalTime?: string; // HH:MM
  reason: string;
}

export interface DerivedSmartTask {
  id: string;
  ruleId: string;
  ruleName: string;
  homeworkId: string;
  subject: string;
  supplies: string[];
  placeName: string;
  targetDate: string; // YYYY-MM-DD (commute day before homework due date)
  dismissalTime: string; // HH:MM (last active class end time on targetDate)
  triggerTime: string; // HH:MM (dismissalTime + offsetMinutes or customTime)
  timing?: SmartRule['timing'];
  effectKind?: RuleEffectKind;
  title: string;
  reason: string;
  notifyBrowser: boolean;
  completed: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  targetDate: string; // YYYY-MM-DD
  triggerTime: string; // HH:MM
  kind: 'dismissal-errand' | 'urgent-task' | 'test-advance' | 'packing';
  relatedId: string;
  fired: boolean;
  read: boolean;
  dismissed: boolean;
}

export interface ExtractedPackingItem {
  id: string;
  item: string;
  targetDate: string; // YYYY-MM-DD
  subject?: string;
  reason: string;
  sourceMessageId: string;
  sourceTitle: string;
}

export interface MessageSummary {
  messageId: string;
  summary: string;
  keyPoints: string[];
  urgency: 'urgent' | 'action' | 'info';
  actionRequired?: string;
  deadlineDate?: string;
}

export interface DigestAnalysis {
  generatedAt: string;
  executiveBrief: string[];
  messageSummaries: Record<string, MessageSummary>;
  extractedPackingItems: ExtractedPackingItem[];
  extractedTests: SchoolTest[];
}

export interface StudyPlanStep {
  dayLabel: string;
  targetDate: string;
  focus: string;
  tasks: string[];
  estimatedMinutes: number;
}

export interface StudyPlan {
  testId: string;
  generatedAt: string;
  overview: string;
  steps: StudyPlanStep[];
}

export interface LibrusWorkspaceData {
  studentName: string;
  schoolClass: string;
  accountMode: 'local' | 'sample';
  lastUpdatedAt: string | null;
  weekStart: string; // YYYY-MM-DD (Monday)
  timetable: LessonSlot[];
  tests: SchoolTest[];
  messages: SchoolMessage[];
  homework: HomeworkItem[];
  commutePlaces: CommutePlace[];
  smartRules: SmartRule[];
  oneOffTasks: OneOffTask[];
  exemptions: ScheduleExemption[];
}

export interface SubjectKit {
  subject: string;
  items: string[];
}

export interface CustomPackingItem {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  note?: string;
}

export type ParsedCommandIntent =
  | {
      intent: 'smart-rule';
      explanation: string;
      rule: Omit<SmartRule, 'id'>;
    }
  | {
      intent: 'one-off-task';
      explanation: string;
      task: Omit<OneOffTask, 'id' | 'completed'>;
    }
  | {
      intent: 'homework';
      explanation: string;
      homework: Omit<HomeworkItem, 'id' | 'completed' | 'source'>;
    }
  | {
      intent: 'exemption';
      explanation: string;
      exemption: Omit<ScheduleExemption, 'id'>;
    }
  | {
      intent: 'commute-place';
      explanation: string;
      place: Omit<CommutePlace, 'id'>;
    }
  | {
      intent: 'test';
      explanation: string;
      test: Omit<SchoolTest, 'id' | 'source'>;
    };

export interface ImportBatchResult {
  summary: string;
  lessons: LessonSlot[];
  homework: HomeworkItem[];
  tests: SchoolTest[];
  messages: SchoolMessage[];
}

export type PackingStepKind =
  | 'subjects'
  | 'homework-supplies'
  | 'message-extras'
  | 'test-prep'
  | 'essentials'
  | 'custom';

export interface PackingStepConfig {
  id: string;
  kind: PackingStepKind;
  label: string;
  enabled: boolean;
  note?: string;
}

export type PackingScheduleMode = 'morning' | 'evening' | 'both';
export type FeedViewMode = 'focus' | 'plan';
export type AppLanguage = 'pl' | 'en';

export type PersonalBlockCategory = 'meal' | 'transit' | 'sleep' | 'hobby' | 'custom';

export type PersonalBlockAnchor =
  | 'fixed'
  | 'before-school-start'
  | 'after-school-end'
  | 'before-study'
  | 'after-study'
  | 'before-block'
  | 'after-block';

export type StudyStartAnchor = 'fixed' | 'after-school-end' | 'after-block';

export interface PersonalTimeBlock {
  id: string;
  name: string; // Custom name (e.g., "Obiad / Dinner", "Dojazd / Transit", "Sen / Sleep")
  category: PersonalBlockCategory;
  anchor?: PersonalBlockAnchor; // Defaults to 'fixed' when omitted
  anchorBlockId?: string; // Target PersonalTimeBlock.id when anchor is 'before-block' | 'after-block'
  durationMinutes?: number; // Duration in minutes for relative blocks (e.g., 40 min)
  offsetMinutes?: number; // Optional gap in minutes between anchor and this block (default 0)
  startTime: string; // HH:MM (used for 'fixed' or fallback)
  endTime: string; // HH:MM (supports overnight like 22:30 -> 07:00)
  daysOfWeek: RuleDayOfWeek[]; // 1 = Mon ... 7 = Sun
  enabled: boolean;
  note?: string;
}

export interface UserSettings {
  language: AppLanguage; // UI language ('pl' default for Polish students, 'en' English)
  showStudyBlocks?: boolean; // Enable/disable daily test-prep learning blocks in feed (default true)
  majorTestLeadDays: number; // Sprawdzian / Praca klasowa advance study days (default 5)
  quizLeadDays: number; // Kartkówka / Quiz advance study days (default 3)
  dailyStudyMinutes: number; // Preferred minutes per study session (default 35)
  studyStartTime: string; // HH:MM (default "17:00" — also fallback when anchored block/school isn't active)
  studyStartAnchor?: StudyStartAnchor; // 'fixed' | 'after-school-end' | 'after-block'
  studyStartBlockId?: string; // PersonalTimeBlock.id when studyStartAnchor === 'after-block'
  studyStartOffsetMinutes?: number; // Optional rest/buffer minutes after the anchor block/event
  packReminderTime: string; // HH:MM (default "20:00")
  autoAdvanceOnCheck: boolean; // Auto-scroll to next Shorts card after checking
  showLessonsInFeed: boolean; // Include routine class periods in Shorts feed
  feedViewMode?: FeedViewMode; // 'focus' (1-at-a-time) or 'plan' (laid-out full day plan)
  packingSchedule: PackingScheduleMode; // When packing steps appear in the feed
  showUnpacking?: boolean; // Show daily unpacking steps to remove unnecessary items from bag
  packingSteps: PackingStepConfig[]; // Student's ordered step-by-step packing routine
  dailyEssentials?: string[]; // Student's editable list of items packed every school day
  personalTimeBlocks?: PersonalTimeBlock[]; // Strictly private carved-out daily time blocks (never shared with class)
  freeTimeMinutes?: number; // Desired free time placed automatically between homework and test prep (default 30)
}

export interface SharedClassLink {
  fileId: string;
  className: string;
  shareRole: 'writer' | 'reader';
  webViewLink?: string;
  lastSyncedAt?: string;
  lastUpdatedBy?: string;
}

export interface SharedClassPayload {
  schemaVersion: 1;
  kind: 'daybell-shared-class';
  className: string;
  weekStart: string;
  timetable: LessonSlot[];
  homework: Array<Omit<HomeworkItem, 'completed'>>;
  tests: SchoolTest[];
  updatedAt: string;
  updatedBy: string;
}

export interface PersonalSyncPayload {
  schemaVersion: 1;
  kind: 'daybell-personal-sync';
  updatedAt: string;
  settings: UserSettings;
  subjectKits: SubjectKit[];
  checkedIds: Record<string, boolean>;
  completedSmartIds: Record<string, boolean>;
  completedStudyIds: Record<string, boolean>;
  completedHomeworkIds: Record<string, boolean>;
  studyPlans: Record<string, StudyPlan>;
  workspace: LibrusWorkspaceData | null;
  classLink: SharedClassLink | null;
}

