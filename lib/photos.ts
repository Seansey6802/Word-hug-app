// Editorial photography. Files live in /public/photos, downloaded from Unsplash
// (Unsplash License: free to use, commercial included, no permission needed).
// Art direction: candid human connection, stationery and handwritten notes,
// gifting moments — with only the occasional animal, for humor.
// Captions must never imply the people pictured use or endorse Word Hug
// (stock licenses don't include model releases for endorsement).
// Before launch: confirm each photographer credit on unsplash.com and consider
// commissioning an original Word Hug shoot.

export type Photo = { src: string; alt: string; caption: string; unsplash: string; w: number; h: number; focus?: string };

export const PHOTOS = {
  hero: {
    src: "/photos/hero-friends-laughing.jpg",
    alt: "Three friends in warm late-afternoon light, laughing together mid-conversation.",
    caption: "Fig. 1 — Friends, mid-laugh. The good kind.",
    unsplash: "photo-1491438590914-bc09fcaaf77a",
    w: 1800,
    h: 1200,
    focus: "55% 40%",
  },
  pen: {
    src: "/photos/fountain-pen-letter.jpg",
    alt: "A fountain pen writing a handwritten letter in looping script.",
    caption: "Written with care. Occasionally with a fountain pen.",
    unsplash: "photo-1455390582262-044cdead277a",
    w: 1600,
    h: 1201,
    focus: "40% 45%",
  },
  embrace: {
    src: "/photos/friends-sunset-embrace.jpg",
    alt: "Four friends with their arms around each other, watching a golden sunset over hills.",
    caption: "Encouragement, administered shoulder to shoulder.",
    unsplash: "photo-1511632765486-a01980e01a18",
    w: 1600,
    h: 1067,
    focus: "55% 55%",
  },
  heart: {
    src: "/photos/paper-heart-hands.jpg",
    alt: "One hand passing a small black paper heart to another hand.",
    caption: "Smooth. Possibly too smooth.",
    unsplash: "photo-1579208575657-c595a05383b7",
    w: 1400,
    h: 933,
    focus: "50% 50%",
  },
  notebook: {
    src: "/photos/writing-notebook-coffee.jpg",
    alt: "Hands writing in an open notebook on a wooden table, beside a coffee and a croissant.",
    caption: "A few details go a long way.",
    unsplash: "photo-1456324504439-367cee3b3c32",
    w: 1600,
    h: 1067,
    focus: "50% 60%",
  },
  table: {
    src: "/photos/friends-table-laughing.jpg",
    alt: "Four friends around a café table, laughing as they watch something on a tablet.",
    caption: "Some things are better said out loud.",
    unsplash: "photo-1543269865-cbf427effbad",
    w: 1600,
    h: 1067,
    focus: "45% 45%",
  },
  gift: {
    src: "/photos/gift-held-out.jpg",
    alt: "A person holds out a small gift wrapped in kraft paper and striped string.",
    caption: "For you. Yes, you.",
    unsplash: "photo-1512909006721-3d6018887383",
    w: 1600,
    h: 1067,
    focus: "45% 55%",
  },
  envelopes: {
    src: "/photos/envelopes-stationery.jpg",
    alt: "A wall of cream and white envelopes and paper tags, neatly overlapping.",
    caption: "Every hug arrives sealed.",
    unsplash: "photo-1526554850534-7c78330d5f90",
    w: 1600,
    h: 1068,
    focus: "40% 50%",
  },
  // The occasional animal, strictly for comic relief.
  reading: {
    src: "/photos/reading-glasses-dog.jpg",
    alt: "A dog wearing glasses appears to read a magazine.",
    caption: "Reviewing your browser history.",
    unsplash: "photo-1535930891776-0c2dfb7fda1a",
    w: 1200,
    h: 900,
    focus: "55% 40%",
  },
  banana: {
    src: "/photos/frenchie-banana.jpg",
    alt: "A French bulldog sniffs a peeled banana held out against a yellow wall.",
    caption: "Comedy is, at its heart, a banana.",
    unsplash: "photo-1583511666407-5f06533f2113",
    w: 1200,
    h: 802,
    focus: "50% 50%",
  },
} satisfies Record<string, Photo>;

export const CATEGORY_PHOTO = {
  encourage: PHOTOS.embrace,
  roast: PHOTOS.reading,
  flirt: PHOTOS.heart,
  laugh: PHOTOS.banana,
} as const;
