import { create } from 'zustand';
import { current, produce } from 'immer';
import {
  SCHEMA_VERSION, type Colour, type ColourScale, type ExportSettings, type GenerationSettings, type HarmonyMode,
  type BriefRecord, type Oklch, type Palette, type PaletteColour, type Project, type ScaleStep,
} from '@/types';
import {
  buildPaletteColours, checkScale, DEFAULT_SEEDS, DEFAULT_SETTINGS, FEEDBACK_SEEDS, generateScale, interpretPrompt,
  makeColour, parseColour, rederiveUnlocked, seedParamsOf, type PromptInterpretation, type ScaleChecks,
} from '@/lib/colour-engine';
import { interpretBrief, SCHEMA_VERSION as INTERPRETATION_SCHEMA_VERSION } from '@/lib/interpretation';
import { VIBE_DB_VERSION } from '@/lib/vibe-db';
import { uniqueName, validateFamilyName } from '@/lib/validation/names';
import { createId } from '@/utils/id';
import { loadProject, saveProject, type SaveResult } from './persistence';

export type ModuleId = 'palette' | 'scales' | 'tokens' | 'themes' | 'accessibility' | 'export';

const HISTORY_LIMIT = 100;
const COALESCE_MS = 900;

export function emptyProject(): Project {
  const now = new Date().toISOString();
  return {
    id: createId('project'),
    name: 'Untitled colour system',
    createdAt: now,
    updatedAt: now,
    activeThemeId: '',
    schemaVersion: SCHEMA_VERSION,
    palettes: [],
    colourFamilies: [],
    tokens: [],
    themes: [],
    exportSettings: { scope: 'primitive', includeThemes: [], colourFormat: 'hex' },
  };
}

type Result = { ok: true } | { ok: false; error: string };

/** What happened to a brief. `mode` always says which interpreter produced the palette. */
export type BriefResult =
  | { status: 'ok'; mode: 'ai' | 'refined' | 'fallback'; fallbackReason?: string; unmatched?: string[] }
  | { status: 'empty'; mode: 'fallback'; fallbackReason: string }
  | { status: 'unchanged'; reason: string };

interface UiState {
  module: ModuleId;
  selectedColourId: string | null;
  selectedFamilyId: string | null;
  selectedStep: ScaleStep | null;
}

interface StoreState {
  project: Project;
  past: Project[];
  future: Project[];
  ui: UiState;
  save: { at: string | null; issue: SaveResult | null };
  loadIssue: string | null;

  // navigation / selection
  setModule: (module: ModuleId) => void;
  selectColour: (id: string | null) => void;
  selectFamily: (id: string | null) => void;
  selectStep: (step: ScaleStep | null) => void;

  // workspace
  renameProject: (name: string) => void;
  newProject: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (result: SaveResult) => void;
  dismissLoadIssue: () => void;

  // Palette Studio
  generateFromColour: (input: string, opts: { count?: number; harmony?: HarmonyMode }) => Result;
  generateFromPrompt: (prompt: string, count?: number) => PromptInterpretation;
  /** AI interpretation when the server has credentials; otherwise the keyword interpreter, labelled as fallback. */
  generateFromBrief: (prompt: string, count?: number) => Promise<BriefResult>;
  /** Refines the current brief in context ("slightly warmer, less saturated"). Locked colours are kept. */
  refineBrief: (refinement: string) => Promise<BriefResult>;
  setHarmony: (harmony: HarmonyMode) => void;
  regenerateUnlocked: () => number;
  updateColour: (id: string, oklch: Oklch) => void;
  toggleColourLock: (id: string) => void;
  moveColour: (id: string, toIndex: number) => void;
  duplicateColour: (id: string) => void;
  deleteColour: (id: string) => void;
  addColour: () => void;
  renameColour: (id: string, name: string) => Result;

  // Colour Scales
  createScalesFromPalette: (includeFeedback: boolean) => number;
  addFamily: (name: string, colourInput: string) => Result;
  deleteFamily: (id: string) => void;
  renameFamily: (id: string, name: string) => Result;
  setFamilyBase: (id: string, oklch: Oklch) => ScaleChecks | null;
  updateFamilySettings: (id: string, patch: Partial<GenerationSettings>) => void;
  regenerateFamily: (id: string, full: boolean) => void;
  editShade: (familyId: string, step: ScaleStep, oklch: Oklch) => ScaleChecks | null;
  toggleShadeLock: (familyId: string, step: ScaleStep) => void;

