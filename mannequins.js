// Glossy retail-style mannequin bases (headless figure on a display stand).
const MANNEQUINS = {
  female: `
    <svg viewBox="0 0 200 560" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="femaleBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fbf4ea"/>
          <stop offset="55%" stop-color="#e9d9c3"/>
          <stop offset="100%" stop-color="#cdb595"/>
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="537" rx="42" ry="9" fill="#00000022"/>
      <rect x="97" y="490" width="6" height="48" rx="3" fill="#b7a488"/>
      <path d="M120,270 C118,340 114,410 110,480 L104,480 L104,270 Z" fill="url(#femaleBody)"/>
      <path d="M80,270 C82,340 86,410 90,480 L96,480 L96,270 Z" fill="url(#femaleBody)"/>
      <ellipse cx="107" cy="483" rx="12" ry="6" fill="#cdb595"/>
      <ellipse cx="93" cy="483" rx="12" ry="6" fill="#cdb595"/>
      <path d="M148,102 C165,115 168,150 160,190 C156,212 152,230 148,248 L136,244 C140,225 142,205 142,180 C142,150 138,120 132,106 Z" fill="url(#femaleBody)"/>
      <path d="M52,102 C35,115 32,150 40,190 C44,212 48,230 52,248 L64,244 C60,225 58,205 58,180 C58,150 62,120 68,106 Z" fill="url(#femaleBody)"/>
      <path d="M147,100
               C147,115 144,115 144,130
               C144,160 126,160 126,190
               C126,217 142,217 142,245
               C142,257 120,257 120,270
               L80,270
               C80,257 58,257 58,245
               C58,217 74,217 74,190
               C74,160 56,160 56,130
               C56,115 53,115 53,100
               Z" fill="url(#femaleBody)"/>
      <rect x="88" y="70" width="24" height="26" rx="8" fill="url(#femaleBody)"/>
      <ellipse cx="100" cy="42" rx="27" ry="31" fill="url(#femaleBody)"/>
      <ellipse cx="90" cy="32" rx="10" ry="14" fill="#ffffff" opacity="0.35"/>
    </svg>`,
  male: `
    <svg viewBox="0 0 200 560" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="maleBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f1f2f4"/>
          <stop offset="55%" stop-color="#d7dade"/>
          <stop offset="100%" stop-color="#b3b8c0"/>
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="537" rx="42" ry="9" fill="#00000022"/>
      <rect x="97" y="490" width="6" height="48" rx="3" fill="#9aa0aa"/>
      <path d="M130,270 C127,340 122,410 116,480 L106,480 L106,270 Z" fill="url(#maleBody)"/>
      <path d="M70,270 C73,340 78,410 84,480 L94,480 L94,270 Z" fill="url(#maleBody)"/>
      <ellipse cx="111" cy="483" rx="12" ry="6" fill="#b3b8c0"/>
      <ellipse cx="89" cy="483" rx="12" ry="6" fill="#b3b8c0"/>
      <path d="M150,102 C168,116 171,150 163,190 C159,212 155,230 151,248 L138,244 C142,225 144,205 144,180 C144,150 140,120 134,106 Z" fill="url(#maleBody)"/>
      <path d="M50,102 C32,116 29,150 37,190 C41,212 45,230 49,248 L62,244 C58,225 56,205 56,180 C56,150 60,120 66,106 Z" fill="url(#maleBody)"/>
      <path d="M148,100
               C148,115 146,115 146,130
               C146,158 136,158 136,190
               C136,215 142,215 142,245
               C142,257 128,257 128,270
               L72,270
               C72,257 58,257 58,245
               C58,215 64,215 64,190
               C64,158 54,158 54,130
               C54,115 52,115 52,100
               Z" fill="url(#maleBody)"/>
      <rect x="86" y="68" width="28" height="28" rx="8" fill="url(#maleBody)"/>
      <ellipse cx="100" cy="40" rx="29" ry="32" fill="url(#maleBody)"/>
      <ellipse cx="89" cy="30" rx="10" ry="14" fill="#ffffff" opacity="0.3"/>
    </svg>`
};
