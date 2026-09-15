import { createElement } from 'react'
import {
  Armchair,
  BookOpen,
  Camera,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gem,
  Headphones,
  Leaf,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sofa,
  Sparkles,
  Store,
  Tag,
  Watch,
  type LucideIcon,
} from 'lucide-react'

/**
 * Category visuals for the homepage "Shop by Category" grid.
 *
 * The Category API (GET /categories) returns only `{ id, name, description }`
 * — there are no category images in the data model. To give category cards
 * real visual weight without inventing imagery or mock data, each category
 * NAME is matched against a curated keyword → icon table. Categories that
 * match no keyword get a deterministic pick from a small fallback set, so
 * every category still renders a stable, distinct tile.
 */

const KEYWORD_ICONS: Array<[keywords: string[], icon: LucideIcon]> = [
  [['electronic', 'gadget', 'mobile', 'phone', 'computer', 'laptop', 'tech'], Smartphone],
  [['fashion', 'clothing', 'apparel', 'wear', 'men', 'women', 'kids'], Shirt],
  [['home', 'kitchen', 'furniture', 'living'], Sofa],
  [['decor', 'furnish', 'indoor'], Armchair],
  [['beauty', 'cosmetic', 'personal care', 'skincare', 'makeup'], Sparkles],
  [['health', 'wellness', 'grooming'], Leaf],
  [['sport', 'fitness', 'gym', 'outdoor', 'exercise'], Dumbbell],
  [['book', 'stationery', 'media'], BookOpen],
  [['toy', 'game', 'gaming', 'kids'], Gamepad2],
  [['grocery', 'food', 'gourmet', 'staple'], ShoppingBasket],
  [['jewel', 'jewellery', 'jewelry', 'luxury', 'gold'], Gem],
  [['shoe', 'footwear', 'sandal'], Footprints],
  [['watch', 'wearable', 'eyewear'], Watch],
  [['audio', 'headphone', 'speaker', 'music', 'sound'], Headphones],
  [['camera', 'photo', 'optic'], Camera],
]

/** Stable fallback set for categories that match no keyword above. */
const FALLBACK_ICONS: LucideIcon[] = [Store, Tag, Gem, Sparkles, Leaf, Headphones]

function pickIcon(name: string): LucideIcon {
  const normalized = name.toLowerCase()

  for (const [keywords, icon] of KEYWORD_ICONS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return icon
    }
  }

  // Deterministic fallback: same name always maps to the same glyph.
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return FALLBACK_ICONS[hash % FALLBACK_ICONS.length]
}

interface CategoryIconProps {
  name: string
  className?: string
  strokeWidth?: number
}

/** Renders the mapped lucide glyph for a category name. */
export function CategoryIcon({ name, className, strokeWidth = 1.5 }: CategoryIconProps) {
  // createElement (rather than JSX) so the icon component is resolved at
  // render time without defining a component during render.
  return createElement(pickIcon(name), {
    className,
    strokeWidth,
    'aria-hidden': true,
  })
}
