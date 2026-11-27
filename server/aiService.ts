import { GoogleGenAI, Type } from '@google/genai';
import type {
  CommutePlace,
  DayOfWeek,
  DigestAnalysis,
  ExemptionKind,
  HomeworkItem,
  ImportBatchResult,
  LessonSlot,
  ParsedCommandIntent,
  SchoolMessage,
  SchoolTest,
  StudyPlan,
  TaskLocationConstraint,
} from '../src/types.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MODEL_NAME = 'gemini-4-hydrogen';

function sanitizeDayOfWeek(n: number): DayOfWeek {
  if (n >= 1 && n <= 5) return n as DayOfWeek;
  return 1;
}

export async function analyzeMessagesAndPacking(params: {
  messages: SchoolMessage[];
  timetable: LessonSlot[];
  existingTests: SchoolTest[];
  today: string;
}): Promise<DigestAnalysis> {
  const ai = getGeminiClient();

  const compactTimetable = params.timetable
    .filter((l) => !l.isCancelled)
    .map((l) => `${l.date} (L${l.lessonNumber} ${l.startTime}-${l.endTime}): ${l.subject}`)
    .join('\n');

  const compactTests = params.existingTests
    .map((t) => `${t.date} | ${t.subject} | ${t.category}: ${t.title}`)
    .join('\n');

  const compactMessages = params.messages
    .map(
      (m) =>
        `ID: ${m.id}\nType: ${m.kind}\nDate: ${m.date}\nAuthor: ${m.author}\nTitle: ${m.title}\nBody: ${m.body}`,
    )
    .join('\n---\n');

  const prompt = `Today's date is ${params.today}.
You are analyzing a student's Librus school messages, announcements, timetable, and calendar tests.

Timetable for this week:
${compactTimetable || '(No classes loaded)'}

Already scheduled calendar tests:
${compactTests || '(No tests scheduled)'}

Messages and Announcements to summarize and inspect:
${compactMessages}

Tasks:
1. Create an "executiveBrief" of 3 to 5 short, direct bullet points highlighting only what the student must know or act on (deadlines, things to bring, schedule changes, tests).
2. For EVERY message/announcement ID above, return a crisp summary in English (preserving Polish book titles or specific school terms in quotes if relevant), 1-3 concrete key points, urgency ("urgent", "action", or "info"), optional actionRequired, and optional deadlineDate (YYYY-MM-DD).
3. Extract ANY physical item, book, supply, signed slip, money, PE clothing, calculator, compass, or special gear the student needs to PACK for a specific day into "extractedPackingItems". Resolve relative day mentions (e.g. "Friday", "tomorrow", "next Biology lesson") to an exact YYYY-MM-DD date using today's date (${params.today}) and the timetable above.
4. Extract ANY upcoming test, quiz (kartkówka), exam (sprawdzian), or oral assessment mentioned in messages/announcements that is NOT already listed in "Already scheduled calendar tests" into "extractedTests".`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a concise, accurate academic assistant for a student organizing Librus school notices. Respond strictly in valid JSON matching the schema. Never invent dates or items that are not supported by the input.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveBrief: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          messageSummaries: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                messageId: { type: Type.STRING },
                summary: { type: Type.STRING },
                keyPoints: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                urgency: { type: Type.STRING },
                actionRequired: { type: Type.STRING },
                deadlineDate: { type: Type.STRING },
              },
              required: ['messageId', 'summary', 'keyPoints', 'urgency'],
            },
          },
          extractedPackingItems: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                item: { type: Type.STRING },
                targetDate: { type: Type.STRING },
                subject: { type: Type.STRING },
                reason: { type: Type.STRING },
                sourceMessageId: { type: Type.STRING },
                sourceTitle: { type: Type.STRING },
              },
              required: ['item', 'targetDate', 'reason', 'sourceMessageId', 'sourceTitle'],
            },
          },
          extractedTests: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                subject: { type: Type.STRING },
                category: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                teacher: { type: Type.STRING },
                sourceMessageId: { type: Type.STRING },
              },
              required: ['date', 'subject', 'category', 'title', 'description'],
            },
          },
        },
        required: ['executiveBrief', 'messageSummaries', 'extractedPackingItems', 'extractedTests'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    executiveBrief?: string[];
    messageSummaries?: Array<{
      messageId: string;
      summary: string;
      keyPoints: string[];
      urgency: string;
      actionRequired?: string;
      deadlineDate?: string;
    }>;
    extractedPackingItems?: Array<{
      item: string;
      targetDate: string;
      subject?: string;
      reason: string;
      sourceMessageId: string;
      sourceTitle: string;
    }>;
    extractedTests?: Array<{
      date: string;
      subject: string;
      category: string;
      title: string;
      description: string;
      teacher?: string;
      sourceMessageId?: string;
    }>;
  };

  const summaryMap: DigestAnalysis['messageSummaries'] = {};
  for (const item of parsed.messageSummaries ?? []) {
    const normalizedUrgency =
      item.urgency === 'urgent' || item.urgency === 'action' ? item.urgency : 'info';
    summaryMap[item.messageId] = {
      messageId: item.messageId,
      summary: item.summary,
      keyPoints: item.keyPoints ?? [],
      urgency: normalizedUrgency,
      actionRequired: item.actionRequired || undefined,
      deadlineDate: item.deadlineDate || undefined,
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    executiveBrief: parsed.executiveBrief ?? [],
    messageSummaries: summaryMap,
    extractedPackingItems: (parsed.extractedPackingItems ?? []).map((p, idx) => ({
      id: `ai-pack-${idx}-${p.sourceMessageId}`,
      item: p.item,
      targetDate: p.targetDate,
      subject: p.subject || undefined,
      reason: p.reason,
      sourceMessageId: p.sourceMessageId,
      sourceTitle: p.sourceTitle,
    })),
    extractedTests: (parsed.extractedTests ?? []).map((t, idx) => ({
      id: `ai-test-${idx}-${t.date}`,
      date: t.date,
      subject: t.subject,
      category: t.category || 'Quiz',
      title: t.title,
      description: t.description,
      teacher: t.teacher || 'Teacher',
      source: 'ai-message' as const,
      sourceMessageId: t.sourceMessageId,
    })),
  };
}

