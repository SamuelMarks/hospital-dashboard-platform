# Theme System (Material 3)

## Overview
- The app uses Angular Material 3 with runtime-generated colors.
- `ThemeService` owns the visual mode (light/dark), seed color, and TV mode.
- Dynamic colors are generated from a seed and injected as CSS variables (`--sys-*`) on `:root`.

## Material 3 Integration
- `src/styles.scss` defines both a Light and Dark M3 theme using `mat.define-theme`.
- Theme CSS is scoped to `body.light-theme` and `body.dark-theme` and applied with `mat.all-component-themes`.
- A runtime bridge maps Material system tokens (`--md-sys-color-*`) to the dynamic `--sys-*` variables so Material components stay in sync with the generated palette.

## Startup Defaults
- `:root` defines fallback `--sys-*` values to prevent FOUC before the service hydrates.
- `ThemeService` loads the saved mode/seed or falls back to the OS preference.

## Common Tasks
- Toggle light/dark: `ThemeService.toggle()` or `ThemeService.setMode('light' | 'dark')`.
- Change seed color: `ThemeService.setSeedColor('#RRGGBB')`.

## Add a Runtime Token
1. Add the default value in `src/styles.scss` under `:root`.
2. Add the generated value in `src/app/core/theme/color-utils.ts`.
3. Map it to a Material token in `src/styles.scss` if a component needs it.

## Key Files
- `src/styles.scss`
- `src/app/core/theme/theme.service.ts`
- `src/app/core/theme/color-utils.ts`
