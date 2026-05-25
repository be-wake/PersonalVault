import { Label } from './ui/label';
import { Input } from './ui/input';

interface FormFieldProps {
  id:          string;
  label:       string;
  type?:       string;
  placeholder?: string;
  value:       string;
  onChange:    (value: string) => void;
  required?:   boolean;
  autoComplete?: string;
  inputMode?:  React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?:  number;
  style?:      React.CSSProperties;
  error?:      boolean;
}

/** Label + Input pair used in every vault edit form. */
export default function FormField({
  id, label, type = 'text', placeholder, value, onChange,
  required, autoComplete, inputMode, maxLength, style, error,
}: FormFieldProps) {
  return (
    <div className="form-group">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        style={style}
        error={error}
      />
    </div>
  );
}
