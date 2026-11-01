import { subDays, startOfDay, endOfDay } from "date-fns";

export type DateRange = {
  from: Date;
  to: Date;
};

export function getDefaultDateRange(): DateRange {
  return {
    from: startOfDay(subDays(new Date(), 7)),
    to: endOfDay(new Date()),
  };
}
