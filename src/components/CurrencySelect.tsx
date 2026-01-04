import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CurrencySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export function CurrencySelect({ value, onValueChange, className }: CurrencySelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className || "w-24"}>
        <SelectValue placeholder="العملة" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SYP">ل.س</SelectItem>
        <SelectItem value="USD">$</SelectItem>
      </SelectContent>
    </Select>
  );
}

export const formatCurrency = (amount: number | null | undefined, currency: string = 'SYP'): string => {
  if (amount === null || amount === undefined) return '0';
  const formattedAmount = Math.round(amount).toLocaleString('en-US');
  return currency === 'USD' ? `$${formattedAmount}` : `${formattedAmount} ل.س`;
};

export const getCurrencySymbol = (currency: string): string => {
  return currency === 'USD' ? '$' : 'ل.س';
};
