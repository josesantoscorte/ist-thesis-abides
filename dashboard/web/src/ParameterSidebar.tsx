import { useMemo, useState } from "react";
import { Bot, ChevronDown, Dices, Landmark, Layers, Lock, RotateCcw, SlidersHorizontal, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import {
  PARAM_SECTIONS,
  PRESET_LIST,
  type ParamFieldMeta,
  paramsMatchPreset,
  presetConfigs,
  randomSeed,
  type PresetKey
} from "./simulationConfig";
import type { SimulationParams } from "./types";
import { UiIcon } from "./ui/icons";
import "./parameter-sidebar.css";

const SECTION_ICONS: Record<string, LucideIcon> = {
  scale: Users,
  automation: Bot,
  policy: Landmark
};

type Props = {
  params: SimulationParams;
  selectedPreset: PresetKey;
  onPresetChange: (preset: PresetKey) => void;
  onParamsChange: (params: SimulationParams) => void;
  disabled?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatFieldDisplay(field: ParamFieldMeta, value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (field.kind === "rate") return `${(value * 100).toFixed(1)}%`;
  if (field.kind === "currency") return `$${value.toLocaleString()}`;
  if (field.kind === "decimal" && Math.abs(value) < 10) return value.toFixed(2);
  return value.toLocaleString();
}

function getSliderFill(field: ParamFieldMeta, value: number): number {
  if (field.max === field.min) return 0;
  return ((value - field.min) / (field.max - field.min)) * 100;
}

function ParamField({
  field,
  value,
  disabled,
  onChange
}: {
  field: ParamFieldMeta;
  value: number | null;
  disabled?: boolean;
  onChange: (next: number | null) => void;
}) {
  const numeric = value === null || Number.isNaN(value) ? null : Number(value);
  const step = field.step ?? (field.kind === "integer" || field.kind === "currency" ? 1 : 0.01);

  const setNumeric = (raw: number) => {
    const next = clamp(raw, field.min, field.max);
    onChange(field.key === "seed" ? Math.round(next) : next);
  };

  if (field.key === "seed") {
    return (
      <div className="param-field">
        <div className="param-field-head">
          <span className="param-label">{field.label}</span>
        </div>
        {field.hint && <p className="param-hint">{field.hint}</p>}
        <div className="param-seed-row">
          <input
            className="param-input"
            type="number"
            min={field.min}
            max={field.max}
            step={1}
            value={numeric ?? ""}
            placeholder="Auto"
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                onChange(null);
                return;
              }
              const parsed = Number(raw);
              if (!Number.isNaN(parsed)) setNumeric(parsed);
            }}
          />
          <button
            type="button"
            className="param-aux-btn"
            disabled={disabled}
            onClick={() => onChange(randomSeed())}
            title="Generate random seed"
          >
            <UiIcon icon={Dices} size="sm" />
          </button>
        </div>
      </div>
    );
  }

  if (field.kind === "rate" || field.kind === "decimal") {
    const sliderValue = numeric ?? field.min;
    const sliderFill = `${clamp(getSliderFill(field, sliderValue), 0, 100)}%`;
    const sliderStyle = { ["--slider-fill" as string]: sliderFill } as CSSProperties;
    return (
      <div className="param-field">
        <div className="param-field-head">
          <span className="param-label">{field.label}</span>
        </div>
        {field.hint && <p className="param-hint">{field.hint}</p>}
        <div className="param-slider-row">
          <input
            className="param-slider"
            type="range"
            min={field.min}
            max={field.max}
            step={step}
            value={sliderValue}
            style={sliderStyle}
            disabled={disabled}
            onChange={(e) => setNumeric(Number(e.target.value))}
          />
          <input
            className="param-input param-input--compact"
            type="number"
            min={field.min}
            max={field.max}
            step={step}
            value={numeric ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") return;
              const parsed = Number(raw);
              if (!Number.isNaN(parsed)) setNumeric(parsed);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="param-field">
      <div className="param-field-head">
        <span className="param-label">{field.label}</span>
      </div>
      {field.hint && <p className="param-hint">{field.hint}</p>}
      <input
        className="param-input"
        type="number"
        min={field.min}
        max={field.max}
        step={step}
        value={numeric ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return;
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) setNumeric(parsed);
        }}
      />
    </div>
  );
}

