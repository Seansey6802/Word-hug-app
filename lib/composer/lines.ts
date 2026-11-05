// The Word Hug line library.
//
// Every line here is original writing. Rules the library follows:
//  - Roasts target habits and harmless quirks, never bodies, looks, identity,
//    money, health or anything a person can't change. Every roast ends on love.
//  - Flirting stays PG, cheesy and consensual in spirit. No comments on bodies.
//  - Nothing is ever inferred from a photo. The composer never sees photos.
//
// Placeholders: {name} (optional name), {i} (interest phrase).
// Straight quotes are fine here; the composer converts them to typographic ones.

import type { Category, Occasion, Tone } from "../catalog";

export type Line = {
  id: string;
  text: string;
  /** Inclusive intensity range [min, max]. Defaults to [1, 3]. */
  i?: [1 | 2 | 3, 1 | 2 | 3];
  /** Tones this line suits best. Undefined = suits all. */
  t?: Tone[];
};

export type Opener = { id: string; withName: string; without: string; t: Tone[]; c?: Category[] };

export const OPENERS: Opener[] = [
  { id: "o-h1", t: ["heartfelt"], withName: "{name}, I want you to hear this properly.", without: "Hey. I want you to hear this properly." },
  { id: "o-h2", t: ["heartfelt"], withName: "{name} — come here a second.", without: "Come here a second." },
  { id: "o-h3", t: ["heartfelt"], withName: "Okay, {name}. Deep breath. Here it is.", without: "Okay. Deep breath. Here it is." },
  { id: "o-p1", t: ["playful"], withName: "Hi {name}! Big news, and it's about you.", without: "Hi! Big news, and it's about you." },
  { id: "o-p2", t: ["playful"], withName: "Attention, {name}. This is your hug speaking.", without: "Attention, please. This is your hug speaking." },
  { id: "o-p3", t: ["playful"], withName: "{name}! You opened it. Excellent. That was step one.", without: "You opened it. Excellent. That was step one." },
  { id: "o-po1", t: ["poetic"], withName: "For {name}, folded small and sent with care:", without: "Folded small and sent with care:" },
  { id: "o-po2", t: ["poetic"], withName: "{name}, a few words, chosen slowly:", without: "A few words, chosen slowly:" },
  { id: "o-po3", t: ["poetic"], withName: "Dear {name}, here is a small, warm thing.", without: "Here is a small, warm thing." },
  { id: "o-d1", t: ["deadpan"], withName: "{name}. A brief announcement.", without: "A brief announcement." },
  { id: "o-d2", t: ["deadpan"], withName: "Memo to {name}. Priority: high.", without: "Memo. Priority: high." },
  { id: "o-d3", t: ["deadpan"], withName: "{name}, please be seated. This won't take long.", without: "Please be seated. This won't take long." },
  // Category-flavoured openers
  { id: "o-r1", c: ["roast"], t: ["heartfelt", "deadpan", "playful", "poetic"], withName: "{name}, I say this with love, and also with evidence.", without: "I say this with love, and also with evidence." },
  { id: "o-r2", c: ["roast"], t: ["playful", "deadpan"], withName: "Gather round, {name}. The roast is now in session.", without: "Gather round. The roast is now in session." },
  { id: "o-f1", c: ["flirt"], t: ["playful", "heartfelt", "deadpan", "poetic"], withName: "{name}, I've been practicing this one in the mirror.", without: "Okay. I've been practicing this one in the mirror." },
  { id: "o-f2", c: ["flirt"], t: ["poetic", "heartfelt"], withName: "{name}, forgive me in advance.", without: "Forgive me in advance." },
  { id: "o-l1", c: ["laugh"], t: ["deadpan", "playful"], withName: "{name}, I have prepared remarks.", without: "I have prepared remarks." },
];

