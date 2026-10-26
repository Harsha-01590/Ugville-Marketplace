/**
 * Ugville application routes (relative to baseURL).
 */
export enum Routes {
  // Auth
  LOGIN = '/ugville/login',

  // Core
  HOME = '/ugville/',

  // CRM
  OPPORTUNITY_DETAIL = '/ugville/crm/opportunity',
  CONTACT_DETAIL = '/ugville/crm/contact',
  PROJECT_DETAIL = '/ugville/crm/project',
  ACCOUNT_DETAIL = '/ugville/crm/account',

  // Business / Vendor
  VENDOR_HOME = '/ugville/business/vendor-home',
  VENDOR_DETAIL = '/ugville/business/vendor-detail',

  // Marketplace
  MARKETPLACE = '/ugville/market-place',

  // Community
  ARTICLE = '/ugville/article',

  // Utility Bar / Quick Links
  FRANCHISE_REFERRALS = '/ugville/franchise-referrals',

  // User Menu
  PROFILE = '/ugville/users/profile',
  SETTINGS = '/ugville/users/settings',
  PAYMENT_CENTER = '/ugville/business/payment-center',
}
