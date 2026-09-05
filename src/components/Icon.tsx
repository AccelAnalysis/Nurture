const paths = {
  home: 'm3 10 9-7 9 7v10H3z M9 20v-7h6v7',
  experience: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h3',
  layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
  offers: 'M3 3h8l10 10-8 8L3 11z M7 7h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  feedback: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
  share: 'M12 16V3 m-5 5 5-5 5 5 M5 13v8h14v-8',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  settings:
    'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  billing: 'M3 5h18v14H3z M3 10h18 M7 15h4',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  people:
    'M10 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 20v-2a5 5 0 0 1 10 0v2 M16 4a3 3 0 0 1 0 6 M16 13a5 5 0 0 1 5 5v2',
  flow: 'M3 3h6v6H3z M15 15h6v6h-6z M6 9v9h9 M9 6h9v9',
  mail: 'M3 5h18v14H3z m0 0 9 7 9-7',
  chart: 'M4 3v18h17 M8 17v-5 M13 17V7 M18 17v-8',
  building: 'M5 21V3h14v18 M3 21h18 M9 7h1 M14 7h1 M9 11h1 M14 11h1 M10 21v-6h4v6',
  arrow: 'M4 12h16 m-6-6 6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  check: 'm5 12 4 4L19 6',
  chevron: 'm9 5 7 7-7 7',
  logout: 'M9 3H3v18h6 M9 12h12 m-5-5 5 5-5 5',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 m-2 5 6 6',
  leaf: 'M20 3C9 2 3 6 4 13s9 9 13 2c2-4 2-7 3-12 M4 21 15 9',
  close: 'm6 6 12 12 M6 18 18 6',
  lock: 'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
