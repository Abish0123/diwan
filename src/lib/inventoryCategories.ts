// Single source of truth for item categories — shared by Stock and Vendors
// so a vendor's "Products Supplied" category and a stock item's category use
// the same taxonomy (previously Vendors used Stationery/Technology/
// Maintenance/Furniture/Medical while Stock used a different list entirely,
// so "which vendors supply my IT Equipment?" had no reliable answer).
export const STOCK_CATEGORIES = [
  "Books",
  "Stationery",
  "Lab Equipment",
  "Sports Equipment",
  "IT Equipment",
  "Furniture",
  "Cleaning Supplies",
  "Cafeteria Supplies",
];

// Which of the categories above are durable enough to track as a fixed
// asset (Finance > Assets) rather than a consumable that's just stock —
// recording a Purchase in one of these categories also creates a real
// AssetRecord (see inventory/Purchases.tsx), instead of the purchase only
// ever showing up as a stock-count change.
export const ASSET_WORTHY_CATEGORIES = new Set([
  "Lab Equipment",
  "Sports Equipment",
  "IT Equipment",
  "Furniture",
]);
