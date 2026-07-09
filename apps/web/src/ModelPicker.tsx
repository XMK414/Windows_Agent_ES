import { PROVIDERS, modelsFor, defaultModelFor, CUSTOM_MODEL, PROVIDER_MAP } from "./models";

interface Props {
  adapterId: string;
  model: string;
  onChange: (patch: { adapterId?: string; model?: string }) => void;
  disabled?: boolean;
  /** Hide the provider dropdown when the surface fixes the provider elsewhere. */
  showProvider?: boolean;
  className?: string;
}

/**
 * Provider + model selector shared by the round table and Board of Directors
 * (and available to the chat panes) so a model is always *picked from a list*
 * rather than typed. For OpenRouter, whose catalogue is too large to enumerate,
 * the model dropdown also offers a "Custom…" option that reveals a free-text
 * field for any other OpenRouter model id.
 */
export function ModelPicker({ adapterId, model, onChange, disabled, showProvider = true, className }: Props) {
  const provider = PROVIDER_MAP[adapterId];
  const options = modelsFor(adapterId);
  const allowCustom = Boolean(provider?.allowCustomModel);
  const isKnown = options.some((m) => m.id === model);
  const isCustom = allowCustom && !isKnown;

  function changeProvider(nextAdapter: string) {
    onChange({ adapterId: nextAdapter, model: defaultModelFor(nextAdapter) });
  }

  function changeModel(value: string) {
    if (value === CUSTOM_MODEL) {
      onChange({ model: "" });
    } else {
      onChange({ model: value });
    }
  }

  return (
    <>
      {showProvider && (
        <select
          className="waes-select"
          value={adapterId}
          onChange={(e) => changeProvider(e.target.value)}
          disabled={disabled}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}

      <select
        className={className ?? "waes-select"}
        value={isCustom ? CUSTOM_MODEL : model}
        onChange={(e) => changeModel(e.target.value)}
        disabled={disabled}
      >
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        {allowCustom && <option value={CUSTOM_MODEL}>Custom model id…</option>}
      </select>

      {isCustom && (
        <input
          className="waes-input"
          placeholder="e.g. cohere/command-r-plus"
          value={model}
          onChange={(e) => onChange({ model: e.target.value })}
          disabled={disabled}
          style={{ width: 200 }}
        />
      )}
    </>
  );
}
