import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type CutlineSelectOption = {
  value: string;
  label: string;
};

type CutlineSelectProps = {
  id?: string;
  'aria-label'?: string;
  'data-testid'?: string;
  value: string;
  options: CutlineSelectOption[];
  disabled?: boolean;
  className?: string;
  onValueChange: (value: string) => void;
};

export default function CutlineSelect({
  id,
  'aria-label': ariaLabel,
  'data-testid': testId,
  value,
  options,
  disabled,
  className,
  onValueChange,
}: CutlineSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        data-testid={testId}
        className={['cutline-select-trigger', className].filter(Boolean).join(' ')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="cutline-select-content">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="cutline-select-item"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
