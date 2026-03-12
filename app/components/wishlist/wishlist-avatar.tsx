import { Link } from 'react-router';

import { getUserImgSrc } from '#app/utils/misc.tsx';

type UserForAvatar = {
  username: string;
  name: string | null;
  image: { id: string } | null;
};

export const WishlistAvatar = ({
  isOwner,
  user,
}: {
  isOwner: boolean;
  user: UserForAvatar;
}) => {
  const displayName = user.name ?? user.username;
  const image = (
    <img
      src={getUserImgSrc(user.image?.id)}
      alt={displayName}
      className="h-10 w-10 rounded-full object-cover"
    />
  );

  if (isOwner) {
    return image;
  }
  return (
    <Link
      to={`/users/${user.username}`}
      className="group flex items-center gap-3 hover:no-underline"
    >
      {image}
    </Link>
  );
};
