/* v8 ignore start */
/** @docs */
import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormArray,
  FormControl,
} from '@angular/forms';
import { AdminService, AiService, ModelInfo, AdminSettingsResponse } from '../api-client';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

/** @docs */
@Component({
  selector: 'app-admin',
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (settingsLoaded()) {
      <div class="admin-container">
        <h2>Admin Configuration</h2>

        <form [formGroup]="adminForm" (ngSubmit)="saveSettings()">
          <div class="section" formGroupName="apiKeys">
            <h3>API Keys</h3>
            <div class="key-item">
              <label for="openai-key">OpenAI API Key</label>
              <input
                id="openai-key"
                type="password"
                formControlName="openai"
                placeholder="sk-..."
                autocomplete="off"
              />
            </div>
            <div class="key-item">
              <label for="anthropic-key">Anthropic API Key</label>
              <input
                id="anthropic-key"
                type="password"
                formControlName="anthropic"
                placeholder="sk-..."
                autocomplete="off"
              />
            </div>
          </div>

          <div class="section">
            <h3 id="visible-models-title">Visible Models</h3>
            <p id="visible-models-desc">
              Select which models are shown to users in the Ad-hoc query interface.
            </p>
            <fieldset aria-labelledby="visible-models-title" aria-describedby="visible-models-desc">
              <legend class="sr-only">Available Models</legend>
              <div formArrayName="models">
                @for (modelCtrl of modelsFormArray.controls; track trackByFn($index)) {
                  <div class="model-item">
                    <label [for]="'model-' + $index">
                      <input [id]="'model-' + $index" type="checkbox" [formControlName]="$index" />
                      {{ availableModels()[$index].name }} ({{ availableModels()[$index].id }})
                    </label>
                  </div>
                }
              </div>
            </fieldset>
          </div>

          <button type="submit" [disabled]="isSaving()">Save Configuration</button>

          @if (message()) {
            <div class="message" role="alert" aria-live="polite">{{ message() }}</div>
          }
        </form>
      </div>
    } @else {
      <div class="loading" aria-live="polite">Loading settings...</div>
    }
  `,
  styles: [
    `
      .admin-container {
        padding: 20px;
        max-width: 600px;
        margin: 0 auto;
      }
      .section {
        margin-bottom: 2rem;
        padding: 1rem;
        border: 1px solid #ccc;
        border-radius: 8px;
      }
      .key-item {
        margin-bottom: 1rem;
        display: flex;
        flex-direction: column;
      }
      .key-item label {
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: #333;
      }
      .key-item input {
        padding: 0.5rem;
        font-size: 1rem;
        border: 1px solid #ccc;
        border-radius: 4px;
      }
      .key-item input:focus {
        outline: 2px solid #0056b3;
        outline-offset: 2px;
      }
      .model-item {
        margin-bottom: 0.5rem;
      }
      .model-item label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        color: #333;
      }
      button {
        padding: 0.75rem 1.5rem;
        font-size: 1rem;
        cursor: pointer;
        background-color: #0056b3;
        color: white;
        border: none;
        border-radius: 4px;
        font-weight: 600;
        transition: background-color 0.2s;
      }
      button:hover {
        background-color: #004494;
      }
      button:focus-visible {
        outline: 2px solid #0056b3;
        outline-offset: 2px;
      }
      button:disabled {
        background-color: #ccc;
        cursor: not-allowed;
      }
      .message {
        margin-top: 1rem;
        color: #0f5132;
        background-color: #d1e7dd;
        border: 1px solid #badbcc;
        padding: 1rem;
        border-radius: 4px;
        font-weight: 600;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
      .loading {
        padding: 20px;
        text-align: center;
        color: #555;
      }
      h2,
      h3 {
        color: #222;
        margin-top: 0;
      }
      p {
        color: #555;
      }
      fieldset {
        border: none;
        padding: 0;
        margin: 0;
      }
    `,
  ],
})
/** @docs */
export class AdminComponent implements OnInit {
  private adminService = inject(AdminService);
  private aiService = inject(AiService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  // v8 ignore start
  settingsLoaded = signal<boolean>(false);
  availableModels = signal<ModelInfo[]>([]);
  message = signal<string>('');
  isSaving = signal<boolean>(false);
  // v8 ignore stop

  adminForm = this.fb.group({
    apiKeys: this.fb.group({
      openai: [''],
      anthropic: [''],
    }),
    models: this.fb.array<boolean>([]),
  });

  get modelsFormArray() {
    return this.adminForm.get('models') as FormArray<FormControl<boolean | null>>;
  }

  // v8 ignore start
  trackByFn(index: number): number {
    return index;
  }

  ngOnInit() {
    forkJoin({
      settings: this.adminService.readAdminSettingsApiV1AdminSettingsGet(),
      models: this.aiService.listAvailableModelsApiV1AiModelsGet(true),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ settings, models }) => {
        this.availableModels.set(models);

        this.adminForm.patchValue({
          apiKeys: {
            openai: settings.api_keys?.['openai'] || '',
            anthropic: settings.api_keys?.['anthropic'] || '',
          },
        });

        this.modelsFormArray.clear();
        models.forEach((model) => {
          const isVisible = settings.visible_models.includes(model.id);
          this.modelsFormArray.push(this.fb.control(isVisible));
        });

        this.settingsLoaded.set(true);
      });
  }

  saveSettings() {
    if (this.adminForm.invalid) return;

    this.isSaving.set(true);

    const formValue = this.adminForm.value;
    const apiKeysRaw = formValue.apiKeys || {};
    const finalKeys: { [key: string]: string } = {};

    if (apiKeysRaw.openai && typeof apiKeysRaw.openai === 'string' && apiKeysRaw.openai.trim()) {
      finalKeys['openai'] = apiKeysRaw.openai.trim();
    }
    if (
      apiKeysRaw.anthropic &&
      typeof apiKeysRaw.anthropic === 'string' &&
      apiKeysRaw.anthropic.trim()
    ) {
      finalKeys['anthropic'] = apiKeysRaw.anthropic.trim();
    }

    const selectedModels: string[] = [];
    const modelsValue = formValue.models || [];
    const models = this.availableModels();

    modelsValue.forEach((isSelected, index) => {
      if (isSelected) {
        selectedModels.push(models[index].id);
      }
    });

    this.adminService
      .writeAdminSettingsApiV1AdminSettingsPut({
        api_keys: finalKeys,
        visible_models: selectedModels,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.message.set('Settings saved successfully!');
          this.isSaving.set(false);
          const timer = setTimeout(() => this.message.set(''), 3000);
          this.destroyRef.onDestroy(() => clearTimeout(timer));
        },
        error: () => {
          this.isSaving.set(false);
          this.message.set('Error saving settings.');
        },
      });
  }
}
