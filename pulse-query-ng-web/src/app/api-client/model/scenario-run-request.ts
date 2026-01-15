/** 
 * Hospital Analytics Platform
 * Manual sync for Simulation Feature (Priority 11)
 */ 

export interface ScenarioConstraint { 
    type: string; 
    service: string; 
    unit: string; 
    min?: number; 
    max?: number; 
} 

export interface ScenarioRunRequest { 
    /** SQL Query to fetch current demand. */ 
    demand_source_sql: string; 
    /** Map of Unit Name to bed capacity. */ 
    capacity_parameters: { [key: string]: number; }; 
    /** List of constraints. */ 
    constraints?: Array<ScenarioConstraint>; 
    /** Optional affinity overrides. */ 
    affinity_overrides?: { [key: string]: { [key: string]: number; }; }; 
}