export async function generateStudyPlan(params: {
  test: SchoolTest;
  today: string;
  leadDays?: number;
  dailyStudyMinutes?: number;
}): Promise<StudyPlan> {
  const ai = getGeminiClient();
  const daysCount = Math.max(1, Math.min(10, params.leadDays ?? 3));
  const learningDays = Math.max(1, Math.floor(daysCount / 2));
  const repeatingDays = Math.max(0, daysCount - learningDays);
  const targetMins = Math.max(15, Math.min(120, params.dailyStudyMinutes ?? 35));

  const prompt = `Today is ${params.today}.
Create a focused ${daysCount}-day advance study plan for this upcoming school test:
Subject: ${params.test.subject}
Type: ${params.test.category}
Test Date: ${params.test.date}
Title: ${params.test.title}
Scope/Notes: ${params.test.description}

CRITICAL PHASE RULE:
- Schedule exactly ${daysCount} consecutive daily study sessions ending on the day BEFORE the test (${params.test.date}), with exact YYYY-MM-DD "targetDate" values.
- Days 1 to ${learningDays} (${learningDays} ${learningDays === 1 ? 'day' : 'days'}): LEARN phase — learning new material, reading notes/textbook, understanding core concepts & worked examples.
${repeatingDays > 0 ? `- Days ${learningDays + 1} to ${daysCount} (${repeatingDays} ${repeatingDays === 1 ? 'day' : 'days'}): REPEAT phase — actively repeating what was learned from memory, doing practice questions, flashcards, and fixing weak spots.` : '- Focus this single day on learning the core scope and quick self-check.'}
- Target roughly ${targetMins} minutes per session with 2-3 very short, concrete bullet tasks per day (max 10 words each).`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a practical academic coach. Output crisp, actionable study steps strictly matching the JSON schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overview: { type: Type.STRING },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayLabel: { type: Type.STRING },
                targetDate: { type: Type.STRING },
                focus: { type: Type.STRING },
                tasks: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                estimatedMinutes: { type: Type.INTEGER },
              },
              required: ['dayLabel', 'targetDate', 'focus', 'tasks', 'estimatedMinutes'],
            },
          },
        },
        required: ['overview', 'steps'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    overview?: string;
    steps?: StudyPlan['steps'];
  };

  return {
    testId: params.test.id,
    generatedAt: new Date().toISOString(),
    overview: parsed.overview || 'Structured advance revision plan.',
    steps: parsed.steps ?? [],
  };
}