export const BODY: Record<Category, Line[]> = {
  encourage: [
    { id: "e1", text: "You have survived every single one of your worst days so far. That's a perfect record, and I don't see you breaking it now." },
    { id: "e2", i: [1, 2], text: "The version of you from five years ago would be quietly astonished at what you handle before lunch." },
    { id: "e3", i: [2, 3], t: ["heartfelt", "poetic"], text: "You don't have to feel ready. Ready is a feeling; brave is a decision, and you've made it before." },
    { id: "e4", i: [1, 2], t: ["heartfelt", "poetic"], text: "Being tired isn't the same as failing. Rest is just you sharpening the pencil." },
    { id: "e5", t: ["heartfelt"], text: "Somewhere, a person is better off because you exist and hasn't said so out loud yet. Consider this them saying it." },
    { id: "e6", i: [1, 2], t: ["playful"], text: "Progress is rarely a staircase. It's more like a cat walking across a keyboard: chaotic, and still, somehow, forward." },
    { id: "e7", t: ["poetic"], text: "You are allowed to be a masterpiece and a work in progress at the same time. Museums do it constantly. They call it restoration." },
    { id: "e8", i: [2, 3], t: ["playful", "deadpan"], text: "Doubt is just your brain reading the terms and conditions. Click 'accept' and go." },
    { id: "e9", i: [1, 2], t: ["playful", "deadpan"], text: "Let the record show: you keep showing up. That is most of it. The rest is snacks." },
    { id: "e10", i: [3, 3], text: "Stand up a little straighter. Not because anyone's watching — because you're about to do something worth watching." },
    { id: "e11", i: [2, 3], t: ["playful", "deadpan"], text: "If confidence were a natural resource, you'd be a mid-sized nation with a surprisingly strong export economy." },
    { id: "e12", i: [1, 2], t: ["poetic", "heartfelt"], text: "Even the moon has phases, and nobody tells it to try harder." },
    { id: "e13", i: [3, 3], t: ["poetic", "heartfelt"], text: "This is the part of the story where the music changes. Go on. Walk toward it." },
    { id: "e14", i: [2, 3], t: ["deadpan"], text: "I have reviewed the evidence and the verdict is unanimous: you can do hard things. Court is adjourned." },
    { id: "e15", i: [1, 2], text: "You are not behind. You're on a route the map app simply hasn't heard of yet." },
    { id: "e16", i: [1, 2], t: ["heartfelt", "deadpan"], text: "Lower your shoulders from around your ears. There. You're doing better than you think — that isn't a pep talk, it's arithmetic." },
    { id: "e17", i: [3, 3], t: ["playful"], text: "Today you are going to be unreasonably, inconveniently brilliant. Please warn the others." },
    { id: "e18", i: [1, 1], t: ["poetic", "heartfelt"], text: "Small steps still count. Ask anyone who has ever climbed the stairs in the dark." },
    { id: "e19", i: [3, 3], t: ["deadpan", "playful"], text: "Your fear has been informed that it is no longer driving. It may sit in the back. It may not touch the radio." },
    { id: "e20", i: [2, 3], t: ["heartfelt"], text: "The people who love you aren't waiting for you to be finished. They like this draft very much." },
  ],
  roast: [
    { id: "r1", i: [1, 2], text: "You have forty-seven tabs open and every single one of them is 'for later.' Later has asked for some space." },
    { id: "r2", text: "You say 'I'm five minutes away' with the serene confidence of someone who has not yet located their shoes." },
    { id: "r3", i: [1, 2], text: "Your Notes app is a museum of brilliant ideas, one grocery list, and a sentence that just says 'the thing with the guy.'" },
    { id: "r4", i: [2, 3], t: ["deadpan", "playful"], text: "You've been 'about to start' a new routine since a year that ended in a different digit." },
    { id: "r5", i: [2, 3], text: "You treat unanswered texts like a slow-cooker recipe. Some of them have been simmering since spring." },
    { id: "r6", i: [2, 3], t: ["playful"], text: "You call yourself low-maintenance and then send back a glass of water because it tastes 'loud.'" },
    { id: "r7", i: [1, 2], t: ["deadpan"], text: "You own a drawer of chargers for devices that were discontinued several phones ago, and you will defend each one in court." },
    { id: "r8", text: "You've watched enough cooking videos to narrate a soufflé, and yet dinner was cereal. Twice. Standing up." },
    { id: "r9", i: [1, 2], t: ["playful", "poetic"], text: "Your houseplants are thriving purely out of spite. They've seen the watering schedule and decided to handle it themselves." },
    { id: "r10", i: [1, 2], text: "You say 'one more episode' the way other people say 'goodnight.' The sunrise has seen things." },
    { id: "r11", i: [2, 3], t: ["deadpan"], text: "You reply 'haha' with a face so still it could be carved into the side of a mountain." },
    { id: "r12", i: [2, 3], text: "You have never once put something back where it goes, and yet you are personally offended every time it isn't there." },
    { id: "r13", i: [2, 3], t: ["playful", "deadpan"], text: "You've started more group chats than you've finished books, and somehow you're the one who's 'not really a texter.'" },
    { id: "r14", i: [2, 3], t: ["playful"], text: "Your 'quick question' has a beginning, a middle, two flashbacks and a post-credits scene." },
    { id: "r15", i: [1, 2], t: ["deadpan"], text: "You set seven alarms and treat them like a suggestions committee. The committee has unionized." },
    { id: "r16", i: [3, 3], text: "You are the reason the 'reply all' button needs a warning label and, ideally, a short waiting period." },
    { id: "r17", i: [3, 3], t: ["playful"], text: "You'd lose a staring contest to a houseplant and then deliver a forty-minute explanation of why it was rigged." },
    { id: "r18", i: [3, 3], t: ["deadpan"], text: "Your sense of direction is less a sense and more a rumour. GPS has started sighing when you get in the car." },
    { id: "r19", i: [1, 1], t: ["heartfelt", "poetic"], text: "You apologize to furniture when you bump into it. The furniture, for the record, has forgiven you." },
    { id: "r20", i: [2, 3], t: ["poetic", "playful"], text: "You've 'just popped into the store' for one thing so many times the staff has started to sing when you arrive." },
  ],
  flirt: [
    { id: "f1", text: "Are you a library book? Because I keep checking you out and I'm absolutely not returning you on time." },
    { id: "f2", i: [2, 3], t: ["playful"], text: "If you were a vegetable you'd be a cute-cumber, and I'd be in a real pickle about it." },
    { id: "f3", i: [1, 2], t: ["heartfelt", "poetic"], text: "I'm no photographer, but I can absolutely picture us splitting a dessert we both said we wouldn't order." },
    { id: "f4", i: [2, 3], t: ["poetic", "playful"], text: "Do you have a map? I keep getting lost in this conversation, and honestly, I don't want to be found." },
    { id: "f5", i: [1, 2], t: ["playful", "deadpan"], text: "You must be a software update, because every time you show up everything gets a little better and I have no idea what changed." },
    { id: "f6", i: [2, 3], t: ["playful"], text: "Is your name Wi-Fi? Because I'm feeling a strong connection and I didn't even need the password." },
    { id: "f7", i: [1, 2], t: ["heartfelt"], text: "If kindness were a crime you'd be serving a lovely, lovely life sentence, and I'd visit every Sunday with snacks." },
    { id: "f8", i: [2, 3], text: "You're like the last slice of pizza: everyone's pretending they aren't thinking about you, and everyone is." },
    { id: "f9", i: [1, 2], text: "Excuse me, I think you dropped something. It was my entire train of thought." },
    { id: "f10", i: [3, 3], t: ["playful"], text: "If you were a fruit you'd be a fine-apple, and I will not be taking questions at this time." },
    { id: "f11", i: [1, 2], t: ["heartfelt", "poetic"], text: "Your laugh should come with a warning label: may cause sudden good moods in nearby strangers." },
    { id: "f12", i: [1, 2], t: ["poetic", "heartfelt"], text: "Some people light up a room. You somehow make the room want to be a better room." },
    { id: "f13", i: [2, 3], t: ["poetic"], text: "If I wrote a book about the best things that ever happened to me, you'd be in chapter one, the sequel, and most of the footnotes." },
    { id: "f14", i: [3, 3], t: ["playful", "deadpan"], text: "Are you French? Because Eiffel for you, and I'm not even slightly embarrassed about it." },
    { id: "f15", i: [2, 3], t: ["deadpan", "playful"], text: "I'd tell you a chemistry joke, but I think we've already got plenty of that." },
    { id: "f16", i: [1, 1], t: ["deadpan"], text: "Statistically, you are the best thing to happen to this message all day." },
    { id: "f17", i: [2, 3], t: ["playful", "heartfelt"], text: "If you were a coffee I'd skip the decaf and accept every consequence." },
    { id: "f18", i: [3, 3], t: ["deadpan"], text: "Are you a parking ticket? Because you've got 'fine' written all over you. I'm aware. I'm sorry. I'm not sorry." },
    { id: "f19", i: [1, 1], t: ["heartfelt", "poetic"], text: "I'd say something smooth, but every time I think about you, my words go a bit pink around the edges." },
    { id: "f20", i: [3, 3], t: ["playful", "poetic"], text: "Are you a sunrise? Because I'd happily get up early for you, and I do not get up early for anyone." },
  ],
  laugh: [
    { id: "l1", i: [1, 2], t: ["heartfelt", "poetic"], text: "Fun fact: otters hold hands while they sleep so they don't drift apart. I'm not saying you're an otter. I'm saying you have otter energy, and it's a compliment." },
    { id: "l2", text: "A goose has never once apologized, and look how confident it is. Be the goose today. Within reason. Don't bite anyone." },
    { id: "l3", i: [1, 2], t: ["deadpan"], text: "Breaking news: a local legend has once again woken up and chosen to participate in the day, despite the weather. Experts are calling it 'pretty impressive.'" },
    { id: "l4", i: [2, 3], t: ["deadpan"], text: "If life gives you lemons, quietly put them back and see if life notices. It usually doesn't." },
    { id: "l5", i: [1, 2], t: ["heartfelt", "poetic"], text: "Somewhere right now a dog is seeing snow for the very first time, and you deserve to feel exactly like that dog." },
    { id: "l6", i: [2, 3], t: ["playful"], text: "I asked a group of ducks what they think of you. They said 'quack,' which I've chosen to interpret as a standing ovation." },
    { id: "l7", i: [1, 2], t: ["poetic"], text: "Scientists say the universe is expanding. Probably just making room for your next idea." },
    { id: "l8", i: [3, 3], t: ["playful"], text: "My therapist says I need to stop shouting compliments at people. Anyway. YOU'RE DOING GREAT. SORRY. YOU'RE DOING GREAT." },
    { id: "l9", i: [2, 3], t: ["deadpan", "playful"], text: "Somewhere, a pigeon walked into a glass door this morning. Twice. He's fine. You're fine. Everyone's fine." },
    { id: "l10", i: [1, 2], t: ["deadpan"], text: "A group of flamingos is called a 'flamboyance.' I just thought you should have that, the way some people have savings." },
    { id: "l11", i: [1, 2], t: ["playful"], text: "You know how a cat pushes a cup off the table just to see what happens? Be that curious today. Leave the cup, though." },
    { id: "l12", i: [2, 3], t: ["deadpan", "playful"], text: "I'd tell you to 'live, laugh, love,' but you deserve better than a sign in a vacation-rental kitchen." },
    { id: "l13", text: "You are the human equivalent of finding a few extra fries at the bottom of the bag." },
    { id: "l14", i: [2, 3], t: ["poetic", "playful"], text: "Penguins propose with a pebble. Pick your pebble today and commit to it with your whole chest." },
    { id: "l15", i: [3, 3], t: ["playful", "deadpan"], text: "Some days you're the pigeon, some days you're the statue. Today I hereby declare you the statue. Hold still. Look majestic." },
    { id: "l16", i: [2, 3], t: ["heartfelt", "playful"], text: "I tried to write you a joke, but the pen just drew a small heart and left the room." },
    { id: "l17", i: [2, 3], t: ["deadpan"], text: "A sloth can hold its breath longer than a dolphin. Nobody expects it. Be the sloth: underestimated, and frankly showing off." },
    { id: "l18", i: [3, 3], t: ["deadpan"], text: "I've done the math, and you are at least forty percent more delightful than the national average. The other sixty percent is pending review." },
    { id: "l19", i: [1, 1], t: ["poetic", "heartfelt"], text: "Cows have best friends, and they get stressed when they're apart. You're somebody's cow. That's the nicest thing I've ever written." },
  ],
};

