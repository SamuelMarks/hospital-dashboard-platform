/** 
 * Hospital Analytics Platform
 * Manual sync for Simulation Feature (Priority 11)
 */ 

export interface SimulationAssignment { 
    Service: string; 
    Unit: string; 
    Patient_Count: number; 
} 

export interface ScenarioResult { 
    assignments: Array<SimulationAssignment>; 
    status: string; 
    message?: string; 
}