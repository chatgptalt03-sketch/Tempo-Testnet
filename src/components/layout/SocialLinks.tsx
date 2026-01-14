type SocialLink = {
  key: string;
  label: string;
  href: string;
  hoverClassName: string;
  icon: JSX.Element;
};

const links: SocialLink[] = [
  {
    key: 'youtube',
    label: 'YouTube',
    href: 'https://www.youtube.com/@ChainArchitect',
    hoverClassName: 'hover:bg-red-600 hover:outline-red-600',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 text-white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    key: 'x',
    label: 'X',
    href: 'https://x.com/KohenEric',
    hoverClassName: 'hover:bg-[#1d9bf0] hover:outline-[#1d9bf0]',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 text-white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M18.6 2H22l-7.43 8.49L23.5 22h-6.9l-5.4-7.06L4.6 22H1.2l7.95-9.08L.5 2h7.1l4.88 6.33L18.6 2Zm-1.2 18h1.88L6.6 3.9H4.58L17.4 20Z" />
      </svg>
    ),
  },
  {
    key: 'github',
    label: 'GitHub',
    href: 'https://github.com/dharmanan/Tempo-Testnet',
    hoverClassName: 'hover:bg-[#555555] hover:outline-[#555555]',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-4 w-4 text-white"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
];

export function SocialLinks() {
  return (
    <div className="grid grid-cols-3 justify-items-center gap-3 px-3 pb-2">
      {links.map((link) => {
        const baseClassName =
          'inline-flex h-[30px] w-[30px] rounded-full bg-gray-900 outline outline-2 outline-gray-900 ' +
          'transition-[outline-offset,outline-color,background-color] duration-200 ' +
          'outline-offset-0 hover:outline-offset-4 ' +
          'text-white dark:bg-gray-800 dark:outline-white/80';

        return (
          <a
            key={link.key}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={link.label}
            title={link.label}
            className={baseClassName + ` ${link.hoverClassName} hover:animate-shake`}
          >
            <span className="m-auto">{link.icon}</span>
          </a>
        );
      })}
    </div>
  );
}
