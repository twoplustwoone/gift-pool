import { Stack, Text } from '../ui-kit/primitives/index.ts';
import { Box } from '../ui-kit/primitives/box.tsx';

type WishlistCardProps = {
  title: string;
  description?: string;
};

export const WishlistCard = ({ title, description }: WishlistCardProps) => {
  return (
    <Box>
      <Stack className="h-40 rounded-md border-2 border-black px-4 py-2">
        <span>Hello</span>
        {/* <Text size="lg">{title}</Text> */}
        {/* {description && <Text>{description}</Text>} */}
      </Stack>
    </Box>
  );
};
