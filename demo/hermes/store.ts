// The one generated Brightline Labs company for this page load, and the moment it was generated "as of".

import { HERMES_SEED } from './config';
import { generateCompany } from './data/generate';
import type { Company } from './data/types';

const MINUTE_MS = 60_000;
const LOADED_AT = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

export const COMPANY: Company = generateCompany(HERMES_SEED, new Date(LOADED_AT));

/** "Now" for the demo: the load time rounded down to the minute, so the data and the clock agree for the whole session. */
export function hermesNow(): Date {
  return new Date(LOADED_AT);
}
