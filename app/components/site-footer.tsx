import { LuCoffee } from 'react-icons/lu';
import { Link } from 'react-router';

export const SiteFooter = () => {
  return (
    <footer className="border-t border-border/40 mt-auto">
      <div className="container py-6 md:py-8">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground md:gap-8">
            <li>
              <Link to="/about" className="hover:text-foreground hover:underline">
                About
              </Link>
            </li>
            <li>
              <Link to="/support" className="hover:text-foreground hover:underline">
                Contact
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="hover:text-foreground hover:underline">
                Privacy
              </Link>
            </li>
            <li>
              <Link to="/tos" className="hover:text-foreground hover:underline">
                Terms
              </Link>
            </li>
            <li>
              <a
                href="https://buymeacoffee.com/twoplustwoone"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <LuCoffee className="h-3.5 w-3.5" aria-hidden />
                Buy me a coffee
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
};
