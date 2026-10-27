/**
 * Extracts the string value from a DOM `input`, `select`, or `textarea` event target.
 *
 * @fileoverview Shared DOM input event value extraction utilities.
 * @param event - DOM input or change event.
 * @returns Current string value of the target form control, or an empty string if unavailable.
 */
export function extractEventInputValue(event: Event): string {
  const target: unknown = event.target;
  if (typeof target === 'object' && target !== null && 'value' in target) {
    return typeof target.value === 'string' ? target.value : '';
  }
  return '';
}
