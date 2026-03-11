import * as React from 'react';
import { Link } from 'react-router';
import { HOME_COPY } from './home-copy';

export const HomeFooterLite: React.FC = () => {
  return (
    <footer aria-labelledby="home-footer" className="border-t">
      <div className="container py-6 md:py-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-6 text-sm md:gap-8">
            <li>
              <Link to="/about" className="hover:underline">
                {HOME_COPY.footer.about}
              </Link>
            </li>
            <li>
              <Link to="/support" className="hover:underline">
                {HOME_COPY.footer.contact}
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:underline">
                {HOME_COPY.footer.privacy}
              </Link>
            </li>
            <li>
              <Link to="/tos" className="hover:underline">
                {HOME_COPY.footer.terms}
              </Link>
            </li>
          </ul>
        </nav>
        <p
          id="home-footer"
          className="mt-4 text-center text-xs text-muted-foreground"
        >
          {HOME_COPY.footer.copy}
        </p>
      </div>
    </footer>
  );
};
