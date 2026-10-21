import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ExamSettings, ExamState, Question, SessionStarted, SubmitResponse, TabSwitchSummary } from '../models';
import { ExamService, SaveStatus, SubmitState } from './exam.service';

const api = environment.apiUrl;
const sessionId = 'sess-1';

const settings: ExamSettings = {
  examId: 'EXAM-101',
  title: 'Angular & RxJS Fundamentals',
  subject: 'Angular',
  durationSeconds: 1800,
  totalQuestions: 2,
  totalMarks: 10,
  passPercentage: 40,
  warningAtSeconds: 0,
  autoSaveDebounceMs: 2000,
  saveRetryCount: 3,
  saveRetryDelayMs: 2000,
  maxTabSwitches: 3,
  leaderboardPollIntervalMs: 10000,
  allowReview: true,
};

const questions: Question[] = ['Q1', 'Q2'].map((id, i) => ({
  id,
  number: i + 1,
  topic: 'RxJS',
  text: `Question ${i + 1}`,
  options: [
    { id: 'A', text: 'a' },
    { id: 'B', text: 'b' },
  ],
  marks: 5,
}));

function session(remainingSeconds: number): SessionStarted {
  return {
    sessionId,
    examId: 'EXAM-101',
    studentId: 'S1001',
    serverTime: '',
    startedAt: '',
    endsAt: '',
    durationSeconds: 1800,
    remainingSeconds,
    resumed: false,
  };
}

const state: ExamState = {
  sessionId,
  examId: 'EXAM-101',
  studentId: 'S1001',
  status: 'IN_PROGRESS',
  currentQuestionIndex: 0,
  totalQuestions: 2,
  answeredCount: 0,
  answers: {},
  flaggedQuestionIds: [],
  remainingSeconds: 1800,
  tabSwitchCount: 0,
  lastSavedAt: null,
};

const tabs: TabSwitchSummary = { sessionId, count: 0, maxAllowed: 3, remainingAllowed: 3, limitExceeded: false, events: [] };

const submitResponse: SubmitResponse = {
  sessionId,
  status: 'SUBMITTED',
  alreadySubmitted: false,
  submitRequestCount: 1,
  result: {
    score: 5,
    totalMarks: 10,
    percentage: 50,
    passed: true,
    correct: 1,
    wrong: 0,
    unanswered: 1,
    reason: 'MANUAL',
    submittedAt: '',
    timeTakenSeconds: 10,
  },
};

describe('ExamService', () => {
  let exam: ExamService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    exam = TestBed.inject(ExamService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Answers the forkJoin of start() and the follow-up state requests. */
  function startExam(remainingSeconds = 1800): void {
    exam.start('EXAM-101').subscribe();
    http.expectOne(`${api}/exams/EXAM-101/settings`).flush(settings);
    http.expectOne(`${api}/exams/EXAM-101/questions`).flush(questions);
    http.expectOne(`${api}/exams/EXAM-101/sessions`).flush(session(remainingSeconds));
    http.expectOne(`${api}/sessions/${sessionId}/state`).flush(state);
    http.expectOne(`${api}/sessions/${sessionId}/events/tab-switch`).flush(tabs);
  }

  function latest<T>(source: { subscribe: (fn: (v: T) => void) => { unsubscribe(): void } }): T {
    let value!: T;
    source.subscribe(v => (value = v)).unsubscribe();
    return value;
  }

  it('sends one submit request for a burst of clicks (exhaustMap)', fakeAsync(() => {
    startExam();

    exam.submit();
    exam.submit();
    exam.submit();

    const req = http.expectOne(`${api}/sessions/${sessionId}/submit`);
    expect(req.request.body.reason).toBe('MANUAL');
    req.flush(submitResponse);

    expect(latest<number>(exam.submitClickCount$)).toBe(3);
    expect(latest<SubmitState>(exam.submitState$).kind).toBe('done');
    discardPeriodicTasks();
  }));

  it('debounces answer changes into one save with the latest answers', fakeAsync(() => {
    startExam();

    exam.selectAnswer('Q1', 'A');
    tick(500);
    exam.selectAnswer('Q1', 'B');
    tick(500);
    exam.selectAnswer('Q2', 'A');
    expect(latest<SaveStatus>(exam.saveStatus$).kind).toBe('pending');
    http.expectNone(`${api}/sessions/${sessionId}/answers`);

    tick(2000);
    const req = http.expectOne(`${api}/sessions/${sessionId}/answers`);
    expect(req.request.body.answers).toEqual({ Q1: 'B', Q2: 'A' });
    req.flush({ sessionId, saved: true, savedAt: 'now', saveCount: 1, answeredCount: 2, totalQuestions: 2, answers: {} });

    expect(latest<SaveStatus>(exam.saveStatus$)).toEqual({ kind: 'saved', at: 'now', saveCount: 1 });
    exam.stop();
    discardPeriodicTasks();
  }));

  it('retries a failed save and reports each attempt (retry)', fakeAsync(() => {
    startExam();
    exam.selectAnswer('Q1', 'A');
    tick(2000);

    for (const attempt of [1, 2]) {
      expect(latest<SaveStatus>(exam.saveStatus$)).toEqual({ kind: 'saving', attempt });
      http.expectOne(`${api}/sessions/${sessionId}/answers`).flush(null, { status: 503, statusText: 'Unavailable' });
      tick(2000);
    }
    http
      .expectOne(`${api}/sessions/${sessionId}/answers`)
      .flush({ sessionId, saved: true, savedAt: 'now', saveCount: 1, answeredCount: 1, totalQuestions: 2, answers: {} });

    expect(latest<SaveStatus>(exam.saveStatus$).kind).toBe('saved');
    exam.stop();
    discardPeriodicTasks();
  }));

  it('submits with reason TIMER when the countdown reaches zero', fakeAsync(() => {
    startExam(3);
    tick(0);
    expect(latest<number | null>(exam.timeLeft$)).toBe(3);

    tick(3000);
    const req = http.expectOne(`${api}/sessions/${sessionId}/submit`);
    expect(req.request.body.reason).toBe('TIMER');
    req.flush({ ...submitResponse, result: { ...submitResponse.result, reason: 'TIMER' } });
    flush();
  }));

  it('shares one state between readers (BehaviorSubject)', fakeAsync(() => {
    startExam();

    exam.selectAnswer('Q1', 'A');
    exam.goTo(1);

    expect(latest<{ answered: number; total: number }>(exam.progress$)).toEqual({ answered: 1, total: 2 });
    expect(latest<Question | null>(exam.currentQuestion$)?.id).toBe('Q2');

    tick(400);
    http.expectOne(`${api}/sessions/${sessionId}/state`).flush(state);
    exam.stop();
    // stop() saves the unsaved answer one last time.
    http.expectOne(`${api}/sessions/${sessionId}/answers`).flush({});
    discardPeriodicTasks();
  }));
});
