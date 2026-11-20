/** What decides whether an announcement or a banner shows (FER-020). */
export interface HomeSchedule {
  /** The last day it shows, `YYYY-MM-DD`, or `null` for no end. */
  endsOn: string | null;
  isActive: boolean;
  /** The first day it shows, `YYYY-MM-DD`, or `null` for now. */
  startsOn: string | null;
}

/**
 * Where something stands on `today` (a business day, `YYYY-MM-DD`): `off`
 * when its switch is off, `scheduled` before its first day, `ended` after
 * its last, else `showing`. Both days count. Days written `YYYY-MM-DD`
 * compare as text in calendar order.
 */
export type HomeScheduleStatus = "ended" | "off" | "scheduled" | "showing";

export function scheduleStatus(
  { endsOn, isActive, startsOn }: HomeSchedule,
  today: string
): HomeScheduleStatus {
  if (!isActive) {
    return "off";
  }

  if (startsOn !== null && today < startsOn) {
    return "scheduled";
  }

  if (endsOn !== null && today > endsOn) {
    return "ended";
  }

  return "showing";
}

/** Whether it shows on the storefront on `today`. */
export function isShowing(item: HomeSchedule, today: string): boolean {
  return scheduleStatus(item, today) === "showing";
}
