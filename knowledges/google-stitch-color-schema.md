# Airpass - UI Color Schema & Design Identity
**(Prepared for Google Stitch Gen-UI)**

This document defines the overarching visual language for the Airpass platform, inspired by a dual-tone "nature overlay" aesthetic. The goal is to establish a pristine, trust-invoking upper environment (representing clarity and privacy) grounded by a vibrant, warm lower environment (representing dynamic energy and connection).

## 1. The Core Concept (Dual-Tone Ambient Background)

Instead of a flat background color, the platform utilizes an atmospheric, full-viewport background over which UI elements float.

- **The Canopy (Top 70%):** A soft, airy, light pastel greenish-cream. It represents the "clean room" of privacy where the heavy technical data (file info, room codes, progress) is displayed clearly.
- **The Bloom (Bottom 30%):** A glowing, dispersed gradient of warm floral tones (sunset pinks, oranges, and golden yellows mixed with meadow green). This sits fixed at the bottom edge of the screen, creating depth.

*Implementation Note for Stitch:* The background should be fixed `100vh` and `100vw`. The underlying body can be `#EBF3EA`, with absolutely positioned blurred orb-gradients at the bottom to create the "bloom" effect.

## 2. Global Color Palette (Hex Codes)

### Background & Atmosphere Elements
| Element | Hex Code | Tailwind Custom | Description |
| :--- | :--- | :--- | :--- |
| **Primary Base (Canopy)** | `#EBF3EA` | `bg-airpass-mint` | Soft pastel greenish-white. Fills the majority of the top screen. |
| **Floral Pink (Bloom)** | `#E48586` | `bg-airpass-pink` | Used in the bottom atmospheric ambient gradient. |
| **Sunset Orange (Bloom)**| `#F0A07C` | `bg-airpass-orange` | Used in the bottom atmospheric ambient gradient. |
| **Golden Yellow (Bloom)**| `#F5D061` | `bg-airpass-yellow` | Used in the bottom atmospheric ambient gradient. |

### UI Surfaces (Glassmorphism)
Because of the heavy, beautiful background, cards and container layers MUST use glassmorphism to let the colors shine through contextually.

| Surface Level | CSS Rules | Description |
| :--- | :--- | :--- |
| **Cards & Modals** | `bg-white/65 backdrop-blur-xl border border-white/40 shadow-sm` | The main container for the File Drop Zone, Progress Dashboards, etc. |
| **Inputs / Dropzones** | `bg-white/40 backdrop-blur-md border border-white/60` | Input fields or areas that need to inset slightly into the card. |

### Typography & Elements
| Role | Hex Code | Tailwind Custom | Description |
| :--- | :--- | :--- | :--- |
| **Primary Text (Headers)** | `#1E3F20` | `text-airpass-forest` | Deep, high-contrast forest green. Used for the Logo, H1, H2, and important metrics. |
| **Secondary Text (Body)** | `#4A7C59` | `text-airpass-meadow` | Softer mid-green for paragraph text, sub-labels, and descriptions. |
| **Primary Actions (Buttons)**| `#38A169` | `bg-airpass-leaf` | Vibrant, energetic bright green for the "Create Room", "Join", and "Accept File" buttons. |
| **Primary Action Hover** | `#2F855A` | `bg-airpass-leaf-dark` | Slightly darker shade for interactive hover states. |
| **Destructive Actions** | `#E53E3E` | `bg-red-600` | Reserved exclusively for "Cancel Transfer" or dangerous warnings. |

## 3. UI Component Application Examples

### Example A: The File Drop Zone (Sender View)
- The user is on the Room page. The background is `#EBF3EA` fading into the warm bloom at the bottom.
- Centered on the screen is a large Glassmorphic Card (`bg-white/65 backdrop-blur-xl`).
- Inside the card, the text **"Drag & Drop a file here"** is rendered in Deep Forest Green (`#1E3F20`).
- The dashed border of the drop zone uses a slightly translucent Primary Action green (`#38A169` at 50% opacity).

### Example B: The Progress Dashboard
- The Circular Progress Bar track is softly rendered in `rgba(255,255,255,0.8)`.
- The fill of the progress bar uses the bright Primary Leaf Green (`#38A169`).
- The 6-digit room code is displayed immensely large and clearly in Deep Forest Green (`#1E3F20`) so it contrasts perfectly against the light background.

## 4. Typography Rules
To match the premium, natural feel of the color palette, the typography should be modern, clean, and geometric.
- **Font Family (Suggested):** `Inter`, `Outfit`, or `Plus Jakarta Sans`.
- **Weights:** Use heavy weights (`Semibold` / `Bold`) for the Deep Forest Green headers to anchor the UI. Use `Regular` or `Medium` for body text.

---
**Summary for Google Stitch:** 
Avoid stark whites (`#FFFFFF`), solid blacks (`#000000`), or heavy dark modes. The entire vibe is airy, breathable, organic, and grounded by a vibrant "flower field" gradient hidden behind glass containers at the bottom of the screen.