export const INTERESTS: Record<Category, Line[]> = {
  encourage: [
    { id: "ie1", text: "Anyone who cares about {i} the way you do can absolutely handle whatever today has planned." },
    { id: "ie2", text: "Bring the energy you bring to {i}. That's the whole plan. It's a good plan." },
    { id: "ie3", text: "You already know how to get better at something — look at you and {i}. Same muscles, new arena." },
  ],
  roast: [
    { id: "ir1", text: "You talk about {i} like it owes you money, and honestly, it might." },
    { id: "ir2", text: "Nobody asked about {i}, and yet somehow every one of us is now a reluctant expert." },
    { id: "ir3", text: "You've brought up {i} so often your phone suggests it before you've finished the first letter." },
  ],
  flirt: [
    { id: "if1", text: "If {i} were a person, I'd be jealous of how much time you spend together." },
    { id: "if2", text: "Tell me everything about {i}. I won't understand a word and I'll love every minute." },
    { id: "if3", text: "You and {i}: iconic. You and me: a promising working theory." },
  ],
  laugh: [
    { id: "il1", text: "Breaking: local {i} enthusiast remains unstoppable. Authorities have given up and are simply cheering now." },
    { id: "il2", text: "I tried explaining {i} to a goose. The goose understood more than I did. You'd have liked the goose." },
    { id: "il3", text: "Somewhere a nature-documentary narrator is whispering about you and {i}. Reviews are glowing." },
  ],
};