  // Export
  setExportSettings: (patch: Partial<ExportSettings>) => void;
}

function baseFrom(oklch: Oklch, name: string): Colour {
  return makeColour(oklch, { id: createId('base'), name, locked: false });
}

function newFamily(name: string, oklch: Oklch): ColourScale {
  const id = createId('family');
  return generateScale({ id, familyName: name, base: baseFrom(oklch, name), settings: { ...DEFAULT_SETTINGS }, createId });
}

/** Regenerates a family from a (possibly new) base. Locked shades persist. Works on plain objects only. */
function regenerate(family: ColourScale, patch: { base?: Oklch; settings?: GenerationSettings; full?: boolean; name?: string }): ColourScale {
  const familyName = patch.name ?? family.familyName;
  const base = patch.base ? makeColour(patch.base, { id: family.base.id, name: familyName }) : { ...family.base, name: familyName };
  const next = generateScale({
    id: family.id,
    familyName,
    base,
    settings: patch.settings ?? family.generationSettings,
    previous: family,
    ignoreLocks: patch.full,
    createId,
  });
  if (patch.name) {
    for (const step of Object.keys(next.shades)) {
      const k = Number(step) as ScaleStep;
      next.shades[k] = { ...next.shades[k], name: `${familyName}-${k}` };
    }
  }
  return next;
}

/** Palette colours linked to a family push their value into that family's base (PS-003: dependents update immediately). */
function syncLinkedFamilies(draft: Project) {
  const palette = draft.palettes[0];
  if (!palette) return;
  for (const colour of palette.colours) {
    if (!colour.familyId) continue;
    const index = draft.colourFamilies.findIndex((f) => f.id === colour.familyId);
    if (index === -1) {
      delete colour.familyId;
      continue;
    }
    const family = current(draft.colourFamilies[index]);
    if (family.base.hex !== colour.hex) {
      draft.colourFamilies[index] = regenerate(family, { base: { ...colour.oklch } });
    }
  }
}

const initial = loadProject();

