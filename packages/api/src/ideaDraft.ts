import type { IdeaAction, IdeaDraft, IdeaDraftState, IdeaSlider } from "./types";

export const IDEA_SCHEMA_VERSION = 3 as const;

const DEFAULT_IDEA_ACTIONS: [IdeaAction, IdeaAction, IdeaAction] = [
  { id: "action1", label: "Action 1", mock: "none" },
  { id: "action2", label: "Action 2", mock: "none" },
  { id: "action3", label: "Action 3", mock: "none" },
];

const DEFAULT_IDEA_SLIDERS: [IdeaSlider, IdeaSlider, IdeaSlider] = [
  { id: "slider1", label: "Slider 1", min: 0, max: 100, step: 1, value: 50 },
  { id: "slider2", label: "Slider 2", min: 0, max: 100, step: 1, value: 50 },
  { id: "slider3", label: "Slider 3", min: 0, max: 100, step: 1, value: 50 },
];

export function defaultIdeaDraftState(): IdeaDraftState {
  return {
    version: 1,
    actions: DEFAULT_IDEA_ACTIONS.map(action => ({ ...action })) as IdeaDraftState["actions"],
    sliders: DEFAULT_IDEA_SLIDERS.map(slider => ({ ...slider })) as IdeaDraftState["sliders"],
  };
}

export function sliderRecord(sliders: IdeaSlider[]): Record<string, number> {
  return Object.fromEntries(sliders.map(slider => [slider.id, slider.value]));
}

function emptyExampleSource(sliders: IdeaSlider[] = DEFAULT_IDEA_SLIDERS): string {
  return `const SLIDERS = ${JSON.stringify(sliderRecord(sliders))};

export function Example({ sliders = SLIDERS }: { sliders?: Record<string, number> } = {}) {
  return null;
}
`;
}

export function defaultIdeaDraft(): IdeaDraft {
  const state = defaultIdeaDraftState();
  return {
    ...state,
    portableSourceTemplate: emptyExampleSource(state.sliders),
  };
}

const SLIDERS_BLOCK = /const SLIDERS = \{[\s\S]*?\};/;

export function bakeSliders(source: string, sliders: IdeaSlider[]): string {
  const next = `const SLIDERS = ${JSON.stringify(sliderRecord(sliders))};`;
  if (SLIDERS_BLOCK.test(source)) return source.replace(SLIDERS_BLOCK, next);
  return `${next}\n\n${source}`;
}
