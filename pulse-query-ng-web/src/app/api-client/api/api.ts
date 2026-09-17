export * from './admin.service';
import { AdminService } from './admin.service';
export * from './admin-users.service';
import { AdminUsersService } from './admin-users.service';
export * from './ai.service';
import { AiService } from './ai.service';
export * from './alert-rules.service';
import { AlertRulesService } from './alert-rules.service';
export * from './analytics.service';
import { AnalyticsService } from './analytics.service';
export * from './auth.service';
import { AuthService } from './auth.service';
export * from './benchmarks.service';
import { BenchmarksService } from './benchmarks.service';
export * from './chat.service';
import { ChatService } from './chat.service';
export * from './dashboards.service';
import { DashboardsService } from './dashboards.service';
export * from './default.service';
import { DefaultService } from './default.service';
export * from './execution.service';
import { ExecutionService } from './execution.service';
export * from './mpax-arena.service';
import { MpaxArenaService } from './mpax-arena.service';
export * from './schema.service';
import { SchemaService } from './schema.service';
export * from './simulation.service';
import { SimulationService } from './simulation.service';
export * from './system.service';
import { SystemService } from './system.service';
export * from './templates.service';
import { TemplatesService } from './templates.service';
export const APIS = [
  AdminService,
  AdminUsersService,
  AiService,
  AlertRulesService,
  AnalyticsService,
  AuthService,
  BenchmarksService,
  ChatService,
  DashboardsService,
  DefaultService,
  ExecutionService,
  MpaxArenaService,
  SchemaService,
  SimulationService,
  SystemService,
  TemplatesService,
];