export async function parseNaturalCommand(params: {
  text: string;
  today: string;
  timetable: LessonSlot[];
  commutePlaces: CommutePlace[];
}): Promise<ParsedCommandIntent> {
  const ai = getGeminiClient();

  const scheduleSummary = params.timetable
    .filter((l) => !l.isCancelled)
    .map((l) => `Day ${l.dayOfWeek} (${l.date}) L${l.lessonNumber} ${l.startTime}-${l.endTime}: ${l.subject}`)
    .join('\n');

  const placesSummary = params.commutePlaces
    .map((p) => `${p.name} on days [${p.daysOfWeek.join(', ')}] (${p.when})`)
    .join('\n');

  const prompt = `Today is ${params.today}.
Weekly timetable:
${scheduleSummary || '(No lessons added yet)'}

Known commute places passed by the student:
${placesSummary || '(None configured yet)'}

The student typed this natural-language command:
"${params.text}"

Classify the command into EXACTLY ONE intent:
1. "smart-rule" — recurring conditional automation (e.g., "If there is a plastyka lesson with supply homework, notify me right after school on a shopping centre day and add a task").
2. "one-off-task" — a single urgent or unique task with time/location/subject constraints (e.g., "I LOST MY PE BAG, I have to find it at school before the day with PE"). Compute exact targetDate (a school day before the subject's next occurrence, or today if PE is tomorrow/soon) and deadlineDate (YYYY-MM-DD), location ("at-school" | "after-school" | "at-home" | "anywhere"), priority ("urgent" | "normal"), optional beforeSubject (match subject name from timetable like "Wychowanie fizyczne" for PE!), and optional triggerTime (HH:MM, e.g. "09:45" for morning school break).
3. "homework" — homework assignment with optional neededSupplies list (e.g., "Plastyka homework for Friday: bring watercolor paper and flat brush").
4. "exemption" — one-day schedule or packing exception (e.g., "No PE tomorrow, doctor's note" -> kind="skip-subject", or "School ends early at 11:35 on Thursday" -> kind="early-dismissal", or "Don't pack math textbook tomorrow" -> kind="skip-item", or "Bring gym lock tomorrow" -> kind="add-item").
5. "commute-place" — defining which weekdays the student passes a place (e.g., "I walk past the shopping centre on Mondays, Wednesdays, and Thursdays after school").

Return valid JSON matching the schema and populate ONLY the sub-object matching "intent" (plus "explanation", a crisp 1-sentence confirmation).`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction:
        'You are a smart student calendar parser. Map Polish or English natural language accurately to structured calendar rules, constrained tasks, homework, exemptions, or commute routes. Always use exact YYYY-MM-DD dates and HH:MM 24-hour times.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          intent: { type: Type.STRING },
          explanation: { type: Type.STRING },
          rule: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              subjectMatch: { type: Type.STRING },
              requireHomework: { type: Type.BOOLEAN },
              requireSupplies: { type: Type.BOOLEAN },
              placeName: { type: Type.STRING },
              activeDays: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              timing: { type: Type.STRING },
              offsetMinutes: { type: Type.INTEGER },
              taskTemplate: { type: Type.STRING },
              notifyBrowser: { type: Type.BOOLEAN },
            },
          },
          task: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              notes: { type: Type.STRING },
              priority: { type: Type.STRING },
              location: { type: Type.STRING },
              beforeSubject: { type: Type.STRING },
              deadlineDate: { type: Type.STRING },
              targetDate: { type: Type.STRING },
              triggerTime: { type: Type.STRING },
            },
          },
          homework: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              dueDate: { type: Type.STRING },
              title: { type: Type.STRING },
              notes: { type: Type.STRING },
              neededSupplies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
          exemption: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.STRING },
              kind: { type: Type.STRING },
              subject: { type: Type.STRING },
              itemLabel: { type: Type.STRING },
              customDismissalTime: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
          },
          place: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              daysOfWeek: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              when: { type: Type.STRING },
              notes: { type: Type.STRING },
            },
          },
        },
        required: ['intent', 'explanation'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    intent?: string;
    explanation?: string;
    rule?: {
      name?: string;
      subjectMatch?: string;
      requireHomework?: boolean;
      requireSupplies?: boolean;
      placeName?: string;
      activeDays?: number[];
      timing?: string;
      offsetMinutes?: number;
      taskTemplate?: string;
      notifyBrowser?: boolean;
    };
    task?: {
      title?: string;
      notes?: string;
      priority?: string;
      location?: string;
      beforeSubject?: string;
      deadlineDate?: string;
      targetDate?: string;
      triggerTime?: string;
    };
    homework?: {
      subject?: string;
      dueDate?: string;
      title?: string;
      notes?: string;
      neededSupplies?: string[];
    };
    exemption?: {
      date?: string;
      kind?: string;
      subject?: string;
      itemLabel?: string;
      customDismissalTime?: string;
      reason?: string;
    };
    place?: {
      name?: string;
      daysOfWeek?: number[];
      when?: string;
      notes?: string;
    };
  };

  const explanation = parsed.explanation || 'Parsed from your note.';

  if (parsed.intent === 'smart-rule' && parsed.rule) {
    const timing =
      parsed.rule.timing === 'before-school' || parsed.rule.timing === 'evening'
        ? parsed.rule.timing
        : 'at-dismissal';
    const parsedActiveDays = Array.isArray(parsed.rule.activeDays)
      ? Array.from(
          new Set(
            parsed.rule.activeDays
              .map((d) => Number(d))
              .filter((d): d is 1 | 2 | 3 | 4 | 5 | 6 | 7 => Number.isInteger(d) && d >= 1 && d <= 7),
          ),
        ).sort((a, b) => a - b)
      : undefined;
    return {
      intent: 'smart-rule',
      explanation,
      rule: {
        name: parsed.rule.name || `${parsed.rule.subjectMatch || 'Subject'} rule`,
        naturalText: params.text,
        enabled: true,
        subjectMatch: parsed.rule.subjectMatch || '*',
        requireHomework: parsed.rule.requireHomework ?? true,
        requireSupplies: parsed.rule.requireSupplies ?? false,
        placeName: parsed.rule.placeName || '',
        activeDays: parsedActiveDays && parsedActiveDays.length > 0 ? parsedActiveDays : undefined,
        timing,
        offsetMinutes: typeof parsed.rule.offsetMinutes === 'number' ? parsed.rule.offsetMinutes : 0,
        taskTemplate:
          parsed.rule.taskTemplate ||
          (parsed.rule.placeName
            ? 'Buy {supplies} for {subject} at {place}'
            : '{subject}: {supplies}'),
        notifyBrowser: parsed.rule.notifyBrowser ?? true,
      },
    };
  }

  if (parsed.intent === 'homework' && parsed.homework) {
    return {
      intent: 'homework',
      explanation,
      homework: {
        subject: parsed.homework.subject || 'General',
        dueDate: parsed.homework.dueDate || params.today,
        title: parsed.homework.title || params.text,
        notes: parsed.homework.notes || undefined,
        neededSupplies: (parsed.homework.neededSupplies ?? []).filter(Boolean),
      },
    };
  }

  if (parsed.intent === 'exemption' && parsed.exemption) {
    const validKinds: ExemptionKind[] = [
      'skip-subject',
      'skip-item',
      'add-item',
      'early-dismissal',
    ];
    const kind = validKinds.includes(parsed.exemption.kind as ExemptionKind)
      ? (parsed.exemption.kind as ExemptionKind)
      : 'skip-subject';
    return {
      intent: 'exemption',
      explanation,
      exemption: {
        date: parsed.exemption.date || params.today,
        kind,
        subject: parsed.exemption.subject || undefined,
        itemLabel: parsed.exemption.itemLabel || undefined,
        customDismissalTime: parsed.exemption.customDismissalTime || undefined,
        reason: parsed.exemption.reason || params.text,
      },
    };
  }

  if (parsed.intent === 'commute-place' && parsed.place) {
    const days = Array.from(
      new Set((parsed.place.daysOfWeek ?? [1, 3]).map(sanitizeDayOfWeek)),
    ).sort();
    return {
      intent: 'commute-place',
      explanation,
      place: {
        name: parsed.place.name || 'Shopping Centre',
        daysOfWeek: days.length > 0 ? days : [1, 3],
        when: parsed.place.when === 'before-school' ? 'before-school' : 'after-school',
        notes: parsed.place.notes || undefined,
      },
    };
  }

  // Default fallback: one-off-task (covers urgent unique tasks like lost PE bag)
  const validLocations: TaskLocationConstraint[] = [
    'at-school',
    'after-school',
    'at-home',
    'anywhere',
  ];
  const loc = validLocations.includes(parsed.task?.location as TaskLocationConstraint)
    ? (parsed.task?.location as TaskLocationConstraint)
    : 'at-school';

  return {
    intent: 'one-off-task',
    explanation,
    task: {
      title: parsed.task?.title || params.text,
      notes: parsed.task?.notes || undefined,
      priority: parsed.task?.priority === 'normal' ? 'normal' : 'urgent',
      location: loc,
      beforeSubject: parsed.task?.beforeSubject || undefined,
      deadlineDate: parsed.task?.deadlineDate || params.today,
      targetDate: parsed.task?.targetDate || params.today,
      triggerTime: parsed.task?.triggerTime || '09:45',
      naturalSource: params.text,
    },
  };
}

