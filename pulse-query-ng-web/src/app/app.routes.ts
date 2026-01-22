/** 
 * @fileoverview Application routing configuration. 
 * Defines the URL paths and maps them to lazy-loaded components or child route modules. 
 * Includes Route Guards for Authentication and Guest access control. 
 */ 

import { Routes } from '@angular/router'; 
import { authGuard } from './core/auth/auth.guard'; 
import { guestGuard } from './core/auth/guest.guard'; 
import { registrationGuard } from './core/auth/registration.guard'; 

/** 
 * The main application route definitions. 
 * 
 * Architecture Decisions: 
 * - All leaf components are lazy-loaded using `loadComponent` to reduce the initial bundle size. 
 * - Feature modules (like Simulation) are lazy-loaded using `loadChildren`. 
 * - Guards are applied at the route level to protect lazy chunks from loading unnecessarily if access is denied. 
 */ 
export const routes: Routes = [ 
  // --- Public / Guest Routes --- 
  { 
    path: 'login', 
    canActivate: [guestGuard], 
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent), 
    title: 'Login - Pulse Query' 
  }, 
  { 
    path: 'register', 
    canActivate: [guestGuard, registrationGuard], 
    loadComponent: () => import('./register/register.component').then(m => m.RegisterComponent), 
    title: 'Register - Pulse Query' 
  }, 

  // --- Protected Routes --- 
  { 
    path: '', 
    canActivate: [authGuard], 
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent), 
    title: 'Home - Pulse Query' 
  }, 
  { 
    path: 'dashboard/:id', 
    canActivate: [authGuard], 
    loadComponent: () => import('./dashboard/dashboard-layout.component').then(m => m.DashboardLayoutComponent), 
    title: 'Dashboard - Pulse Query' 
  }, 
  
  // --- Ad-Hoc Chat Interface ---
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./chat/chat-layout.component').then(m => m.ChatLayoutComponent),
    title: 'Ad-Hoc Analysis - Pulse Query'
  },

  // --- Feature Modules (Lazy Loaded) --- 
  { 
    path: 'simulation', 
    canActivate: [authGuard], 
    loadChildren: () => import('./simulation/simulation.routes').then(m => m.simulationRoutes), 
    title: 'Simulation - Pulse Query' 
  }, 

  // --- Fallback --- 
  { 
    path: '**', 
    redirectTo: '' 
  } 
];