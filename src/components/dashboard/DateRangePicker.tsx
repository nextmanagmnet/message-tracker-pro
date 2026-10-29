import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ar } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DateRange = {
  from: Date;
  to: Date;
};

type PresetValue = "7d" | "14d" | "30d" | "90d" | "custom";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const presets = ["7d", "14d", "30d", "90d", "custom"] as const;

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { t, i18n } = useTranslation("features");
  const locale = i18n.language === "ar" ? { locale: ar } : undefined;
  const [preset, setPreset] = useState<PresetValue>("7d");
  const [isOpen, setIsOpen] = useState(false);

  const handlePresetChange = (newPreset: PresetValue) => {
    setPreset(newPreset);
    
    if (newPreset !== "custom") {
      const days = parseInt(newPreset.replace("d", ""));
      onChange({
        from: startOfDay(subDays(new Date(), days)),
        to: endOfDay(new Date()),
      });
    }
  };

  const handleDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setPreset("custom");
      onChange({
        from: startOfDay(range.from),
        to: endOfDay(range.to),
      });
    } else if (range?.from) {
      setPreset("custom");
      onChange({
        from: startOfDay(range.from),
        to: endOfDay(range.from),
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetValue)}>
        <SelectTrigger className="w-[140px] bg-secondary border-border">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`dateRange.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "justify-start text-start font-normal",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="w-4 h-4 me-2" />
            {value.from ? (
              value.to ? (
                <>
                  {format(value.from, "MMM d", locale)} - {format(value.to, "MMM d, yyyy", locale)}
                </>
              ) : (
                format(value.from, "MMM d, yyyy", locale)
              )
            ) : (
              <span>{t("dateRange.pick")}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={{ from: value.from, to: value.to }}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function getDefaultDateRange(): DateRange {
  return {
    from: startOfDay(subDays(new Date(), 7)),
    to: endOfDay(new Date()),
  };
}
