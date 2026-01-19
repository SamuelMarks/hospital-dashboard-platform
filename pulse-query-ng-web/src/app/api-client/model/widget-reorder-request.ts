/** 
 * Hospital Analytics Platform
 * Manual definition matching Backend Schema
 */ 
import { WidgetReorderItem } from './widget-reorder-item'; 

export interface WidgetReorderRequest { 
    items: Array<WidgetReorderItem>; 
}