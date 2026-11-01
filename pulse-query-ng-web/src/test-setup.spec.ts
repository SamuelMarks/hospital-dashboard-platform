/**
 * @fileoverview Unit tests for the Vitest global Angular test setup (`src/test-setup.ts`).
 */

import { describe, it, expect, vi } from 'vitest';
import { Component, ComponentRef, input, output, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import * as mcu from '@material/material-color-utilities';

/**
 * Sample component exercising signal `input`, `output`, and `viewChild` metadata extraction.
 */
@Component({
  selector: 'app-test-setup-sample',
  template: '<div #vcRef>Sample</div>',
})
class SampleSignalComponent {
  /** Signal input without alias. */
  readonly plainInput = input('default');
  /** Signal output without alias. */
  readonly plainOutput = output<number>();
  /** Signal viewChild query. */
  readonly vc = viewChild('vcRef');
}

/**
 * Plain non-component class exercising aliased `input` and `output` regex parsing in `propMetadata`.
 */
class AliasedSignalClass {
  /**
   * Returns synthetic class source containing aliased signal input and output declarations.
   *
   * @returns Synthetic class declaration string.
   */
  static toString(): string {
    return 'class AliasedSignalClass { this.aliasedInput = input("default", { alias: "customIn" }); this.aliasedOutput = output({ alias: "customOut" }); }';
  }
}

/**
 * Sample class with pre-existing `__prop__metadata__` entries to test non-overwriting branch.
 */
class PreExistingMetaClass {
  /** Input already present in metadata. */
  readonly existingIn = input('x');
  /** Output already present in metadata. */
  readonly existingOut = output<void>();
  /** ViewChild already present in metadata. */
  readonly existingVc = viewChild(' existingRef');
}

/**
 * Sample empty class with no signal properties.
 */
class EmptyPlainClass {}

describe('test-setup.ts global mocks and shims', () => {
  it('mocks @material/material-color-utilities functions and classes', () => {
    expect(mcu.argbFromHex('#123456')).toBe(0xffffffff);
    expect(mcu.hexFromArgb(123)).toBe('#ffffff');
    const theme = mcu.themeFromSourceColor(0xffffffff);
    const lightScheme = theme.schemes.light as unknown as Record<string, number>;
    const darkScheme = theme.schemes.dark as unknown as Record<string, number>;
    expect(lightScheme['primary']).toBe(0xffffffff);
    expect(darkScheme['surface']).toBe(0xffffffff);
    const SchemeCtor = (mcu as unknown as { Scheme: new () => object }).Scheme;
    const ThemeCtor = (mcu as unknown as { Theme: new () => object }).Theme;
    expect(new SchemeCtor()).toBeTruthy();
    expect(new ThemeCtor()).toBeTruthy();
  });

  it('provides window.matchMedia and Range DOM rect mocks', () => {
    const mq = window.matchMedia('(max-width: 768px)');
    expect(mq.matches).toBe(false);
    expect(mq.media).toBe('(max-width: 768px)');

    const range = document.createRange();
    expect(range.getClientRects()).toBeDefined();
    const rect = range.getBoundingClientRect();
    expect(rect.width).toBe(0);
    expect(rect.toJSON()).toEqual({});
  });

  it('wraps TestBed.compileComponents and extracts Function.prototype.propMetadata', async () => {
    await TestBed.compileComponents();

    const propMetaDescriptor = Object.getOwnPropertyDescriptor(
      Function.prototype,
      'propMetadata',
    ) as PropertyDescriptor;
    const getter = propMetaDescriptor.get as (this: unknown) => unknown;
    expect(getter).toBeDefined();

    // Non-function, Function.prototype, and Object return undefined
    expect(getter.call({})).toBeUndefined();
    expect(getter.call(Function.prototype)).toBeUndefined();
    expect(getter.call(Object)).toBeUndefined();

    // Empty class returns undefined and caches undefined
    expect(getter.call(EmptyPlainClass)).toBeUndefined();
    expect(getter.call(EmptyPlainClass)).toBeUndefined();

    // Class with signal input, output, viewChild populates metadata and caches on second access
    const meta1 = getter.call(SampleSignalComponent) as Record<string, unknown[]>;
    expect(meta1).toBeDefined();
    expect(meta1['plainInput']).toBeDefined();
    expect(meta1['plainOutput']).toBeDefined();
    expect(meta1['vc']).toBeDefined();
    const meta2 = getter.call(SampleSignalComponent);
    expect(meta2).toBe(meta1);

    const fnToStringSpy = vi
      .spyOn(Function.prototype, 'toString')
      .mockReturnValueOnce(AliasedSignalClass.toString());
    const aliasedMeta = getter.call(AliasedSignalClass) as Record<string, unknown[]>;
    fnToStringSpy.mockRestore();
    expect(aliasedMeta['aliasedInput']).toBeDefined();
    expect(aliasedMeta['aliasedOutput']).toBeDefined();

    // Pre-existing __prop__metadata__ is preserved without overwriting existing keys
    Reflect.set(PreExistingMetaClass, '__prop__metadata__', {
      existingIn: ['kept-in'],
      existingOut: ['kept-out'],
      existingVc: ['kept-vc'],
    });
    const preMeta = getter.call(PreExistingMetaClass) as Record<string, unknown[]>;
    expect(preMeta['existingIn']).toEqual(['kept-in']);
    expect(preMeta['existingOut']).toEqual(['kept-out']);
    expect(preMeta['existingVc']).toEqual(['kept-vc']);
  });

  it('handles ComponentRef.prototype.setInput fallback across signal and plain properties', () => {
    const fixture = TestBed.createComponent(SampleSignalComponent);
    // Normal setInput path
    fixture.componentRef.setInput('plainInput', 'updated');
    expect(fixture.componentInstance.plainInput()).toBe('updated');

    // Fallback path when originalSetInput throws
    const realSig = signal('initial');
    const sigSymbols = Object.getOwnPropertySymbols(realSig);
    const signalSymbol = sigSymbols[0] as symbol;

    const customApplySpy = vi.fn();
    const customInputFn = (): string => 'custom';
    Reflect.set(customInputFn, signalSymbol, {
      applyValueToInputSignal: customApplySpy,
    });

    const plainFnWithoutSignal = (): string => 'no-sig';

    const fakeInstance: Record<string, unknown> = {
      realSigProp: realSig,
      customSigProp: customInputFn,
      plainFnProp: plainFnWithoutSignal,
      scalarProp: 'old-scalar',
    };

    const fakeRef = { instance: fakeInstance } as unknown as ComponentRef<unknown>;

    // 1. Signal with applyValueToInputSignal
    ComponentRef.prototype.setInput.call(fakeRef, 'customSigProp', 'val-1');
    expect(customApplySpy).toHaveBeenCalledWith(expect.anything(), 'val-1');

    // 2. Signal without applyValueToInputSignal (uses signalSetFn)
    ComponentRef.prototype.setInput.call(fakeRef, 'realSigProp', 'val-2');
    expect(realSig()).toBe('val-2');

    // 3. Non-function property on instance
    ComponentRef.prototype.setInput.call(fakeRef, 'scalarProp', 'new-scalar');
    expect(fakeInstance['scalarProp']).toBe('new-scalar');

    // 4. Function property without SIGNAL symbol is ignored cleanly
    expect(() =>
      ComponentRef.prototype.setInput.call(fakeRef, 'plainFnProp', 'val-3'),
    ).not.toThrow();

    // 5. Missing property on instance rethrows error
    expect(() =>
      ComponentRef.prototype.setInput.call(fakeRef, 'nonExistentProp', 'val-4'),
    ).toThrow();
  });

  it('exercises the global localStorage and sessionStorage mock', () => {
    window.localStorage.clear();
    expect(window.localStorage.length).toBe(0);
    expect(window.localStorage.getItem('missing')).toBeNull();
    expect(window.localStorage.key(0)).toBeNull();

    window.localStorage.setItem('k1', 'v1');
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem('k1')).toBe('v1');
    expect(window.localStorage.key(0)).toBe('k1');

    window.localStorage.removeItem('k1');
    expect(window.localStorage.getItem('k1')).toBeNull();
  });
});
