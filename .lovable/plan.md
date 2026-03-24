

## Fix: Remove duplicate `Key` imports in Header.tsx

The build is broken because every import line in `Header.tsx` (lines 1-8) has a spurious `Key, ` prefix, causing "Duplicate identifier 'Key'" errors.

### What happened
A previous edit accidentally prepended `Key, ` to every import statement in the file.

### Fix (single file edit)
**`src/components/Header.tsx`** — Replace lines 1-8 with the correct imports:

```tsx
import { useState } from "react";
import { Menu, X, PenSquare, Lightbulb, Library, Settings, Share2, Palette, LogOut, Coins, HelpCircle, ExternalLink, Plug } from "lucide-react";
import contentLabLogo from "@/assets/ContentLab_Logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS, STRIPE_URLS } from "@/hooks/use-credits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

This removes the duplicate `Key` identifier from all 8 import lines and will resolve the build failure.

