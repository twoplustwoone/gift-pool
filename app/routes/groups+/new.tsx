import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Form, Link } from '@remix-run/react';
import { useState } from 'react';
import { LuUsers } from 'react-icons/lu';
import { Button } from '#app/components/ui/button.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Input } from '#app/components/ui/input.tsx';
import { Label } from '#app/components/ui/label.tsx';
import { Textarea } from '#app/components/ui/textarea.tsx';
import { Flex, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { nameMaxLength, descriptionMaxLength } from './__group-editor.tsx';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const NewGroupRoute = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="container flex flex-col gap-6 py-8">
      <Heading>
        <Flex gap={2} align="center">
          <LuUsers className="text-primary" />
          <Text size="xl" weight="bold">
            Create Group
          </Text>
        </Flex>
      </Heading>
      <Form method="POST" className="grid gap-4">
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
        <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          <Button asChild type="button" variant="outline">
            <Link to="/groups">Cancel</Link>
          </Button>
          <Button type="submit">Create</Button>
        </div>
      </Form>
    </div>
  );
};

export default NewGroupRoute;

export { action } from './__group-editor.server';
