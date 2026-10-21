# learn_angular_rxjs_fe

An Angular 18 front end for the online-exam backend in
[learn_angular_rxjs_be](https://github.com/andrewsselvaraj/learn_angular_rxjs_be), built to practise RxJS.
Every one of the backend's nine RxJS scenarios has a screen here where you can try it.

## Run it

1. Start the backend (Java 21): `./mvnw spring-boot:run` in learn_angular_rxjs_be. It listens on `http://localhost:8080`.
2. Start this app (Node 18.19+ or 20+):

   ```bash
   npm install
   npm start          # http://localhost:4200
   npm run test:ci    # unit tests in headless Chrome
   ```

The backend allows CORS and WebSocket connections from `http://localhost:4200`. API and WebSocket URLs live in
`src/environments/environment.development.ts` (for `ng serve`) and `src/environments/environment.ts` (for `ng build`).

## Screens

| Route | What to try | Scenarios |
| --- | --- | --- |
| `/` | The scenario catalogue from `GET /api/scenarios` | all |
| `/start` | Load questions, student and settings with `forkJoin`; add delays or make one call fail | 5 |
| `/exam/EXAM-101` | Timer, auto-save, navigator, flags, tab-switch count, the warning popup and Submit | 1, 2, 3, 4, 6, 8 |
| `/result/:sessionId` | The graded result, reloaded from the server | 6 |
| `/leaderboard` | Live results by WebSocket or by polling | 9 |
| `/network` | Offline detection, failure switches, `retry` in isolation, reset | 7, 8 |

## Where the RxJS lives

| Scenario | File | Operators |
| --- | --- | --- |
| 1. Countdown timer | `core/services/exam.service.ts` | `timer(0, 1000)`, `map`, `takeWhile`, `switchMap` to resync from `GET /time` when the tab is visible again |
| 2. Auto-save | `core/services/exam.service.ts` | `debounceTime(autoSaveDebounceMs)`, `switchMap`, `defer` |
| 3. Shared exam state | `core/services/exam.service.ts`, `pages/exam/exam-widgets.ts` | `BehaviorSubject<ExamState>`, `combineLatest`, `distinctUntilChanged` |
| 4. Tab-switch detection | `core/services/exam.service.ts` | `fromEvent(document, 'visibilitychange')`, `filter`, `concatMap` |
| 5. Start screen | `pages/start-screen/start-screen.component.ts`, `ExamService.start()` | `forkJoin`, `switchMap` |
| 6. Prevent double submit | `core/services/exam.service.ts` | `exhaustMap` (the Submit button is deliberately never disabled) |
| 7. Network drops | `core/services/network.service.ts`, `exam.service.ts`, `pages/network-lab` | `fromEvent(window, 'online' / 'offline')`, `retry({ count, delay })`, re-save on reconnect |
| 8. Five-minute warning | `core/services/exam.service.ts` | `filter`, `take(1)`, server `firstTime` flag so a reload does not show it again |
| 9. Live leaderboard | `core/services/leaderboard.service.ts` | `webSocket()` from `rxjs/webSocket` with `retry`, or `timer` + `switchMap(http.get)` |

`core/services/exam-api.service.ts` wraps every REST endpoint and returns cold Observables; `core/models.ts`
mirrors the backend's records. `core/services/exam.service.spec.ts` tests the exhaustMap, debounce, retry,
timer and shared-state behaviour with `fakeAsync`.

## Tips

* The submit endpoint takes about 1.5 s on purpose. Triple-click Submit and the result card shows how many clicks
  you made against the server's `submitRequestCount`.
* In the network lab set `failNextSaves` to 2, then answer a question: the save badge shows the retries before it succeeds.
* To see the warning popup and auto-submit sooner, start the backend with a shorter exam, for example
  `--app.exam.duration-seconds=360`.
