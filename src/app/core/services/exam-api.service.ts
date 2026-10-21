import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ChaosConfig,
  ExamSettings,
  ExamState,
  ExamStatePatch,
  Leaderboard,
  Ping,
  Question,
  SaveAnswersRequest,
  SaveAnswersResponse,
  ScenarioInfo,
  SessionStarted,
  Simulation,
  StartScreen,
  Student,
  SubmitReason,
  SubmitResponse,
  TabSwitchSummary,
  TimeRemaining,
  WarningAck,
  Answers,
} from '../models';

/**
 * Thin, stateless wrapper around every REST endpoint of learn_angular_rxjs_be.
 * Each method returns a cold Observable: nothing is sent until someone subscribes,
 * which is what lets the RxJS operators in ExamService decide when (and how often) to call.
 */
@Injectable({ providedIn: 'root' })
export class ExamApiService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // Scenario catalogue

  scenarios(): Observable<ScenarioInfo[]> {
    return this.http.get<ScenarioInfo[]>(`${this.api}/scenarios`);
  }

  // Scenario 5: start screen sources

  exams(): Observable<ExamSettings[]> {
    return this.http.get<ExamSettings[]>(`${this.api}/exams`);
  }

  settings(examId: string, sim?: Simulation): Observable<ExamSettings> {
    return this.http.get<ExamSettings>(`${this.api}/exams/${examId}/settings`, { params: simParams(sim) });
  }

  questions(examId: string, sim?: Simulation): Observable<Question[]> {
    return this.http.get<Question[]>(`${this.api}/exams/${examId}/questions`, { params: simParams(sim) });
  }

  students(): Observable<Student[]> {
    return this.http.get<Student[]>(`${this.api}/students`);
  }

  /** Pass "me" for the default student (S1001). */
  student(studentId: string, sim?: Simulation): Observable<Student> {
    return this.http.get<Student>(`${this.api}/students/${studentId}`, { params: simParams(sim) });
  }

  startScreen(examId: string, studentId: string, sim?: Simulation): Observable<StartScreen> {
    const params = simParams(sim).set('studentId', studentId);
    return this.http.get<StartScreen>(`${this.api}/exams/${examId}/start-screen`, { params });
  }

  // Scenario 1: session and server clock

  startSession(examId: string, studentId?: string): Observable<SessionStarted> {
    return this.http.post<SessionStarted>(`${this.api}/exams/${examId}/sessions`, studentId ? { studentId } : {});
  }

  session(sessionId: string): Observable<SessionStarted> {
    return this.http.get<SessionStarted>(`${this.api}/sessions/${sessionId}`);
  }

  time(sessionId: string): Observable<TimeRemaining> {
    return this.http.get<TimeRemaining>(`${this.api}/sessions/${sessionId}/time`);
  }

  // Scenario 2: auto-save

  saveAnswers(sessionId: string, body: SaveAnswersRequest): Observable<SaveAnswersResponse> {
    return this.http.post<SaveAnswersResponse>(`${this.api}/sessions/${sessionId}/answers`, body);
  }

  savedAnswers(sessionId: string): Observable<SaveAnswersResponse> {
    return this.http.get<SaveAnswersResponse>(`${this.api}/sessions/${sessionId}/answers`);
  }

  // Scenario 3: shared exam state

  state(sessionId: string): Observable<ExamState> {
    return this.http.get<ExamState>(`${this.api}/sessions/${sessionId}/state`);
  }

  patchState(sessionId: string, patch: ExamStatePatch): Observable<ExamState> {
    return this.http.patch<ExamState>(`${this.api}/sessions/${sessionId}/state`, patch);
  }

  // Scenario 4: tab switches

  recordTabSwitch(sessionId: string, hiddenAt: string): Observable<TabSwitchSummary> {
    return this.http.post<TabSwitchSummary>(`${this.api}/sessions/${sessionId}/events/tab-switch`, { hiddenAt });
  }

  tabSwitches(sessionId: string): Observable<TabSwitchSummary> {
    return this.http.get<TabSwitchSummary>(`${this.api}/sessions/${sessionId}/events/tab-switch`);
  }

  // Scenario 6: submit

  submit(sessionId: string, answers: Answers, reason: SubmitReason): Observable<SubmitResponse> {
    return this.http.post<SubmitResponse>(`${this.api}/sessions/${sessionId}/submit`, { answers, reason });
  }

  result(sessionId: string): Observable<SubmitResponse> {
    return this.http.get<SubmitResponse>(`${this.api}/sessions/${sessionId}/result`);
  }

  // Scenario 7: network

  ping(): Observable<Ping> {
    return this.http.get<Ping>(`${this.api}/health/ping`);
  }

  chaos(): Observable<ChaosConfig> {
    return this.http.get<ChaosConfig>(`${this.api}/chaos`);
  }

  updateChaos(config: Partial<ChaosConfig>): Observable<ChaosConfig> {
    return this.http.put<ChaosConfig>(`${this.api}/chaos`, config);
  }

  clearChaos(): Observable<ChaosConfig> {
    return this.http.delete<ChaosConfig>(`${this.api}/chaos`);
  }

  // Scenario 8: warning

  timeWarning(sessionId: string): Observable<WarningAck> {
    return this.http.post<WarningAck>(`${this.api}/sessions/${sessionId}/events/time-warning`, {});
  }

  // Scenario 9: leaderboard (polling; the WebSocket lives in LeaderboardService)

  leaderboard(examId: string): Observable<Leaderboard> {
    return this.http.get<Leaderboard>(`${this.api}/exams/${examId}/leaderboard`);
  }

  // Admin

  reset(): Observable<{ reset: boolean; at: string }> {
    return this.http.post<{ reset: boolean; at: string }>(`${this.api}/admin/reset`, {});
  }
}

function simParams(sim?: Simulation): HttpParams {
  let params = new HttpParams();
  if (sim?.delayMs) {
    params = params.set('delayMs', sim.delayMs);
  }
  if (sim?.failWith) {
    params = params.set('failWith', sim.failWith);
  }
  return params;
}
