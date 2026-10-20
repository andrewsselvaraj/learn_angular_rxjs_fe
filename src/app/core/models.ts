// TypeScript mirrors of the records in learn_angular_rxjs_be (web/dto and model).
// Instants arrive as ISO-8601 UTC strings.

export type SessionStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
export type SubmitReason = 'MANUAL' | 'TIMER';

/** questionId -> optionId ("A" to "D"). */
export type Answers = Record<string, string>;

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  code: string;
  message: string;
  path: string;
}

export interface ScenarioInfo {
  number: number;
  key: string;
  title: string;
  description: string;
  rxjs: string;
  endpoints: string[];
}

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  number: number;
  topic: string;
  text: string;
  options: Option[];
  marks: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  rollNumber: string;
  className: string;
  avatarUrl: string;
}

export interface ExamSettings {
  examId: string;
  title: string;
  subject: string;
  durationSeconds: number;
  totalQuestions: number;
  totalMarks: number;
  passPercentage: number;
  warningAtSeconds: number;
  autoSaveDebounceMs: number;
  saveRetryCount: number;
  saveRetryDelayMs: number;
  maxTabSwitches: number;
  leaderboardPollIntervalMs: number;
  allowReview: boolean;
}

export interface StartScreen {
  questions: Question[];
  student: Student;
  settings: ExamSettings;
}

export interface SessionStarted {
  sessionId: string;
  examId: string;
  studentId: string;
  serverTime: string;
  startedAt: string;
  endsAt: string;
  durationSeconds: number;
  remainingSeconds: number;
  resumed: boolean;
}

export interface TimeRemaining {
  sessionId: string;
  serverTime: string;
  startedAt: string;
  endsAt: string;
  durationSeconds: number;
  remainingSeconds: number;
  warningAtSeconds: number;
  warningDue: boolean;
  expired: boolean;
}

export interface SaveAnswersRequest {
  answers: Answers;
  currentQuestionIndex?: number;
  clientSavedAt?: string;
}

export interface SaveAnswersResponse {
  sessionId: string;
  saved: boolean;
  savedAt: string | null;
  saveCount: number;
  answeredCount: number;
  totalQuestions: number;
  answers: Answers;
}

export interface ExamState {
  sessionId: string;
  examId: string;
  studentId: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  totalQuestions: number;
  answeredCount: number;
  answers: Answers;
  flaggedQuestionIds: string[];
  remainingSeconds: number;
  tabSwitchCount: number;
  lastSavedAt: string | null;
}

export interface ExamStatePatch {
  currentQuestionIndex?: number;
  flaggedQuestionIds?: string[];
}

export interface TabSwitchEvent {
  sequence: number;
  hiddenAt: string;
  receivedAt: string;
}

export interface TabSwitchSummary {
  sessionId: string;
  count: number;
  maxAllowed: number;
  remainingAllowed: number;
  limitExceeded: boolean;
  events: TabSwitchEvent[];
}

export interface WarningAck {
  sessionId: string;
  firstTime: boolean;
  shownAt: string;
  remainingSeconds: number;
}

export interface SubmitResult {
  score: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  correct: number;
  wrong: number;
  unanswered: number;
  reason: SubmitReason;
  submittedAt: string;
  timeTakenSeconds: number;
}

export interface SubmitResponse {
  sessionId: string;
  status: SessionStatus;
  alreadySubmitted: boolean;
  submitRequestCount: number;
  result: SubmitResult;
}

export interface LeaderboardEntry {
  rank: number | null;
  studentId: string;
  name: string;
  avatarUrl: string;
  status: SessionStatus;
  score: number | null;
  percentage: number | null;
  submittedAt: string | null;
  timeTakenSeconds: number | null;
}

export interface Leaderboard {
  examId: string;
  generatedAt: string;
  totalStudents: number;
  submittedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  entries: LeaderboardEntry[];
}

/** One message from ws://…/ws/leaderboard. */
export interface LeaderboardMessage {
  type: 'SNAPSHOT' | 'STARTED' | 'SUBMITTED';
  sentAt: string;
  changed: LeaderboardEntry | null;
  leaderboard: Leaderboard;
}

export interface ChaosConfig {
  failNextSaves: number | null;
  failNextRequests: number | null;
  extraLatencyMs: number | null;
}

export interface Ping {
  status: string;
  serverTime: string;
}

/** Per-request network simulation the backend understands on any /api call. */
export interface Simulation {
  delayMs?: number;
  failWith?: number;
}
