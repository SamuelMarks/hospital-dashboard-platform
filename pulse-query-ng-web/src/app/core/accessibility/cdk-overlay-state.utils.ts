/**
 * CSS selector matching active modal dialogs, menus, or listboxes inside the Angular CDK overlay container.
 *
 * @fileoverview Shared Angular CDK overlay inspection helper.
 */
export const ACTIVE_CDK_MODAL_SELECTOR =
  '.cdk-overlay-container .mat-mdc-dialog-container, .cdk-overlay-container [role="dialog"], .cdk-overlay-container [role="menu"], .cdk-overlay-container [role="listbox"]';

/**
 * Checks whether an Angular CDK modal dialog, menu, or listbox overlay is currently open in `doc`.
 *
 * @param doc - Injected `DOCUMENT` instance to inspect.
 * @returns `true` when an active CDK overlay element is present.
 */
export function hasActiveCdkOverlay(doc: Document): boolean {
  return doc.querySelector(ACTIVE_CDK_MODAL_SELECTOR) !== null;
}
