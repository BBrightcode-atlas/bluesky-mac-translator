interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (v: T) => void;
  id?: string;
}

export function LanguageSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  id = 'lang',
}: Props<T>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
