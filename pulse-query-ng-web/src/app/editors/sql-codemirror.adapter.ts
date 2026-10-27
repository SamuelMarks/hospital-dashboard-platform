/**
 * @fileoverview CodeMirror 6 SQL Editor Adapter.
 *
 * Encapsulates CodeMirror 6 editor state construction, high-contrast dark theme
 * configuration, dynamic SQL language compartment management, schema autocomplete
 * extension assembly, and cursor token insertion.
 */

import { EditorState, Compartment, Extension } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { sql, PostgreSQL } from '@codemirror/lang-sql';
import { keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';

/**
 * Minimal table schema shape used to populate CodeMirror SQL autocomplete suggestions.
 */
export interface SqlAutocompleteTableSchema {
  /** Database table or view name. */
  readonly table_name: string;
  /** Columns belonging to the table or view. */
  readonly columns: readonly { readonly name: string }[];
}

/**
 * High-contrast dark theme extension for the CodeMirror 6 SQL editor.
 */
export const SQL_EDITOR_DARK_THEME: Extension = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#1e1e1e', color: '#f8f8f2' },
    '.cm-content': { caretColor: '#f8f8f2' },
    '.cm-scroller': { overflow: 'auto' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#f8f8f2' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: '#3a3d41' },
    '.cm-panels': { backgroundColor: '#2d2d30', color: '#f8f8f2' },
    '.cm-panels.cm-panels-top': { borderBottom: '2px solid black' },
    '.cm-panels.cm-panels-bottom': { borderTop: '2px solid black' },
    '.cm-searchMatch': {
      backgroundColor: '#72a1ff59',
      outline: '1px solid #457dff',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: '#6199ff2f',
    },
    '.cm-activeLine': { backgroundColor: '#6699ff0b' },
    '.cm-selectionMatch': { backgroundColor: '#aafe661a' },
    '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
      backgroundColor: '#bad0f847',
    },
    '.cm-gutters': {
      backgroundColor: '#1e1e1e',
      color: '#858585',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#2c313a',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: '#ddd',
    },
    '.cm-tooltip': {
      border: 'none',
      backgroundColor: '#252526',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#252526',
      borderBottomColor: '#252526',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#094771',
        color: 'white',
      },
    },
  },
  { dark: true },
);

/**
 * Converts backend table metadata into a CodeMirror SQL schema completion dictionary.
 *
 * @param tables - Array of database table descriptors with column lists.
 * @returns Mapping of table names to arrays of column names.
 */
export function buildSqlSchemaCompletionMap(
  tables: readonly SqlAutocompleteTableSchema[],
): Record<string, string[]> {
  const schemaConfig: Record<string, string[]> = {};
  for (const table of tables) {
    schemaConfig[table.table_name] = table.columns.map((col) => col.name);
  }
  return schemaConfig;
}

/**
 * Adapter managing CodeMirror 6 SQL editor creation, schema autocomplete reconfiguration,
 * and cursor token insertion.
 */
export class SqlCodeMirrorAdapter {
  /** Dynamic compartment holding the active SQL dialect and schema completion extension. */
  private readonly languageConf = new Compartment();

  /**
   * Creates and mounts a CodeMirror 6 `EditorView` inside `hostElement`.
   *
   * @param hostElement - DOM container element to mount the editor into.
   * @param initialDoc - Initial SQL query text.
   * @param onDocChanged - Callback invoked whenever the editor document text changes.
   * @returns Mounted `EditorView` instance.
   */
  createEditor(
    hostElement: HTMLElement,
    initialDoc: string,
    onDocChanged: (newCode: string) => void,
  ): EditorView {
    const startState = EditorState.create({
      doc: initialDoc,
      extensions: [
        basicSetup,
        keymap.of(defaultKeymap),
        this.languageConf.of(sql({ dialect: PostgreSQL })),
        SQL_EDITOR_DARK_THEME,
        EditorView.contentAttributes.of({
          'aria-label': 'SQL Editor',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onDocChanged(update.state.doc.toString());
          }
        }),
      ],
    });

    return new EditorView({
      state: startState,
      parent: hostElement,
    });
  }

  /**
   * Reconfigures the active SQL language compartment with live database table and column completions.
   *
   * @param editorView - Active CodeMirror editor view instance.
   * @param tables - Database table metadata used to build schema autocomplete suggestions.
   */
  reconfigureSchemaAutocomplete(
    editorView: Pick<EditorView, 'dispatch'>,
    tables: readonly SqlAutocompleteTableSchema[],
  ): void {
    const schemaConfig = buildSqlSchemaCompletionMap(tables);
    editorView.dispatch({
      effects: this.languageConf.reconfigure(
        sql({
          dialect: PostgreSQL,
          schema: schemaConfig,
          upperCaseKeywords: true,
        }),
      ),
    });
  }

  /**
   * Inserts a text token (such as `{{param}}`) at the current cursor selection and focuses the editor.
   *
   * @param editorView - Active CodeMirror editor view instance.
   * @param token - String token to insert at the cursor.
   */
  insertTokenAtCursor(
    editorView: Pick<EditorView, 'state' | 'dispatch' | 'focus'>,
    token: string,
  ): void {
    const range = editorView.state.selection.main;
    editorView.dispatch({
      changes: { from: range.from, to: range.to, insert: token },
      selection: { anchor: range.from + token.length },
    });
    editorView.focus();
  }
}
