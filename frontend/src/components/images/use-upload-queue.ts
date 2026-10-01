import { useEffect, useState, useSyncExternalStore } from 'react';

import { UploadQueueStore, type UploadQueueOptions } from './upload-queue-store';

/**
 * Local upload queue state (spec §14.4): files, previews, progress and errors live in the
 * component that owns the queue. Previews are revoked when it unmounts.
 */
export function useUploadQueue(options: UploadQueueOptions = {}) {
  const { onUploaded, ...config } = options;
  const [store] = useState(() => new UploadQueueStore(config));
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.setOnUploaded(onUploaded);
  }, [store, onUploaded]);

  useEffect(() => () => store.dispose(), [store]);

  const inFlight = items.filter(
    (item) =>
      item.status === 'queued' || item.status === 'uploading' || item.status === 'processing',
  ).length;
  const readyCount = items.filter((item) => item.status === 'ready').length;

  return {
    store,
    items,
    /** Items picked in the create dialog that will upload after the task exists. */
    readyCount,
    uploadingCount: inFlight,
    /** Image slots these files will take once uploaded (picked, waiting or uploading). */
    slotsUsed: readyCount + inFlight,
    failedCount: items.filter((item) => item.status === 'error').length,
    isUploading: inFlight > 0,
  };
}

export type UploadQueueHandle = ReturnType<typeof useUploadQueue>;
