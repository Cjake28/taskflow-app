import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IMAGE_LIMITS, type ImageDto, type TaskDetailsDto } from '@taskflow/shared';
import { ImageMinus, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ImageDropzone } from '@/components/images/image-dropzone';
import { ImageGallery } from '@/components/images/image-gallery';
import { imageAlt } from '@/components/images/image-utils';
import { Lightbox } from '@/components/images/lightbox';
import { UploadQueue } from '@/components/images/upload-queue';
import { useUploadQueue } from '@/components/images/use-upload-queue';
import { getErrorMessage } from '@/lib/api-client';
import { invalidateTaskData } from '@/lib/query-keys';

import { tasksApi } from '../api';
import { setTaskImages } from '../cache';

/**
 * Images card on task details (spec §14.8): gallery + lightbox, drop / browse / paste uploads with
 * per-file progress, and removal with an Undo toast.
 */
export function TaskImages({ task }: { task: TaskDetailsDto }) {
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<{ image: ImageDto; index: number } | null>(null);
  const [shownRemoval, setShownRemoval] = useState(removing);
  if (removing && removing !== shownRemoval) setShownRemoval(removing);

  const queue = useUploadQueue({
    concurrency: 2,
    removeDoneAfterMs: 1600,
    onUploaded: (images, _item, taskId) =>
      setTaskImages(queryClient, taskId, (current) => [...current, ...images]),
  });

  // Refresh lists, counts and the activity feed once a batch of uploads has settled.
  const { isUploading } = queue;
  const wasUploading = useRef(false);
  useEffect(() => {
    if (wasUploading.current && !isUploading) void invalidateTaskData(queryClient);
    wasUploading.current = isUploading;
  }, [isUploading, queryClient]);

  const images = task.images;
  const slotsLeft = IMAGE_LIMITS.perTask - images.length;
  const { store } = queue;
  const onFiles = useCallback(
    (files: File[]) => store.add(files, slotsLeft, task.id),
    [store, slotsLeft, task.id],
  );

  const restore = async (image: ImageDto) => {
    try {
      const restored = await tasksApi.restoreImage(task.id, image.id);
      setTaskImages(queryClient, task.id, (current) => [...current, restored]);
      toast.success('Image restored', { description: imageAlt(image, 0) });
    } catch (error) {
      toast.error("Couldn't restore the image", { description: getErrorMessage(error) });
    } finally {
      void invalidateTaskData(queryClient);
    }
  };

  const remove = async () => {
    if (!removing) return;
    const { image, index } = removing;
    try {
      await tasksApi.removeImage(task.id, image.id);
    } catch (error) {
      toast.error("Couldn't remove the image", { description: getErrorMessage(error) });
      throw error;
    }
    setTaskImages(queryClient, task.id, (current) => current.filter((i) => i.id !== image.id));
    void invalidateTaskData(queryClient);
    toast('Image removed', {
      description: imageAlt(image, index),
      icon: <ImageMinus className="size-4" />,
      duration: 8000,
      action: {
        label: (
          <span className="inline-flex items-center gap-1">
            <Undo2 aria-hidden="true" className="size-3.5" />
            Undo
          </span>
        ),
        onClick: () => void restore(image),
      },
    });
  };

  return (
    <section
      aria-labelledby="task-images-heading"
      className="rounded-card bg-card p-[22px] shadow-card"
    >
      <div className="mb-3.5 flex items-center gap-2.5">
        <h2 id="task-images-heading" className="text-base font-extrabold">
          Images
        </h2>
        <span className="rounded-full bg-fill px-2 py-0.5 text-xs font-bold text-muted-foreground tabular-nums">
          {images.length} / {IMAGE_LIMITS.perTask}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        <ImageGallery
          images={images}
          onOpen={setViewing}
          onRemove={(image, index) => setRemoving({ image, index })}
        />
        <ImageDropzone
          slotsLeft={slotsLeft - queue.uploadingCount}
          compact={images.length > 0}
          onFiles={onFiles}
        />
        <UploadQueue
          items={queue.items}
          onRetry={(id) => void store.retry(id)}
          onRemove={(id) => store.remove(id)}
        />
      </div>

      <Lightbox
        images={images}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
        onReturnFocus={(index) =>
          document.querySelector<HTMLElement>(`[data-gallery-index="${index}"]`)?.focus()
        }
        onRemove={(image, index) => {
          setViewing(null);
          setRemoving({ image, index });
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this image?"
        description={
          <>
            “
            <b className="font-bold text-foreground">
              {shownRemoval ? imageAlt(shownRemoval.image, shownRemoval.index) : ''}
            </b>
            ” will be removed from this task. You can undo this right after.
          </>
        }
        confirmLabel="Remove image"
        icon={ImageMinus}
        onConfirm={remove}
      />
    </section>
  );
}
