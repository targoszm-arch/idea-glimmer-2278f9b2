## Plan: Add ContentLab Logo to Header and Landing Page

The uploaded logo will be placed before the "Skill Studio AI ContentLab" text in two locations:

### Steps

1. **Copy logo to project** — Copy `user-uploads://ContentLab_Logo.png` to `src/assets/ContentLab_Logo.png`
2. **Update Header component** (`src/components/Header.tsx`)
  - Import the logo image
  - Add an `<img>` tag (height ~28px) before the text on line 30
3. **Update Landing page** (`src/pages/Landing.tsx`)
  - Import the logo image
  - Add an `<img>` tag (height ~32px) before the text on line 34-35

Both will render the logo inline with the brand name using `flex items-center gap-2`.

To be used everywhere across the platform 