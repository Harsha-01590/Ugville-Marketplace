// Shared — Barrel Export
// Trimmed for the standalone Marketplace project: only BasePage (every page
// object extends it) and ModalComponent (used by the `_dismissStrayModal`
// auto-fixture) are needed. Header/Footer/Nav/UtilityBar/PeopleDirectory and
// the login-sanity workflow are not used anywhere under src/tests/marketplace.
export { BasePage } from './pages/base/BasePage';
export { ModalComponent } from './components/ModalComponent';
