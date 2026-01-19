/** 
 * Hospital Analytics Platform
 * Manual sync for Simulation Feature (Delta Update) 
 */ 

export interface SimulationAssignment { 
    Service: string; 
    Unit: string; 
    Patient_Count: number; 
    /** The original count before optimization. */ 
    Original_Count: number; 
    /** The net change (Proposed - Original). */ 
    Delta: number; 
} 

export interface ScenarioResult { 
    assignments: Array<SimulationAssignment>; 
    status: string; 
    message?: string; 
}