import { Link } from '@remix-run/react';

export const Logo = () => {
  return (
    <Link to="/" className="group grid text-2xl leading-snug sm:text-base">
      <span className="font-light text-gift transition group-hover:-translate-x-1">
        gift
      </span>
      <span className="font-bold text-pool transition group-hover:translate-x-1">
        pool
      </span>
    </Link>
  );
};