export function ParameterSidebar({ params, selectedPreset, onPresetChange, onParamsChange, disabled }: Props) {
  const [presetOpen, setPresetOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PARAM_SECTIONS.map((s) => [s.id, true]))
  );

  const isModified = useMemo(() => !paramsMatchPreset(params, selectedPreset), [params, selectedPreset]);
  const activePreset = PRESET_LIST.find((preset) => preset.key === selectedPreset);
  const policyPresets = PRESET_LIST.filter((preset) => preset.group === "policy");
  const stressPresets = PRESET_LIST.filter((preset) => preset.group === "stress");

  const applyPreset = (preset: PresetKey) => {
    onPresetChange(preset);
    onParamsChange({ ...presetConfigs[preset] });
  };

  const resetToPreset = () => {
    onParamsChange({ ...presetConfigs[selectedPreset] });
  };

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePresetSection = () => {
    setPresetOpen((prev) => !prev);
  };

  const patchParam = (key: keyof SimulationParams, value: number | null) => {
    onParamsChange({ ...params, [key]: value });
  };

  return (
    <aside className="config-sidebar" aria-label="Simulation configuration">
      <header className="config-sidebar-header">
        <div>
          <h2 className="config-sidebar-title">
            <UiIcon icon={SlidersHorizontal} />
            Configuration
          </h2>
        </div>
        {isModified ? <span className="config-modified-badge">Custom</span> : <span className="config-fixed-badge"><Lock size={11} /> Fixed preset</span>}
      </header>

      <section className="config-section config-section--collapsible config-section--preset">
        <button
          type="button"
          className="config-section-toggle"
          aria-expanded={presetOpen}
          onClick={togglePresetSection}
        >
          <span className="config-section-toggle-main">
            <UiIcon icon={Layers} />
            <span>
              <span className="config-section-title">Scenario presets</span>
            </span>
          </span>
          <ChevronDown className={`config-chevron ${presetOpen ? "config-chevron--open" : ""}`} size={16} aria-hidden />
        </button>
        {presetOpen && (
          <div className="preset-groups">
            <div className="preset-group">
              <div className="preset-group-head">
                <span className="preset-group-title">Policy scenarios</span>
                <span className="preset-group-copy">Meaningful starting points for the model.</span>
              </div>
              <div className="preset-grid" role="listbox" aria-label="Policy scenario presets">
                {policyPresets.map((preset) => {
                  const active = preset.key === selectedPreset;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "preset-card preset-card--active" : "preset-card"}
                      disabled={disabled}
                      onClick={() => applyPreset(preset.key)}
                    >
                      <span className="preset-card-top">
                        <span className="preset-card-label">{preset.label}</span>
                        {preset.badge && <span className="preset-card-badge">{preset.badge}</span>}
                      </span>
                      <span className="preset-card-desc">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="preset-group preset-group--stress">
              <div className="preset-group-head">
                <span className="preset-group-title">Stress tests</span>
                <span className="preset-group-copy">Load-oriented runs for dashboard and messaging pressure.</span>
              </div>
              <div className="preset-grid" role="listbox" aria-label="Stress test presets">
                {stressPresets.map((preset) => {
                  const active = preset.key === selectedPreset;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={active ? "preset-card preset-card--active" : "preset-card"}
                      disabled={disabled}
                      onClick={() => applyPreset(preset.key)}
                    >
                      <span className="preset-card-top">
                        <span className="preset-card-label">{preset.label}</span>
                        {preset.badge && <span className="preset-card-badge">{preset.badge}</span>}
                      </span>
                      <span className="preset-card-desc">{preset.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="config-divider" />

      <div className="config-scroll">
        {PARAM_SECTIONS.map((section) => {
          const open = expanded[section.id] !== false;
          const SectionIcon = SECTION_ICONS[section.id] ?? SlidersHorizontal;
          return (
            <section key={section.id} className="config-section config-section--collapsible">
              <button
                type="button"
                className="config-section-toggle"
                aria-expanded={open}
                onClick={() => toggleSection(section.id)}
              >
                <span className="config-section-toggle-main">
                  <UiIcon icon={SectionIcon} />
                  <span>
                    <span className="config-section-title">{section.title}</span>
                    <span className="config-section-desc">{section.description}</span>
                  </span>
                </span>
                <ChevronDown className={`config-chevron ${open ? "config-chevron--open" : ""}`} size={16} aria-hidden />
              </button>
              {open && (
                <div className="param-fields">
                  {section.fields.map((field) => (
                    <ParamField
                      key={String(field.key)}
                      field={field}
                      value={params[field.key] as number | null}
                      disabled={disabled}
                      onChange={(next) => patchParam(field.key, next)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="config-sidebar-footer">
        <button
          type="button"
          className="config-footer-btn"
          disabled={disabled || !isModified}
          onClick={resetToPreset}
        >
          <UiIcon icon={RotateCcw} size="sm" />
          Reset to preset
        </button>
      </footer>
    </aside>
  );
}
