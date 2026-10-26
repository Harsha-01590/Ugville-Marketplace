// Seller module — Barrel Export
// Trimmed for the standalone Marketplace project: only the pieces the
// Marketplace tests/fixtures actually touch — SellerLeadPage (a Marketplace
// deal ultimately opens a seller Opportunity record) and the
// MarketplaceListingComponent it embeds.
export { SellerLeadPage } from './pages/SellerLeadPage';
export { MarketplaceListingComponent } from './components/MarketplaceListingComponent';
export type { MarketplaceDealType } from './components/MarketplaceListingComponent';
