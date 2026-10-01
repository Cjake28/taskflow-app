import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { UserDto } from '@taskflow/shared';
import { Camera, ImageUp, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Alert } from '@/components/common/alert';
import { Avatar } from '@/components/common/avatar';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/use-auth';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

import { profileApi } from '../api';
import { AVATAR_ACCEPT, avatarFileProblem, formatFileSize } from '../lib/avatar-file';

interface PendingPhoto {
  file: File;
  url: string;
}

/**
 * Profile photo: pick (or drop) an image, preview it at the sizes it is used, then upload.
 * The server crops to a square around the focal point, so there is no crop UI (spec §14.8).
 */
export function AvatarUploader({ user }: { user: UserDto }) {
  const { updateUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  // Kept separate from `pending` so the preview stays visible while the dialog animates out.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Each preview URL is released when it is replaced or the uploader unmounts.
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.url);
  }, [pending]);

  const upload = useMutation({
    mutationFn: profileApi.uploadAvatar,
    onSuccess: (updated) => {
      updateUser(updated);
      setPreviewOpen(false);
      toast.success('Profile photo updated');
    },
  });

  const choose = (file: File | undefined) => {
    if (!file) return;
    const problem = avatarFileProblem(file);
    if (problem) {
      toast.error("That file can't be used", { description: problem });
      return;
    }
    upload.reset();
    setPending({ file, url: URL.createObjectURL(file) });
    setPreviewOpen(true);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    choose(event.target.files?.[0]);
    event.target.value = ''; // picking the same file again should still fire a change
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  };

  const remove = async () => {
    try {
      await profileApi.removeAvatar();
      updateUser({ ...user, avatarUrl: null });
      toast.success('Profile photo removed');
    } catch (error) {
      toast.error("Couldn't remove your photo", { description: getErrorMessage(error) });
      throw error;
    }
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onInputChange}
      />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Change profile photo"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'group relative shrink-0 cursor-pointer rounded-[28px] transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none',
              dragging && 'ring-4 ring-primary/40',
            )}
          >
            <Avatar user={user} size="xl" />
            <span
              aria-hidden="true"
              className="absolute -right-1.5 -bottom-1.5 grid size-9 place-items-center rounded-full bg-card text-foreground shadow-pop ring-4 ring-background transition-colors group-hover:text-primary"
            >
              <Camera className="size-[17px]" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem onSelect={openPicker}>
            <ImageUp aria-hidden="true" />
            {user.avatarUrl ? 'Upload a new photo' : 'Upload a photo'}
          </DropdownMenuItem>
          {user.avatarUrl ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
              <Trash2 aria-hidden="true" />
              Remove photo
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open && !upload.isPending) setPreviewOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Update profile photo</DialogTitle>
            <DialogDescription>
              This is how it will look. We&apos;ll crop it to a square around the subject.
            </DialogDescription>
          </DialogHeader>

          {pending ? (
            <div className="flex flex-col items-center gap-5">
              <div className="flex items-end gap-5">
                <img
                  src={pending.url}
                  alt="Preview of your new profile photo"
                  className="size-[132px] rounded-[40px] object-cover shadow-card"
                />
                <div className="flex flex-col items-center gap-3 pb-1" aria-hidden="true">
                  <img src={pending.url} alt="" className="size-[46px] rounded-2xl object-cover" />
                  <img src={pending.url} alt="" className="size-8 rounded-full object-cover" />
                </div>
              </div>
              <p className="max-w-full truncate text-[12.5px] text-muted-foreground">
                {pending.file.name} · {formatFileSize(pending.file.size)}
              </p>
            </div>
          ) : null}

          {upload.isError ? (
            <Alert variant="danger" title="Upload failed">
              {getErrorMessage(upload.error)}
            </Alert>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={openPicker} disabled={upload.isPending}>
              Choose another
            </Button>
            <Button
              loading={upload.isPending}
              onClick={() => pending && upload.mutate(pending.file)}
            >
              {!upload.isPending && <Upload aria-hidden="true" />}
              Save photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove your profile photo?"
        description="You'll get a generated avatar instead. You can upload a new photo at any time."
        confirmLabel="Remove photo"
        onConfirm={remove}
      />
    </>
  );
}
