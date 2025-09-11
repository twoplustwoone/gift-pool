import { Form } from '@remix-run/react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Button } from '#app/components/ui/button.tsx';
import { DialogFooter, DialogClose } from '#app/components/ui/dialog.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';

const nameMinLength = 1;
export const nameMaxLength = 100;
export const descriptionMaxLength = 1000;

export const GroupEditorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(nameMinLength).max(nameMaxLength),
  description: z
    .string()
    .trim()
    .max(descriptionMaxLength)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export const CreateGroupForm = ({
  id,
  footer,
}: {
  id?: string;
  footer: ReactNode;
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const formId = id ?? 'create-group-form';

  return (
    <Form id={formId} method="POST" className="grid gap-4">
      <div className="grid gap-1">
        <Label htmlFor="group-name">Group Name</Label>
        <Input
          id="group-name"
          name="name"
          placeholder="e.g., College Friends, Family, Work Team"
          minLength={1}
          maxLength={nameMaxLength}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          required
        />
        <div className="text-xs text-muted-foreground">
          {name.length}/{nameMaxLength} characters
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          name="description"
          placeholder="What's this group for? Who are the members?"
          maxLength={descriptionMaxLength}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="text-xs text-muted-foreground">
          {description.length}/{descriptionMaxLength} characters
        </div>
      </div>
      <div className="rounded-2xl border border-accent/30 bg-accent/10 p-3 text-sm">
        <span className="font-bold">How it works:</span> Create a group to
        organize gift-giving with friends, family, or colleagues. Members can
        set contribution limits and pool funds for birthdays and special
        occasions.
      </div>
      {footer}
    </Form>
  );
};

export const CreateGroupCompactForm = ({ id }: { id?: string }) => (
  <CreateGroupForm
    id={id}
    footer={
      <DialogFooter className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit">Create</Button>
      </DialogFooter>
    }
  />
);