export const useProjectStore = create<StoreState>((set, get) => {
  let lastKey: string | null = null;
  let lastAt = 0;

  /** Applies an edit to the project and records it in the undo history. */
  const commit = (recipe: (draft: Project) => void, coalesce?: string) => {
    set((state) => {
      const next = produce(state.project, (draft) => {
        recipe(draft);
        draft.updatedAt = new Date().toISOString();
      });
      const now = Date.now();
      // Rapid edits of the same control (e.g. dragging a slider) collapse into one undo step.
      const merge = !!coalesce && coalesce === lastKey && now - lastAt < COALESCE_MS && state.past.length > 0;
      lastKey = coalesce ?? null;
      lastAt = now;
      return {
        project: next,
        past: merge ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  };

  const palette = () => get().project.palettes[0] as Palette | undefined;

  return {
    project: initial.status === 'ok' ? initial.project : emptyProject(),
    past: [],
    future: [],
    ui: {
      module: 'palette',
      selectedColourId: null,
      selectedFamilyId: initial.status === 'ok' ? (initial.project.colourFamilies[0]?.id ?? null) : null,
      selectedStep: null,
    },
    save: { at: initial.status === 'ok' ? initial.project.updatedAt : null, issue: initial.status === 'unavailable' ? { ok: false, reason: 'unavailable' } : null },
    loadIssue: initial.status === 'corrupt' ? initial.reason : null,

    setModule: (module) => set((s) => ({ ui: { ...s.ui, module } })),
    selectColour: (id) => set((s) => ({ ui: { ...s.ui, selectedColourId: id } })),
    selectFamily: (id) => set((s) => ({ ui: { ...s.ui, selectedFamilyId: id, selectedStep: null } })),
    selectStep: (step) => set((s) => ({ ui: { ...s.ui, selectedStep: step } })),

    renameProject: (name) => {
      const trimmed = name.trim().slice(0, 60);
      if (!trimmed || trimmed === get().project.name) return;
      commit((d) => {
        d.name = trimmed;
      });
    },
    newProject: () => {
      set((s) => ({
        project: emptyProject(),
        past: [...s.past, s.project].slice(-HISTORY_LIMIT),
        future: [],
        ui: { module: 'palette', selectedColourId: null, selectedFamilyId: null, selectedStep: null },
      }));
    },
    undo: () =>
      set((s) => {
        const previous = s.past.at(-1);
        if (!previous) return s;
        lastKey = null;
        return { project: previous, past: s.past.slice(0, -1), future: [s.project, ...s.future] };
      }),
    redo: () =>
      set((s) => {
        const next = s.future[0];
        if (!next) return s;
        lastKey = null;
        return { project: next, past: [...s.past, s.project], future: s.future.slice(1) };
      }),
    markSaved: (result) => set({ save: result.ok ? { at: new Date().toISOString(), issue: null } : { at: get().save.at, issue: result } }),
    dismissLoadIssue: () => set({ loadIssue: null }),

    // ---------- Palette Studio ----------
    generateFromColour: (input, opts) => {
      const parsed = parseColour(input);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const harmony = opts.harmony ?? palette()?.harmony ?? 'analogous';
      const params = { anchor: parsed.oklch, harmony, chromaBias: 1, lightnessBias: 0, roll: 0, accentHue: null, neutralHue: null };
      const colours = buildPaletteColours({ ...params, count: opts.count ?? DEFAULT_SEEDS, createId, lockAnchor: true });
      commit((d) => {
        d.palettes = [{ id: createId('palette'), name: 'Palette', colours, source: { kind: 'colour', input: input.trim() }, ...params }];
      });
      set((s) => ({ ui: { ...s.ui, selectedColourId: colours[0].id } }));
      return { ok: true };
    },
    generateFromPrompt: (prompt, count) => {
      const result = interpretPrompt(prompt);
      if (result.status === 'empty') return result;
      const params = {
        anchor: result.anchor, harmony: result.harmony, chromaBias: result.chromaBias, lightnessBias: result.lightnessBias,
        roll: 0, accentHue: result.accentHue, neutralHue: result.neutralHue,
      };
      const colours = buildPaletteColours({ ...params, count: count ?? DEFAULT_SEEDS, createId });
      commit((d) => {
        d.palettes = [{
          id: createId('palette'), name: 'Palette', colours,
          source: { kind: 'prompt', input: prompt.trim(), interpreted: result.interpreted, unmatched: result.unmatched },
          ...params,
        }];
      });
      set((s) => ({ ui: { ...s.ui, selectedColourId: colours[0].id } }));
      return result;
    },
    generateFromBrief: async (prompt, count) => {
      const outcome = await interpretBrief(prompt.trim());
      if (outcome.kind === 'ai') {
        const colours = buildPaletteColours({ ...outcome.params, count: count ?? DEFAULT_SEEDS, createId });
        commit((d) => {
          d.palettes = [{
            id: createId('palette'), name: 'Palette', colours,
            source: { kind: 'prompt', input: prompt.trim(), brief: outcome.record },
            anchor: outcome.params.anchor, harmony: outcome.params.harmony, chromaBias: outcome.params.chromaBias,
            lightnessBias: outcome.params.lightnessBias, roll: 0, accentHue: outcome.params.accentHue ?? null,
            neutralHue: outcome.params.neutralHue ?? null, excludedHues: outcome.params.excludedHues,
            accentLightnessOffset: outcome.params.accentLightnessOffset,
          }];
        });
        set((s) => ({ ui: { ...s.ui, selectedColourId: colours[0].id } }));
        return { status: 'ok', mode: 'ai' };
      }
      // AI not available: use the existing keyword interpreter and say so.
      const result = get().generateFromPrompt(prompt, count);
      if (result.status === 'empty') return { status: 'empty', mode: 'fallback', fallbackReason: outcome.reason };
      const brief: BriefRecord = {
        originalPrompt: prompt.trim(), refinements: [],
        meta: { mode: 'fallback', schemaVersion: INTERPRETATION_SCHEMA_VERSION, dbVersion: VIBE_DB_VERSION, cached: false, fallbackReason: outcome.reason },
      };
      set((s) => ({ project: produce(s.project, (d) => { if (d.palettes[0]) d.palettes[0].source.brief = brief; }) }));
      return { status: 'ok', mode: 'fallback', fallbackReason: outcome.reason, unmatched: result.unmatched };
    },
    refineBrief: async (refinement) => {
      const p = palette();
      const brief = p?.source.brief;
      const text = refinement.trim();
      if (!p || !brief || !text) return { status: 'unchanged', reason: 'There is no brief to refine yet.' };

      const applyParams = (params: ReturnType<typeof seedParamsOf>, source: Palette['source']) =>
        commit((d) => {
          const dp = d.palettes[0];
          Object.assign(dp, {
            anchor: params.anchor, harmony: params.harmony, chromaBias: params.chromaBias, lightnessBias: params.lightnessBias,
            accentHue: params.accentHue ?? null, neutralHue: params.neutralHue ?? null,
            excludedHues: params.excludedHues, accentLightnessOffset: params.accentLightnessOffset, source,
          });
          // Locked colours are untouched; everything else follows the refined targets.
          dp.colours = rederiveUnlocked(current(dp));
          syncLinkedFamilies(d);
        });

      if (brief.interpretation && brief.targets) {
        const outcome = await interpretBrief(text, { originalPrompt: brief.originalPrompt, refinements: brief.refinements, previous: brief.interpretation, targets: brief.targets });
        // The palette came from an AI reading; re-reading the whole conversation with keywords would discard that context.
        if (outcome.kind !== 'ai') return { status: 'unchanged', reason: `${outcome.reason} The palette was left as it is.` };
        applyParams({ ...outcome.params, roll: p.roll }, { ...p.source, brief: outcome.record });
        return { status: 'ok', mode: 'refined' };
      }

      // Fallback-mode brief: re-run the keyword interpreter over the original brief plus every refinement.
      const refinements = [...brief.refinements, text];
      const result = interpretPrompt([brief.originalPrompt, ...refinements].join('. '));
      if (result.status === 'empty') return { status: 'unchanged', reason: 'The keyword fallback didn’t recognise anything in that refinement.' };
      applyParams(
        { anchor: result.anchor, harmony: result.harmony, chromaBias: result.chromaBias, lightnessBias: result.lightnessBias, roll: p.roll, accentHue: result.accentHue, neutralHue: result.neutralHue },
        { ...p.source, interpreted: result.interpreted, unmatched: result.unmatched, brief: { ...brief, refinements } },
      );
      return { status: 'ok', mode: 'fallback', fallbackReason: brief.meta.fallbackReason, unmatched: result.unmatched };
    },
    setHarmony: (harmony) => {
      if (!palette() || palette()!.harmony === harmony) return;
      commit((d) => {
        const p = d.palettes[0];
        p.harmony = harmony;
        p.colours = rederiveUnlocked(current(p));
        syncLinkedFamilies(d);
      });
    },
    regenerateUnlocked: () => {
      const p = palette();
      if (!p) return 0;
      const unlocked = p.colours.filter((c) => !c.locked).length;
      if (unlocked === 0) return 0;
      commit((d) => {
        const dp = d.palettes[0];
        dp.roll += 1;
        dp.colours = rederiveUnlocked(current(dp));
        syncLinkedFamilies(d);
      });
      return unlocked;
    },
    updateColour: (id, oklch) => {
      commit((d) => {
        const p = d.palettes[0];
        const i = p?.colours.findIndex((c) => c.id === id) ?? -1;
        if (i === -1) return;
        const old = current(p.colours[i]);
        const next = makeColour(oklch, { id, name: old.name, locked: old.locked, familyId: old.familyId });
        p.colours[i] = { ...next, role: old.role, accentIndex: old.accentIndex };
        // Editing the primary moves the harmony anchor with it, so later regenerations follow the new colour.
        if (old.role === 'primary') p.anchor = next.oklch;
        syncLinkedFamilies(d);
      }, `colour:${id}`);
    },
    toggleColourLock: (id) =>
      commit((d) => {
        const c = d.palettes[0]?.colours.find((x) => x.id === id);
        if (c) c.locked = !c.locked;
      }),
    moveColour: (id, toIndex) =>
      commit((d) => {
        const list = d.palettes[0]?.colours;
        if (!list) return;
        const from = list.findIndex((c) => c.id === id);
        const to = Math.max(0, Math.min(list.length - 1, toIndex));
        if (from === -1 || from === to) return;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
      }),
    duplicateColour: (id) => {
      const newId = createId('colour');
      commit((d) => {
        const p = d.palettes[0];
        const i = p?.colours.findIndex((c) => c.id === id) ?? -1;
        if (i === -1) return;
        const src = current(p.colours[i]);
        const names = p.colours.map((c) => c.name ?? '');
        const copy: PaletteColour = {
          ...src, id: newId, name: uniqueName(`${src.name ?? 'colour'}-copy`, names), locked: false,
          role: 'accent', accentIndex: p.colours.filter((c) => c.role === 'accent').length,
        };
        delete copy.familyId;
        p.colours.splice(i + 1, 0, copy);
      });
      set((s) => ({ ui: { ...s.ui, selectedColourId: newId } }));
    },
    deleteColour: (id) => {
      commit((d) => {
        const p = d.palettes[0];
        if (!p) return;
        p.colours = p.colours.filter((c) => c.id !== id);
      });
      set((s) => ({ ui: { ...s.ui, selectedColourId: s.ui.selectedColourId === id ? null : s.ui.selectedColourId } }));
    },
    addColour: () => {
      const p = palette();
      if (!p) return;
      const newId = createId('colour');
      commit((d) => {
        const dp = d.palettes[0];
        const accentIndex = dp.colours.filter((c) => c.role === 'accent').length;
        const names = dp.colours.map((c) => c.name ?? '');
        const probe = { ...current(dp), colours: [{ ...current(dp.colours[0]), id: newId, locked: false, role: 'accent' as const, accentIndex, name: uniqueName('accent', names), familyId: undefined }] };
        const [colour] = rederiveUnlocked(probe);
        delete colour.familyId;
        dp.colours.push(colour);
      });
      set((s) => ({ ui: { ...s.ui, selectedColourId: newId } }));
    },
    renameColour: (id, name) => {
      const p = palette();
      const colour = p?.colours.find((c) => c.id === id);
      if (!p || !colour) return { ok: false, error: 'Colour not found.' };
      const families = get().project.colourFamilies;
      const taken = [
        ...p.colours.filter((c) => c.id !== id).map((c) => c.name ?? ''),
        ...families.filter((f) => f.id !== colour.familyId).map((f) => f.familyName),
      ];
      const check = validateFamilyName(name, taken);
      if (!check.ok) return check;
      if (check.name === colour.name) return { ok: true };
      commit((d) => {
        const c = d.palettes[0].colours.find((x) => x.id === id)!;
        c.name = check.name;
        const fi = d.colourFamilies.findIndex((f) => f.id === c.familyId);
        if (fi !== -1) d.colourFamilies[fi] = regenerate(current(d.colourFamilies[fi]), { name: check.name });
      });
      return { ok: true };
    },

    // ---------- Colour Scales ----------
    createScalesFromPalette: (includeFeedback) => {
      const p = palette();
      const existing = get().project.colourFamilies;
      const pending = (p?.colours ?? []).filter((c) => !c.familyId || !existing.some((f) => f.id === c.familyId));
      const feedback = includeFeedback
        ? (Object.keys(FEEDBACK_SEEDS) as (keyof typeof FEEDBACK_SEEDS)[]).filter(
            (name) => !existing.some((f) => f.familyName === name) && !pending.some((c) => c.name === name),
          )
        : [];
      if (pending.length + feedback.length === 0) return 0;
      let firstId: string | null = null;
      commit((d) => {
        const names = d.colourFamilies.map((f) => f.familyName);
        for (const colour of d.palettes[0]?.colours ?? []) {
          if (!pending.some((c) => c.id === colour.id)) continue;
          const name = uniqueName(colour.name ?? 'colour', names);
          names.push(name);
          const family = newFamily(name, { ...colour.oklch });
          colour.familyId = family.id;
          colour.name = name;
          d.colourFamilies.push(family);
          firstId ??= family.id;
        }
        for (const name of feedback) {
          const family = newFamily(name, FEEDBACK_SEEDS[name]);
          d.colourFamilies.push(family);
          firstId ??= family.id;
        }
      });
      set((s) => ({ ui: { ...s.ui, selectedFamilyId: s.ui.selectedFamilyId ?? firstId, selectedStep: null } }));
      return pending.length + feedback.length;
    },
    addFamily: (name, colourInput) => {
      const check = validateFamilyName(name, get().project.colourFamilies.map((f) => f.familyName));
      if (!check.ok) return check;
      const parsed = parseColour(colourInput);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      const family = newFamily(check.name, parsed.oklch);
      commit((d) => {
        d.colourFamilies.push(family);
      });
      set((s) => ({ ui: { ...s.ui, selectedFamilyId: family.id, selectedStep: null } }));
      return { ok: true };
    },
    deleteFamily: (id) => {
      commit((d) => {
        d.colourFamilies = d.colourFamilies.filter((f) => f.id !== id);
        for (const c of d.palettes[0]?.colours ?? []) if (c.familyId === id) delete c.familyId;
      });
      set((s) => ({
        ui: {
          ...s.ui,
          selectedFamilyId: s.ui.selectedFamilyId === id ? (get().project.colourFamilies[0]?.id ?? null) : s.ui.selectedFamilyId,
          selectedStep: null,
        },
      }));
    },
    renameFamily: (id, name) => {
      const families = get().project.colourFamilies;
      const family = families.find((f) => f.id === id);
      if (!family) return { ok: false, error: 'Family not found.' };
      const linked = palette()?.colours.find((c) => c.familyId === id);
      const taken = [
        ...families.filter((f) => f.id !== id).map((f) => f.familyName),
        ...(palette()?.colours ?? []).filter((c) => c.id !== linked?.id).map((c) => c.name ?? ''),
      ];
      const check = validateFamilyName(name, taken);
      if (!check.ok) return check;
      if (check.name === family.familyName) return { ok: true };
      commit((d) => {
        const i = d.colourFamilies.findIndex((f) => f.id === id);
        d.colourFamilies[i] = regenerate(current(d.colourFamilies[i]), { name: check.name });
        const c = d.palettes[0]?.colours.find((x) => x.familyId === id);
        if (c) c.name = check.name;
      });
      return { ok: true };
    },
    setFamilyBase: (id, oklch) => {
      commit((d) => {
        const i = d.colourFamilies.findIndex((f) => f.id === id);
        if (i === -1) return;
        d.colourFamilies[i] = regenerate(current(d.colourFamilies[i]), { base: oklch });
        // Keep a linked palette colour in step with its family.
        const p = d.palettes[0];
        const ci = p?.colours.findIndex((c) => c.familyId === id) ?? -1;
        if (ci !== -1) {
          const old = current(p.colours[ci]);
          const next = makeColour(oklch, { id: old.id, name: old.name, locked: old.locked, familyId: id });
          p.colours[ci] = { ...next, role: old.role, accentIndex: old.accentIndex };
          if (old.role === 'primary') p.anchor = next.oklch;
        }
      }, `base:${id}`);
      const family = get().project.colourFamilies.find((f) => f.id === id);
      return family ? checkScale(family) : null;
    },
    updateFamilySettings: (id, patch) =>
      commit((d) => {
        const i = d.colourFamilies.findIndex((f) => f.id === id);
        if (i === -1) return;
        const family = current(d.colourFamilies[i]);
        d.colourFamilies[i] = regenerate(family, { settings: { ...family.generationSettings, ...patch } });
      }, `settings:${id}:${Object.keys(patch).join(',')}`),
    regenerateFamily: (id, full) =>
      commit((d) => {
        const i = d.colourFamilies.findIndex((f) => f.id === id);
        if (i === -1) return;
        d.colourFamilies[i] = regenerate(current(d.colourFamilies[i]), { full });
      }),
    editShade: (familyId, step, oklch) => {
      commit((d) => {
        const family = d.colourFamilies.find((f) => f.id === familyId);
        if (!family) return;
        const old = current(family.shades[step]);
        // A hand-edited shade is locked so the next regeneration keeps it.
        family.shades[step] = makeColour(oklch, { id: old.id, name: old.name, familyId, locked: true });
      }, `shade:${familyId}:${step}`);
      const family = get().project.colourFamilies.find((f) => f.id === familyId);
      return family ? checkScale(family) : null;
    },
    toggleShadeLock: (familyId, step) =>
      commit((d) => {
        const i = d.colourFamilies.findIndex((f) => f.id === familyId);
        const shade = d.colourFamilies[i]?.shades[step];
        if (!shade) return;
        shade.locked = !shade.locked;
        // Unlocking hands the shade back to the generator, so it returns to its generated value.
        if (!shade.locked) d.colourFamilies[i] = regenerate(current(d.colourFamilies[i]), {});
      }),

    setExportSettings: (patch) =>
      commit((d) => {
        d.exportSettings = { ...d.exportSettings, ...patch };
      }),
  };
});

// ---- persistence wiring: save shortly after every project change ----
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProjectStore.subscribe((state, previous) => {
  if (state.project === previous.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    useProjectStore.getState().markSaved(saveProject(useProjectStore.getState().project));
  }, 250);
});

export const selectPalette = (s: StoreState) => s.project.palettes[0] as Palette | undefined;
export const selectFamilies = (s: StoreState) => s.project.colourFamilies;
