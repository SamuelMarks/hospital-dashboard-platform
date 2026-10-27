/**
 * @fileoverview Unit tests for `SqlCodeMirrorAdapter` and schema completion helpers.
 */

import { describe, it, expect, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import {
  SqlCodeMirrorAdapter,
  buildSqlSchemaCompletionMap,
  SQL_EDITOR_DARK_THEME,
} from './sql-codemirror.adapter';

describe('SqlCodeMirrorAdapter', () => {
  it('should build SQL schema completion map from table metadata', () => {
    const map = buildSqlSchemaCompletionMap([
      {
        table_name: 'hospital_data',
        columns: [{ name: 'patient_id' }, { name: 'clinical_service' }],
      },
      {
        table_name: 'transfers',
        columns: [{ name: 'transfer_id' }],
      },
    ]);

    expect(map).toEqual({
      hospital_data: ['patient_id', 'clinical_service'],
      transfers: ['transfer_id'],
    });
    expect(SQL_EDITOR_DARK_THEME).toBeDefined();
  });

  it('should create a CodeMirror EditorView and notify on document changes', () => {
    const adapter = new SqlCodeMirrorAdapter();
    const host = document.createElement('div');
    const onDocChanged = vi.fn();

    const view = adapter.createEditor(host, 'SELECT 1', onDocChanged);
    expect(view.state.doc.toString()).toBe('SELECT 1');

    // Selection-only transaction should not trigger onDocChanged
    view.dispatch({ selection: { anchor: 0 } });
    expect(onDocChanged).not.toHaveBeenCalled();

    // Document modification should invoke onDocChanged
    view.dispatch({ changes: { from: 0, to: 8, insert: 'SELECT 42' } });
    expect(onDocChanged).toHaveBeenCalledWith('SELECT 42');

    view.destroy();
  });

  it('should reconfigure schema autocomplete and insert tokens at cursor', () => {
    const adapter = new SqlCodeMirrorAdapter();
    const dispatch = vi.fn();
    const focus = vi.fn();
    const fakeView = {
      state: EditorState.create({ doc: 'SELECT ' }),
      dispatch,
      focus,
    };

    adapter.reconfigureSchemaAutocomplete(fakeView, [
      { table_name: 'patients', columns: [{ name: 'id' }] },
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);

    adapter.insertTokenAtCursor(fakeView, '{{dept}}');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(focus).toHaveBeenCalledTimes(1);
  });
});
