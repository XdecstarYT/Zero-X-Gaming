import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted">Original web games. No downloads. Just play.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <li>
              <Link className="hover:text-text" href="/games">
                All games
              </Link>
            </li>
            <li>
              <Link className="hover:text-text" href="/sports">
                Sports+
              </Link>
            </li>
            <li>
              <Link className="hover:text-text" href="/leaderboards">
                Leaderboards
              </Link>
            </li>
            <li>
              <Link className="hover:text-text" href="/settings">
                Settings
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-subtle">© {new Date().getFullYear()} Zero X | Gaming</p>
    </footer>
  );
}
