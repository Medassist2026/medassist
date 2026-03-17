#!/bin/bash

# Create a simple SVG icon and convert to PNG
# We'll use ImageMagick if available, otherwise create a simple PNG with embed SVG

# For 192x192
cat > icon-192.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" fill="#2563EB"/>
  <g transform="translate(48, 48)">
    <rect x="0" y="0" width="96" height="96" rx="16" fill="#ffffff" opacity="0.1"/>
    <text x="48" y="55" font-size="48" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">MA</text>
  </g>
</svg>
SVG

# For 512x512
cat > icon-512.svg << 'SVG'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2563EB"/>
  <g transform="translate(128, 128)">
    <rect x="0" y="0" width="256" height="256" rx="42" fill="#ffffff" opacity="0.1"/>
    <text x="128" y="140" font-size="128" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">MA</text>
  </g>
</svg>
SVG

echo "Icons created as SVG"
