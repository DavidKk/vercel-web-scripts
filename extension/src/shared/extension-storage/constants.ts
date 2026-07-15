/** @deprecated Migrated to {@link SCRIPTKEY_RULES_PREFIX}{scriptKey} buckets. */
export const RULES_STORAGE_KEY = 'vws_extension_rules'
export const GM_STORAGE_PREFIX = 'vws_gm_'
/** @deprecated Migrated to {@link SCRIPT_LIST_CACHE_KEY} */
export const SCRIPT_LIST_STORAGE_KEY = 'vws_extension_script_list'

export const SCRIPT_LIST_CACHE_KEY = 'vws_extension_script_list_cache'

/** Extension master switch — when false, preset/scripts are not injected on any tab. */
export const SHELL_MASTER_ENABLED_STORAGE_KEY = 'vws_extension_shell_master_enabled'
/** Session-scoped tab ids where the master switch is off (global may still be on). */
export const SHELL_DISABLED_TAB_IDS_STORAGE_KEY = 'vws_extension_shell_disabled_tab_ids'
/**
 * Session-scoped tab ids auto-disabled for Cloudflare `__cf_chl_rt_tk` challenges
 * via the same {@link SHELL_DISABLED_TAB_IDS_STORAGE_KEY} list as “This tab only”.
 * Used so the tab can be re-enabled once the challenge URL is gone without clearing manual disables.
 */
export const SHELL_CF_CHALLENGE_AUTO_DISABLED_TAB_IDS_STORAGE_KEY = 'vws_extension_shell_cf_challenge_auto_disabled_tab_ids'
