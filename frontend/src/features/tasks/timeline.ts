import type { ActivityDto } from '@taskflow/shared';

/** Uploads within this window read as one "Added N images" entry. */
const IMAGE_BURST_MS = 5 * 60 * 1000;

function imageCount(activity: ActivityDto): number {
  const images = activity.changes?.images;
  const count =
    typeof images === 'object' && images !== null ? Number((images as { count?: unknown }).count) : 1;
  return Number.isFinite(count) && count > 0 ? count : 1;
}

/**
 * Images upload one file per request (for per-file progress), so a batch creates several
 * IMAGE_ADDED rows. Adjacent ones close in time are merged for the timeline. Input and output are
 * newest first.
 */
export function coalesceActivities(activities: readonly ActivityDto[]): ActivityDto[] {
  const result: ActivityDto[] = [];
  for (const activity of activities) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.action === 'IMAGE_ADDED' &&
      activity.action === 'IMAGE_ADDED' &&
      Math.abs(Date.parse(previous.createdAt) - Date.parse(activity.createdAt)) <= IMAGE_BURST_MS
    ) {
      result[result.length - 1] = {
        ...previous,
        changes: { images: { count: imageCount(previous) + imageCount(activity) } },
      };
      continue;
    }
    result.push(activity);
  }
  return result;
}
