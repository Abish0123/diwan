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
