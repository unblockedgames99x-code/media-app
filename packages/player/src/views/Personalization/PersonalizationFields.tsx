import { FC, ReactNode, useEffect, useId, useState } from 'react';

const inputClass =
  'bg-input text-input-foreground border-border w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export const FieldGroup: FC<{
  title: string;
  description?: string;
  children: ReactNode;
}> = ({ title, description, children }) => (
  <fieldset className="border-border min-w-0 space-y-4 rounded-lg border p-4">
    <legend className="px-2 text-base font-bold">{title}</legend>
    {description && (
      <p className="text-muted-foreground text-sm">{description}</p>
    )}
    {children}
  </fieldset>
);

export const TextField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}> = ({ label, value, onChange, maxLength, placeholder }) => {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </div>
  );
};

export const SelectField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ label, value, onChange, options }) => {
  const fieldId = useId();
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" htmlFor={fieldId}>
        {label}
      </label>
      <select
        id={fieldId}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export const RangeField: FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 1, suffix = '', onChange }) => {
  const fieldId = useId();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold" htmlFor={fieldId}>
          {label}
        </label>
        <output
          htmlFor={fieldId}
          className="text-muted-foreground font-mono text-xs"
        >
          {value}
          {suffix}
        </output>
      </div>
      <input
        id={fieldId}
        className="accent-primary w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
};

export const ToggleField: FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold">
    <span>{label}</span>
    <input
      className="accent-primary size-4 shrink-0"
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
);

export const ColorField: FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  const fieldId = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold" htmlFor={fieldId}>
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          className="border-border h-9 w-12 shrink-0 cursor-pointer rounded border bg-transparent p-1"
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className={`${inputClass} font-mono`}
          aria-label={`${label} hex`}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (/^#[0-9a-fA-F]{6}$/.test(next)) {
              onChange(next);
            }
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  );
};

export const actionClass =
  'border-border bg-card hover:bg-primary hover:text-primary-foreground rounded-md border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50';