export async function parsePastedLibrusContent(params: {
  rawText: string;
  today: string;
  weekStart: string;
}): Promise<ImportBatchResult> {
  const ai = getGeminiClient();

  const prompt = `Today is ${params.today}. Current school week Monday is ${params.weekStart}.
The student pasted raw text copied from Librus (could be messages, school announcements, homework assignments, calendar tests, or timetable rows in Polish or English).
Extract all distinct messages/announcements, tests/quizzes, homework (including any supplies needed!), and timetable lessons with exact YYYY-MM-DD dates and HH:MM times.

Raw text:
${params.rawText}`;

  return runStructuredImport(ai, prompt, params.today, params.weekStart);
}

export async function importFromScreenshot(params: {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  hint?: string;
  today: string;
  weekStart: string;
}): Promise<ImportBatchResult> {
  const ai = getGeminiClient();

  const prompt = `Today is ${params.today}. Current school week Monday is ${params.weekStart}.
This image is a screenshot from Librus Synergia (timetable / plan lekcji, calendar / terminarz, homework / zadania domowe, or messages / ogłoszenia).
${params.hint ? `User hint: ${params.hint}\n` : ''}
Carefully read EVERY visible cell/row in the screenshot and extract:
- "lessons": EVERY visible timetable class slot across ALL columns/days shown (dayOfWeek MUST be integer 1=Poniedziałek/Mon, 2=Wtorek/Tue, 3=Środa/Wed, 4=Czwartek/Thu, 5=Piątek/Fri; date aligned to weekStart ${params.weekStart}; lessonNumber 1..10; startTime HH:MM; endTime HH:MM; subject name in Polish as shown; room; teacher; isCancelled; isSubstitution). Do NOT skip any visible class slot!
- "homework": any visible homework assignments with subject, dueDate (YYYY-MM-DD), title, notes, and neededSupplies (any art supplies, books, materials mentioned).
- "tests": any visible sprawdzian, kartkówka, praca klasowa, test, or quiz with date, subject, category, title, description, teacher.
- "messages": any visible messages or announcements with kind ("message" | "announcement"), title, author, date, body.
- "summary": a brief 1-sentence summary of what was extracted from the screenshot.

Only include items clearly visible in the screenshot.`;

  return runStructuredImport(ai, prompt, params.today, params.weekStart, {
    mimeType: params.mimeType,
    data: params.imageBase64,
  });
}

