import type { SimulationParams } from "./types";

export type PresetKey =
  | "baseline"
  | "high-automation"
  | "high-tax"
  | "stress-medium"
  | "stress-high"
  | "stress-extreme";

export const defaultParams: SimulationParams = {
  seed: null,
  households: 120,
  firms: 15,
  months: 18,
  wake_hours: 24,
  automation_adoption_rate: 0.02,
  task_substitution_elasticity: 0.3,
  productivity_gain_factor: 0.45,
  labor_displacement_lag: 3,
  income_tax_rate: 0.18,
  unemployment_support: 9000,
  retraining_subsidy: 0.03,
  neutral_rate: 0.02
};

export const presetConfigs: Record<PresetKey, SimulationParams> = {
  baseline: defaultParams,
  "high-automation": {
    ...defaultParams,
    automation_adoption_rate: 0.07,
    task_substitution_elasticity: 0.55,
    productivity_gain_factor: 0.85,
    labor_displacement_lag: 2
  },
  "high-tax": {
    ...defaultParams,
    income_tax_rate: 0.35,
    unemployment_support: 14000,
    retraining_subsidy: 0.08,
    neutral_rate: 0.025
  },
  "stress-medium": {
    ...defaultParams,
    households: 1000,
    firms: 120,
    months: 24,
    wake_hours: 2,
    automation_adoption_rate: 0.06,
    task_substitution_elasticity: 0.75,
    productivity_gain_factor: 0.9,
    labor_displacement_lag: 1,
    income_tax_rate: 0.22,
    unemployment_support: 11000,
    retraining_subsidy: 0.06,
    neutral_rate: 0.025
  },
  "stress-high": {
    ...defaultParams,
    households: 2500,
    firms: 300,
    months: 30,
    wake_hours: 1,
    automation_adoption_rate: 0.08,
    task_substitution_elasticity: 1.0,
    productivity_gain_factor: 1.2,
    labor_displacement_lag: 1,
    income_tax_rate: 0.24,
    unemployment_support: 11500,
    retraining_subsidy: 0.08,
    neutral_rate: 0.028
  },
  "stress-extreme": {
    ...defaultParams,
    households: 5000,
    firms: 600,
    months: 36,
    wake_hours: 1,
    automation_adoption_rate: 0.1,
    task_substitution_elasticity: 1.2,
    productivity_gain_factor: 1.5,
    labor_displacement_lag: 1,
    income_tax_rate: 0.25,
    unemployment_support: 12000,
    retraining_subsidy: 0.1,
    neutral_rate: 0.03
  }
};

export type PresetMeta = {
  key: PresetKey;
  label: string;
  description: string;
  badge?: string;
  group: "policy" | "stress";
};

export const PRESET_LIST: PresetMeta[] = [
  {
    key: "baseline",
    label: "Baseline",
    description: "Default balanced economy for quick runs.",
    group: "policy"
  },
  {
    key: "high-automation",
    label: "High automation",
    description: "Faster adoption and stronger productivity shocks.",
    group: "policy"
  },
  {
    key: "high-tax",
    label: "High tax",
    description: "Heavier redistribution and social spending.",
    group: "policy"
  },
  {
    key: "stress-medium",
    label: "Stress · M",
    description: "1k households, 120 firms — moderate load test.",
    badge: "Stress",
    group: "stress"
  },
  {
    key: "stress-high",
    label: "Stress · H",
    description: "2.5k households — heavy parallel messaging.",
    badge: "Stress",
    group: "stress"
  },
  {
    key: "stress-extreme",
    label: "Stress · X",
    description: "5k households — maximum dashboard stress.",
    badge: "Stress",
    group: "stress"
  }
];

export type ParamFieldKind = "integer" | "rate" | "decimal" | "currency";

export type ParamFieldMeta = {
  key: keyof SimulationParams;
  label: string;
  hint?: string;
  kind: ParamFieldKind;
  min: number;
  max: number;
  step?: number;
};

export type ParamSection = {
  id: string;
  title: string;
  description: string;
  fields: ParamFieldMeta[];
};

export const PARAM_SECTIONS: ParamSection[] = [
  {
    id: "scale",
    title: "Simulation scale",
    description: "Agents, horizon, and reproducibility.",
    fields: [
      { key: "households", label: "Households", kind: "integer", min: 1, max: 20000 },
      { key: "firms", label: "Firms", kind: "integer", min: 1, max: 5000 },
      { key: "months", label: "Months", hint: "Simulated calendar length", kind: "integer", min: 1, max: 120 },
      { key: "wake_hours", label: "Wake hours", hint: "Activity window per day", kind: "integer", min: 1, max: 168 },
      { key: "seed", label: "Random seed", hint: "Leave empty for a random seed at launch", kind: "integer", min: 0, max: 4294967295 }
    ]
  },
  {
    id: "automation",
    title: "Automation & labor",
    description: "Technology adoption and displacement dynamics.",
    fields: [
      {
        key: "automation_adoption_rate",
        label: "Adoption rate",
        kind: "rate",
        min: 0,
        max: 1,
        step: 0.01,
        hint: "Share of tasks automated per period"
      },
      {
        key: "task_substitution_elasticity",
        label: "Substitution elasticity",
        kind: "decimal",
        min: 0,
        max: 3,
        step: 0.05
      },
      {
        key: "productivity_gain_factor",
        label: "Productivity gain",
        kind: "decimal",
        min: 0,
        max: 3,
        step: 0.05
      },
      {
        key: "labor_displacement_lag",
        label: "Displacement lag",
        hint: "Months before layoffs materialize",
        kind: "integer",
        min: 1,
        max: 24
      }
    ]
  },
  {
    id: "policy",
    title: "Fiscal & monetary",
    description: "Taxes, transfers, and central-bank stance.",
    fields: [
      { key: "income_tax_rate", label: "Income tax", kind: "rate", min: 0, max: 1, step: 0.01 },
      {
        key: "unemployment_support",
        label: "Unemployment support",
        kind: "integer",
        min: 0,
        max: 1_000_000,
        hint: "Monthly benefit per household (cents)"
      },
      { key: "retraining_subsidy", label: "Retraining subsidy", kind: "rate", min: 0, max: 1, step: 0.01 },
      {
        key: "neutral_rate",
        label: "Neutral policy rate",
        kind: "rate",
        min: -0.1,
        max: 1,
        step: 0.005,
        hint: "Central bank target rate"
      }
    ]
  }
];

export const PARAM_KEYS = Object.keys(defaultParams) as Array<keyof SimulationParams>;

export function paramsMatchPreset(params: SimulationParams, preset: PresetKey): boolean {
  const ref = presetConfigs[preset];
  return PARAM_KEYS.every((key) => params[key] === ref[key]);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * (2 ** 32 - 1));
}
