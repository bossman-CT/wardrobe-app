// Stylized garment silhouettes rendered in the item's own dominant color.
// Used on the mannequin/outfit views instead of the raw photo, so the
// result always looks like a clean worn garment regardless of how the
// source photo was framed or lit.
const GARMENT_PATHS = {
  top: "M38,0 L62,0 L70,6 L100,10 L82,32 L78,100 L22,100 L18,32 L0,10 L30,6 Z",
  bottom: "M10,0 L90,0 L94,14 L74,100 L54,100 L50,20 L46,100 L26,100 L6,14 Z"
};

function renderGarmentSVG(cat, color) {
  const fill = color || "#c7c2d6";
  const sheenId = "sheen-" + Math.random().toString(36).slice(2, 9);
  const defs = `<defs>
    <linearGradient id="${sheenId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.22"/>
    </linearGradient>
  </defs>`;

  if (cat === "shoes") {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <ellipse cx="30" cy="58" rx="27" ry="20" fill="${fill}"/>
      <ellipse cx="72" cy="58" rx="27" ry="20" fill="${fill}"/>
      <ellipse cx="30" cy="58" rx="27" ry="20" fill="url(#${sheenId})" style="mix-blend-mode:overlay"/>
      <ellipse cx="72" cy="58" rx="27" ry="20" fill="url(#${sheenId})" style="mix-blend-mode:overlay"/>
    </svg>`;
  }

  const d = GARMENT_PATHS[cat];
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    <path d="${d}" fill="${fill}"/>
    <path d="${d}" fill="url(#${sheenId})" style="mix-blend-mode:overlay"/>
  </svg>`;
}
