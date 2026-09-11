// Player avatar creator (Mii/Duolingo-style) built on DiceBear's "avataaars" style.
// Anyone — admin or anonymous visitor — can customize any player's avatar; it's a
// purely cosmetic, low-stakes feature, so there's no ownership/permission model here.
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

const SCHEMA = avataaars.schema.properties;

/** Turns a DiceBear trait codename ("shortFlat") into a readable label ("Short Flat"). */
function humanize(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function enumOptions(schemaKey) {
  return (SCHEMA[schemaKey]?.items?.enum || []).map((value) => ({
    value,
    label: humanize(value),
  }));
}

// The clothing region's absolute bounding box for the "shirtCrewNeck" shape, in the
// avatar's 280x280 canvas (extracted from DiceBear's own generated SVG) — used to size
// and position each jersey's pattern fill so it exactly follows the shirt DiceBear draws,
// instead of a hand-drawn overlay that would risk not lining up with the body/neck/arms.
const JERSEY_X = 32;
const JERSEY_Y = 170;
const JERSEY_W = 200;
const JERSEY_H = 110;
const JERSEY_BASE_CLOTHING = "shirtCrewNeck";
// Never a real DiceBear palette color — used to find-and-replace the clothing fill
// with our pattern reference in the generated SVG string.
const JERSEY_MARKER_COLOR = "ff00fe";

// Real club jerseys — fixed multi-color patterns (not simple flat recolors), rendered
// by pattern-filling DiceBear's own shirt silhouette rather than a hand-drawn overlay.
export const JERSEY_PRESETS = [
  {
    key: "sport",
    label: "Sport Recife",
    pattern: `<pattern id="jersey-sport" patternUnits="userSpaceOnUse" x="${JERSEY_X}" y="${JERSEY_Y}" width="${JERSEY_W}" height="22">
      <rect width="${JERSEY_W}" height="11" fill="#E8112D"/>
      <rect y="11" width="${JERSEY_W}" height="11" fill="#111111"/>
    </pattern>`,
  },
  {
    key: "santacruz",
    label: "Santa Cruz",
    pattern: `<pattern id="jersey-santacruz" patternUnits="userSpaceOnUse" x="${JERSEY_X}" y="${JERSEY_Y}" width="${JERSEY_W}" height="${JERSEY_H}">
      <rect width="${JERSEY_W}" height="${JERSEY_H}" fill="#FFFFFF"/>
      <rect y="26" width="${JERSEY_W}" height="11" fill="#111111"/>
      <rect y="37" width="${JERSEY_W}" height="9" fill="#E8112D"/>
    </pattern>`,
  },
  {
    key: "nautico",
    label: "Náutico",
    pattern: `<pattern id="jersey-nautico" patternUnits="userSpaceOnUse" x="${JERSEY_X}" y="${JERSEY_Y}" width="28" height="${JERSEY_H}">
      <rect width="14" height="${JERSEY_H}" fill="#FFFFFF"/>
      <rect x="14" width="14" height="${JERSEY_H}" fill="#D0112B"/>
    </pattern>`,
  },
  {
    key: "bolabate1",
    label: "Bola Bate 1",
    pattern: `<pattern id="jersey-bolabate1" patternUnits="userSpaceOnUse" x="${JERSEY_X}" y="${JERSEY_Y}" width="${JERSEY_W}" height="${JERSEY_H}">
      <rect width="${JERSEY_W}" height="${JERSEY_H}" fill="#0A0A0A"/>
      <rect x="-40" y="15" width="280" height="38" fill="#E8112D" transform="rotate(-18 100 55)"/>
    </pattern>`,
  },
  {
    key: "bolabate2",
    label: "Bola Bate 2",
    pattern: `<pattern id="jersey-bolabate2" patternUnits="userSpaceOnUse" x="${JERSEY_X}" y="${JERSEY_Y}" width="${JERSEY_W}" height="${JERSEY_H}">
      <rect width="${JERSEY_W}" height="${JERSEY_H}" fill="#E5E7EB"/>
      <rect x="-40" y="15" width="280" height="38" fill="#1D4ED8" transform="rotate(-18 100 55)"/>
    </pattern>`,
  },
];

// DiceBear's avataaars only ships 5 facial-hair shapes (3 beards, 2 moustaches) — no goatee.
// These two are synthesized from its own art instead of hand-drawn: a tight clip of
// "beardMedium"'s chin patch for the goatee, and that same crop with the standalone
// "moustacheMagnum" shape layered on top for the combo. Both anchor at translate(49 72),
// which is where DiceBear always draws facial hair, so the overlay lines up with no
// manual offset math. Coordinates were calibrated by rendering candidates and comparing
// screenshots, the same way the jersey overlays were.
const GOATEE_BASE_FACIAL_HAIR = "beardMedium";
const GOATEE_CLIP_RECT = { x: 50, y: 95, width: 64, height: 55, rx: 16 };
const GOATEE_SMALL_CLIP_RECT = { x: 60, y: 100, width: 44, height: 42, rx: 14 };
const GOATEE_MOUSTACHE_PATH_D =
  "M84 66.94c-2.5-3.34-12.27-4.75-19.28-3.48-9.65 1.76-13.74 12.3-12.5 14.22.77 1.2 2.48.8 4.26.38.8-.2 1.64-.38 2.4-.43 1.48-.09 3.34.22 5.44.57 4.98.82 11.37 1.88 17.63-1.51A6.04 6.04 0 0 0 84 74.84a6.04 6.04 0 0 0 2.05 1.85c6.25 3.39 12.64 2.33 17.62 1.5 2.1-.34 3.96-.65 5.45-.56.76.05 1.59.24 2.4.43 1.78.41 3.49.81 4.26-.38 1.24-1.91-2.85-12.46-12.5-14.22-7.02-1.27-16.78.14-19.28 3.48Z";

export const SYNTHETIC_FACIAL_HAIR = [
  { value: "goatee", label: "Goatee", withMoustache: false, clipRect: GOATEE_CLIP_RECT },
  { value: "goateeMoustache", label: "Goatee + Moustache", withMoustache: true, clipRect: GOATEE_CLIP_RECT },
  { value: "goateeSmall", label: "Small Goatee", withMoustache: false, clipRect: GOATEE_SMALL_CLIP_RECT },
  { value: "goateeSmallMoustache", label: "Small Goatee + Moustache", withMoustache: true, clipRect: GOATEE_SMALL_CLIP_RECT },
];

// Every trait category shown in the editor, grouped into tabs. `nullable: true`
// categories get an explicit "None" tile (e.g. you can go beardless / glasses-free).
// "clothing" mixes plain recolorable shirt shapes with the fixed-pattern team jerseys
// above (via `jerseyOptions`) — picking one clears the other, see playersView.js.
// The feminine-coded cuts in this set: a headscarf, a flower crown, and various
// long/bob styles. Every other "top" option (short cuts, dreads, headwear, etc.)
// reads neutral.
const FEMININE_TOP_STYLES = new Set([
  "hijab",
  "bob",
  "bun",
  "curly",
  "curvy",
  "frida",
  "longButNotTooLong",
  "miaWallace",
  "straight01",
  "straight02",
  "straightAndStrand",
]);

export const AVATAR_TABS = [
  {
    key: "top",
    label: "💇 Cabelo",
    schemaKey: "top",
    // Nullable so a shaved head / bald look is on the table too — a common masculine
    // choice that isn't covered by any of DiceBear's drawn hairstyle shapes.
    options: enumOptions("top").filter((o) => !FEMININE_TOP_STYLES.has(o.value)),
    nullable: true,
  },
  { key: "eyes", label: "👀 Olhos", schemaKey: "eyes", options: enumOptions("eyes") },
  { key: "eyebrows", label: "🤨 Sobrancelhas", schemaKey: "eyebrows", options: enumOptions("eyebrows") },
  { key: "mouth", label: "👄 Boca", schemaKey: "mouth", options: enumOptions("mouth") },
  {
    key: "facialHair",
    label: "🧔 Barba",
    schemaKey: "facialHair",
    options: [
      ...enumOptions("facialHair"),
      ...SYNTHETIC_FACIAL_HAIR.map((g) => ({ value: g.value, label: g.label })),
    ],
    nullable: true,
  },
  { key: "accessories", label: "👓 Óculos", schemaKey: "accessories", options: enumOptions("accessories"), nullable: true },
  {
    key: "clothing",
    label: "👕 Roupa",
    schemaKey: "clothing",
    // Scoop-neck is the one feminine-coded cut in this set; every other shape reads neutral.
    options: enumOptions("clothing").filter(
      (o) => o.value !== "graphicShirt" && o.value !== "shirtScoopNeck",
    ),
    jerseyOptions: JERSEY_PRESETS.map((j) => ({ value: j.key, label: j.label })),
  },
];

// DiceBear's own skin palette (7 tones) leans on a few stylized/cartoon shades (orange,
// yellow) and skips a lot of the real range in between and at the darker end — these
// fill those gaps in so there's a fuller, more realistic spread to choose from.
const EXTRA_SKIN_COLORS = ["ffe4c4", "f1c27d", "c68642", "8d5524", "3b2219"];

// Color swatches, shown as their own tab (skin, hair, clothing, hat, background). Kept
// short and curated rather than every DiceBear default, since these are shown as tap targets.
export const AVATAR_COLOR_TABS = [
  { key: "skinColor", label: "🎨 Pele", colors: [...SCHEMA.skinColor.default, ...EXTRA_SKIN_COLORS] },
  { key: "hairColor", label: "🎨 Cor do Cabelo", colors: SCHEMA.hairColor.default },
  { key: "facialHairColor", label: "🧔 Cor da Barba", colors: SCHEMA.facialHairColor.default },
  { key: "clothesColor", label: "🎨 Cor da Roupa", colors: SCHEMA.clothesColor.default },
  { key: "hatColor", label: "🧢 Cor do Boné/Gorro", colors: SCHEMA.hatColor.default },
  { key: "backgroundColor", label: "🖼️ Fundo", colors: [...SCHEMA.clothesColor.default, "transparent"] },
];

/** Same look for every player until they're explicitly customized — a clear, friendly starting point. */
export const DEFAULT_AVATAR_CONFIG = {
  top: "shortFlat",
  eyes: "default",
  eyebrows: "default",
  mouth: "smile",
  facialHair: null,
  accessories: null,
  clothing: "hoodie",
  jersey: null, // one of JERSEY_PRESETS' keys, or null for a plain (recolorable) shirt
  skinColor: "edb98a",
  hairColor: "4a312c",
  facialHairColor: "4a312c",
  accessoriesColor: "262e33",
  clothesColor: "3c4f5c",
  hatColor: "3c4f5c",
  backgroundColor: "b6e3f4",
};

/** Converts our flat config object into DiceBear's array-based options + on/off probabilities. */
function toDicebearOptions(config) {
  const cfg = { ...DEFAULT_AVATAR_CONFIG, ...config };
  const usingJersey = !!cfg.jersey;
  const goateePreset = SYNTHETIC_FACIAL_HAIR.find((g) => g.value === cfg.facialHair);
  return {
    top: [cfg.top || "shortFlat"],
    topProbability: cfg.top ? 100 : 0,
    eyes: [cfg.eyes],
    eyebrows: [cfg.eyebrows],
    mouth: [cfg.mouth],
    clothing: [usingJersey ? JERSEY_BASE_CLOTHING : cfg.clothing],
    skinColor: [cfg.skinColor],
    hairColor: [cfg.hairColor],
    hatColor: [cfg.hatColor],
    clothesColor: [usingJersey ? JERSEY_MARKER_COLOR : cfg.clothesColor],
    backgroundColor: [cfg.backgroundColor === "transparent" ? "transparent" : cfg.backgroundColor],
    facialHair: cfg.facialHair ? [goateePreset ? GOATEE_BASE_FACIAL_HAIR : cfg.facialHair] : ["beardLight"],
    facialHairProbability: cfg.facialHair ? 100 : 0,
    facialHairColor: [cfg.facialHairColor],
    accessories: cfg.accessories ? [cfg.accessories] : ["round"],
    accessoriesProbability: cfg.accessories ? 100 : 0,
    accessoriesColor: [cfg.accessoriesColor],
  };
}

/** Renders a player's avatar (their saved config, or the shared default) as an <img>-ready data URI. */
export function getAvatarDataUri(config) {
  const cfg = config || {};
  const avatar = createAvatar(avataaars, toDicebearOptions(cfg));

  const jerseyPreset = cfg.jersey && JERSEY_PRESETS.find((j) => j.key === cfg.jersey);
  const goateePreset = SYNTHETIC_FACIAL_HAIR.find((g) => g.value === cfg.facialHair);
  if (!jerseyPreset && !goateePreset) return avatar.toDataUri();

  let svg = avatar.toString();

  if (jerseyPreset) {
    // Splice the jersey's pattern into <defs> and point the (marker-colored) shirt fill
    // at it, so the real DiceBear-drawn shirt silhouette wears the club's colors/pattern.
    svg = svg.replace(/(<svg[^>]*>)/, `$1<defs>${jerseyPreset.pattern}</defs>`);
    svg = svg.replaceAll(`fill="#${JERSEY_MARKER_COLOR}"`, `fill="url(#jersey-${jerseyPreset.key})"`);
  }

  if (goateePreset) {
    const { x, y, width, height, rx } = goateePreset.clipRect;
    svg = svg.replace(
      /(<svg[^>]*>)/,
      `$1<defs><clipPath id="goateeClip"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}"/></clipPath></defs>`,
    );
    svg = svg.replace(
      '<g transform="translate(49 72)">',
      '<g transform="translate(49 72)" clip-path="url(#goateeClip)">',
    );
    if (goateePreset.withMoustache) {
      const color = cfg.facialHairColor || DEFAULT_AVATAR_CONFIG.facialHairColor;
      const moustache = `<g transform="translate(49 72)"><path d="${GOATEE_MOUSTACHE_PATH_D}" fill="#${color}"/></g>`;
      svg = svg.replace('<g transform="translate(62 42)">', `${moustache}<g transform="translate(62 42)">`);
    }
  }

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
