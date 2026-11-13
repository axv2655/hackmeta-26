import * as L from 'lucide-react'

// backend category -> [label, pin emoji, color, icon] (mobile lib/categories.ts colors)
export const CATS = {
  food: ['Food', '🍜', '#F5761A', L.Utensils], coffee: ['Coffee', '☕', '#A0612B', L.Coffee],
  study: ['Study', '📚', '#0866FF', L.GraduationCap], fitness: ['Fitness', '🏋️', '#1F9D55', L.Dumbbell],
  nightlife: ['Nightlife', '🎉', '#8B3DFF', L.PartyPopper], outdoors: ['Outdoors', '🌲', '#2E8B57', L.Compass],
  games: ['Games', '🎮', '#E4405F', L.Gamepad2], shopping: ['Shopping', '🛍️', '#D6338A', L.Store],
  errand: ['Errand', '✅', '#5B6B7F', L.CircleCheck], other: ['Other', '✨', '#65676B', L.Sparkles],
}
export const cat = (c) => CATS[c] ?? CATS.other