async function runStructuredImport(
  ai: GoogleGenAI,
  prompt: string,
  today: string,
  weekStart: string,
  imageInline?: { mimeType: string; data: string },
): Promise<ImportBatchResult> {
  const contents = imageInline
    ? {
        parts: [
          { inlineData: { mimeType: imageInline.mimeType, data: imageInline.data } },
          { text: prompt },
        ],
      }
    : prompt;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents,
    config: {
      systemInstruction:
        'Extract structured Librus timetable lessons, homework with supplies, tests, and messages faithfully. Return valid JSON matching the schema.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          lessons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayOfWeek: { type: Type.INTEGER },
                date: { type: Type.STRING },
                lessonNumber: { type: Type.INTEGER },
                startTime: { type: Type.STRING },
                endTime: { type: Type.STRING },
                subject: { type: Type.STRING },
                teacher: { type: Type.STRING },
                room: { type: Type.STRING },
                isCancelled: { type: Type.BOOLEAN },
                isSubstitution: { type: Type.BOOLEAN },
                note: { type: Type.STRING },
              },
              required: ['dayOfWeek', 'subject'],
            },
          },
          homework: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                dueDate: { type: Type.STRING },
                title: { type: Type.STRING },
                notes: { type: Type.STRING },
                neededSupplies: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['subject', 'title'],
            },
          },
          tests: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                subject: { type: Type.STRING },
                category: { type: Type.STRING },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                teacher: { type: Type.STRING },
              },
              required: ['date', 'subject', 'title'],
            },
          },
          messages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                kind: { type: Type.STRING },
                title: { type: Type.STRING },
                author: { type: Type.STRING },
                date: { type: Type.STRING },
                body: { type: Type.STRING },
              },
              required: ['kind', 'title', 'body'],
            },
          },
        },
        required: ['summary', 'lessons', 'homework', 'tests', 'messages'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    summary?: string;
    lessons?: Array<{
      dayOfWeek: number;
      date?: string;
      lessonNumber?: number;
      startTime?: string;
      endTime?: string;
      subject: string;
      teacher?: string;
      room?: string;
      isCancelled?: boolean;
      isSubstitution?: boolean;
      note?: string;
    }>;
    homework?: Array<{
      subject: string;
      dueDate?: string;
      title: string;
      notes?: string;
      neededSupplies?: string[];
    }>;
    tests?: Array<{
      date: string;
      subject: string;
      category?: string;
      title: string;
      description?: string;
      teacher?: string;
    }>;
    messages?: Array<{
      kind: string;
      title: string;
      author?: string;
      date?: string;
      body: string;
    }>;
  };

  const stamp = Date.now();
  const baseMonday = new Date(`${weekStart}T00:00:00`);

  const lessons: LessonSlot[] = (parsed.lessons ?? []).map((l, i) => {
    const dow = sanitizeDayOfWeek(l.dayOfWeek);
    let resolvedDate = l.date;
    if (!resolvedDate || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedDate)) {
      const d = new Date(baseMonday.getTime());
      d.setDate(d.getDate() + (dow - 1));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      resolvedDate = `${y}-${m}-${day}`;
    }
    const num = l.lessonNumber && l.lessonNumber > 0 ? l.lessonNumber : i + 1;
    return {
      id: `imp-ls-${stamp}-${i}`,
      date: resolvedDate,
      dayOfWeek: dow,
      lessonNumber: num,
      startTime: l.startTime || `${String(7 + num).padStart(2, '0')}:00`,
      endTime: l.endTime || `${String(7 + num).padStart(2, '0')}:45`,
      subject: l.subject,
      teacher: l.teacher || 'Teacher',
      room: l.room || 'TBA',
      isCancelled: Boolean(l.isCancelled),
      isSubstitution: Boolean(l.isSubstitution),
      note: l.note || undefined,
    };
  });

  const homework: HomeworkItem[] = (parsed.homework ?? []).map((h, i) => ({
    id: `imp-hw-${stamp}-${i}`,
    subject: h.subject,
    dueDate: h.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(h.dueDate) ? h.dueDate : today,
    title: h.title,
    notes: h.notes || undefined,
    neededSupplies: (h.neededSupplies ?? []).filter(Boolean),
    completed: false,
    source: 'import',
  }));

  const tests: SchoolTest[] = (parsed.tests ?? []).map((t, i) => ({
    id: `imp-test-${stamp}-${i}`,
    date: t.date,
    subject: t.subject,
    category: t.category || 'Sprawdzian',
    title: t.title,
    description: t.description || t.title,
    teacher: t.teacher || '',
    source: 'librus-import',
  }));

  const messages: SchoolMessage[] = (parsed.messages ?? []).map((m, i) => ({
    id: `imp-msg-${stamp}-${i}`,
    kind: m.kind === 'announcement' ? 'announcement' : 'message',
    title: m.title,
    author: m.author || 'Imported from Librus',
    date: m.date || today,
    body: m.body,
    unread: true,
    source: 'import',
  }));

  return {
    summary:
      parsed.summary ||
      `Imported ${lessons.length} classes, ${homework.length} homework items, ${tests.length} tests, and ${messages.length} notices.`,
    lessons,
    homework,
    tests,
    messages,
  };
}
