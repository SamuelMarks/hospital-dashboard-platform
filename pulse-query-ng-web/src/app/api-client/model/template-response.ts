/**
 * Hospital Analytics Platform
 *
 * NOTE: Manual definition to support Feature 2/3 until next generation.
 */

export interface TemplateResponse {
    id: string;
    title: string;
    description?: string;
    sql_template: string;
    category: string;
    /** JSON Schema for dynamic form generation */
    parameters_schema?: Array<{
        name: string;
        type: string;
        label?: string;
        default?: any;
        options?: string[];
        [key: string]: any;
    }> | any; // Allow relaxed typing for schema object
}