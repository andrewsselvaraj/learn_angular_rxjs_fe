import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'RxJS scenarios',
    loadComponent: () => import('./pages/scenarios/scenarios.component').then(m => m.ScenariosComponent),
  },
  {
    path: 'start',
    title: 'Start screen',
    loadComponent: () => import('./pages/start-screen/start-screen.component').then(m => m.StartScreenComponent),
  },
  {
    path: 'exam/:examId',
    title: 'Exam',
    loadComponent: () => import('./pages/exam/exam.component').then(m => m.ExamComponent),
  },
  {
    path: 'result/:sessionId',
    title: 'Result',
    loadComponent: () => import('./pages/result/result.component').then(m => m.ResultComponent),
  },
  {
    path: 'leaderboard',
    title: 'Live leaderboard',
    loadComponent: () => import('./pages/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent),
  },
  {
    path: 'network',
    title: 'Network lab',
    loadComponent: () => import('./pages/network-lab/network-lab.component').then(m => m.NetworkLabComponent),
  },
  { path: '**', redirectTo: '' },
];
