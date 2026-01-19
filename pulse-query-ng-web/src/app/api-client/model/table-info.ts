/**
 * Hospital Analytics Platform
 * Manual definition for Schema Metadata
 */
import { ColumnInfo } from './column-info'; 

export interface TableInfo { 
    table_name: string; 
    columns: Array<ColumnInfo>; 
}