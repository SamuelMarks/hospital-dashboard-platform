export interface MessageCandidateResponse { 
    id: string; 
    model_name: string; 
    content: string; 
    sql_snippet?: string | null; 
    is_selected: boolean; 
}