export const OCCASION_LINES: Record<Category, Record<Occasion, string>> = {
  encourage: {
    tough_week: "This week has been heavy, and you carried it anyway. You're allowed to set it down tonight.",
    big_day: "On the big day, remember: you're not auditioning for a place you haven't earned. You're showing them what you already are.",
    new_start: "New beginnings feel wobbly because they're new, not because you're wrong for them. Every expert was once the new person who didn't know where the mugs were.",
    birthday: "Another year of you is a gift to everyone nearby. Happy birthday — go and accept the applause.",
    heartbreak: "Hearts heal on their own clock. Yours is a good one, and it's still keeping time.",
    win: "You did it. Take the victory lap slowly. Wave to the crowd.",
    missing: "Distance is just love with a longer commute.",
  },
  roast: {
    tough_week: "This week came at you like a shopping cart with one bad wheel, and you still steered it home. Mostly.",
    big_day: "It's a big day, so I'll be brief: please, for once, leave the house with both earbuds.",
    new_start: "New start, same you — which means a fresh new place for you to lose your keys.",
    birthday: "Happy birthday. Another year wiser, and still no idea what that one kitchen drawer is for.",
    heartbreak: "Their loss. Truly. They'll never again hear you pronounce 'espresso' with an 'x' and total conviction.",
    win: "Congratulations on the win. We'll be hearing about it until roughly the next win, and honestly? Fair.",
    missing: "I miss you, which is annoying, because you never call.",
  },
  flirt: {
    tough_week: "Rough week? Let me be the good news. I'm aware that's a bold claim. I'm committing to it.",
    big_day: "Big day today. They don't stand a chance. I certainly didn't.",
    new_start: "A new chapter? Lucky chapter.",
    birthday: "Happy birthday to my favorite reason to like birthdays.",
    heartbreak: "Whoever let you go probably also leaves the last bite of cake. Unforgivable.",
    win: "Winning suits you. Do it more. I'll bring the confetti.",
    missing: "Missing you is basically my cardio now.",
  },
  laugh: {
    tough_week: "This week was a lot. In solidarity, I have eaten a cracker over the sink like a raccoon. We're in this together.",
    big_day: "Big day. Deep breath. If all else fails, remember a group of crows is called a 'murder,' and you're doing far better than that.",
    new_start: "New beginnings are like new shoes: slightly uncomfortable, slightly thrilling, and someone is definitely going to compliment them.",
    birthday: "Happy birthday! On this day, some years ago, the world got a new main character. The plot's been excellent so far.",
    heartbreak: "Heartbreak is like stubbing your toe: astonishing pain, zero dignity, and a few weeks later you're dancing in the kitchen again.",
    win: "You won! I've alerted the ducks. They're throwing a parade, but it's mostly just walking in a line.",
    missing: "I miss you more than socks miss their partners in the dryer, and those socks are inconsolable.",
  },
};

