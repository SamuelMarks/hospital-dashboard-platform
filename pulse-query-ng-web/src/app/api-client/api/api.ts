export * from './ai.service';
import { AiService } from './ai.service';
export * from './auth.service';
import { AuthService } from './auth.service';
export * from './dashboards.service';
import { DashboardsService } from './dashboards.service';
export * from './default.service';
import { DefaultService } from './default.service';
export * from './execution.service';
import { ExecutionService } from './execution.service';
export * from './schema.service';
import { SchemaService } from './schema.service';
export * from './simulation.service';
import { SimulationService } from './simulation.service';
export * from './templates.service';
import { TemplatesService } from './templates.service';
// Added missing service
export * from './chat.service';
import { ChatService } from './chat.service';

export const APIS = [AiService, AuthService, DashboardsService, DefaultService, ExecutionService, SchemaService, SimulationService, TemplatesService, ChatService];