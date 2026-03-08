import { Link } from 'react-router';
import { Flex } from './ui-kit';

export const Logo = () => {
  return (
    <Link to="/" className="group grid text-2xl leading-snug sm:text-base">
      <Flex gap={2}>
        <img src="/img/logo.svg" alt="Gift Pool" className="h-8 w-8" />
        <Flex>
          <span className="text-body-md font-light text-gift transition group-hover:-translate-y-1">
            gift
          </span>
          <span className="text-body-md font-bold text-pool transition group-hover:translate-y-1">
            pool
          </span>
        </Flex>
      </Flex>
    </Link>
  );
};
