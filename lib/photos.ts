// Editorial photography. Files live in /public/photos, downloaded from Unsplash
// (Unsplash License: free to use, commercial included, no permission needed).
// Before launch: confirm each photographer credit on unsplash.com and consider
// commissioning an original Word Hug shoot.

export type Photo = { src: string; alt: string; caption: string; unsplash: string; w: number; h: number; focus?: string };

export const PHOTOS = {
  hero: {
    src: "/photos/hero-golden-hug.jpg",
    alt: "A man in a red sweater hugs a smiling golden retriever on a mountainside at dusk.",
    caption: "Fig. 1 — A golden retriever receiving a Word Hug. Fully committed. No notes.",
    unsplash: "photo-1522276498395-f4f68f7f8454",
    w: 1800,
    h: 1202,
    focus: "62% 40%",
  },
  window: {
    src: "/photos/window-couple-dog.jpg",
    alt: "A smiling couple framed in a window, with a small black-and-white dog standing between them.",
    caption: "Ready for its close-up.",
    unsplash: "photo-1601758124510-52d02ddb7cbd",
    w: 1600,
    h: 1016,
    focus: "50% 45%",
  },
  bed: {
    src: "/photos/bed-friends-dogs.jpg",
    alt: "Two friends laughing on a sunlit bed with two small dogs.",
    caption: "Encouragement, administered horizontally.",
    unsplash: "photo-1601758003122-53c40e686a19",
    w: 1600,
    h: 1067,
    focus: "58% 60%",
  },
  cuddle: {
    src: "/photos/cat-dog-cuddle.jpg",
    alt: "A tabby cat and a fluffy puppy cuddle in the grass.",
    caption: "Hugs come in all shapes. Some of them are cats.",
    unsplash: "photo-1450778869180-41d0601e046e",
    w: 1600,
    h: 941,
    focus: "40% 50%",
  },
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
  pug: {
    src: "/photos/pug-red-sweater.jpg",
    alt: "A black pug in a knitted sweater against a red backdrop, looking off to the side.",
    caption: "Smooth. Unbothered. Single.",
    unsplash: "photo-1517423440428-a5a00ad493e8",
    w: 1200,
    h: 1552,
    focus: "50% 30%",
  },
  greyhound: {
    src: "/photos/greyhound-cuddle.jpg",
    alt: "A black-and-white whippet leans into a smiling woman on a sofa, with a cat behind them.",
    caption: "Leaning in.",
    unsplash: "photo-1601758177266-bc599de87707",
    w: 1600,
    h: 1068,
    focus: "50% 55%",
  },
} satisfies Record<string, Photo>;

export const CATEGORY_PHOTO = {
  encourage: PHOTOS.bed,
  roast: PHOTOS.reading,
  flirt: PHOTOS.pug,
  laugh: PHOTOS.banana,
} as const;
