import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { Link } from '@remix-run/react';
import { LuUsers } from 'react-icons/lu';
import { Button } from '#app/components/ui/button.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { Flex, Text } from '#app/components/ui-kit';
import { requireUserId } from '#app/utils/auth.server.ts';
import { CreateGroupForm } from './__group-editor.tsx';

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  return json({});
}

const NewGroupRoute = () => (
  <div className="container flex flex-col gap-6 py-8">
    <Heading>
      <Flex gap={2} align="center">
        <LuUsers className="text-primary" />
        <Text size="xl" weight="bold">Create Group</Text>
      </Flex>
    </Heading>
    <CreateGroupForm
      footer={
        <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          <Button asChild type="button" variant="outline">
            <Link to="/groups">Cancel</Link>
          </Button>
          <Button type="submit">Create</Button>
        </div>
      }
    />
  </div>
);

export default NewGroupRoute;

export { action } from './__group-editor.server';