export const CLOSERS: Record<Category, Line[]> = {
  encourage: [
    { id: "ce1", t: ["playful", "heartfelt"], text: "Go get 'em. Then come back and tell me everything." },
    { id: "ce2", t: ["heartfelt", "poetic"], text: "I'm proud of you. That isn't a phrase; it's a position." },
    { id: "ce3", t: ["heartfelt"], text: "You've got this. And on the days you don't, you've got people who've got you." },
    { id: "ce4", t: ["deadpan"], text: "Proceed with confidence. This memo is legally binding." },
    { id: "ce5", t: ["playful", "poetic"], text: "Now go. The world is running slightly behind schedule without you." },
    { id: "ce6", t: ["poetic"], text: "Keep this somewhere you can find it. Read it again on the loud days." },
  ],
  roast: [
    { id: "cr1", t: ["deadpan", "playful"], text: "All of that said, the world is measurably better with you in it. Unfortunately for my argument." },
    { id: "cr2", t: ["heartfelt", "playful"], text: "And still, I'd pick you first for every team. Even the ones where you'd make us late." },
    { id: "cr3", t: ["poetic", "heartfelt"], text: "Roasted with love, served warm. You're a gem — a slightly disorganized, entirely wonderful gem." },
    { id: "cr4", t: ["playful", "deadpan"], text: "Never change. Well, maybe the tabs. But nothing else." },
    { id: "cr5", t: ["deadpan", "heartfelt"], text: "This roast was contractually required to end on a compliment, and I'm thrilled about it: you're one of the good ones." },
  ],
  flirt: [
    { id: "cf1", t: ["playful", "deadpan"], text: "Anyway. No pressure. (Some pressure.)" },
    { id: "cf2", t: ["deadpan", "playful"], text: "Consider yourself flirted with — professionally, and with great enthusiasm." },
    { id: "cf3", t: ["poetic", "heartfelt"], text: "That's all. I'll be over here, blushing in a lowercase font." },
    { id: "cf4", t: ["playful", "heartfelt"], text: "I'll show myself out. Slowly. In case you'd like to stop me." },
    { id: "cf5", t: ["poetic"], text: "Read it twice. I meant every cheesy word." },
  ],
  laugh: [
    { id: "cl1", t: ["playful", "deadpan"], text: "That's the hug. Please go drink a glass of water and be smug about it." },
    { id: "cl2", t: ["deadpan"], text: "Thank you for attending my lecture. There are no refunds, only snacks." },
    { id: "cl3", t: ["playful", "heartfelt"], text: "You've now been officially hugged. Side effects may include smirking in public." },
    { id: "cl4", t: ["deadpan", "poetic"], text: "End of transmission. The ducks send their regards." },
    { id: "cl5", t: ["heartfelt", "poetic"], text: "Laugh at something stupid today. You've earned it, and so has the stupid thing." },
  ],
};
