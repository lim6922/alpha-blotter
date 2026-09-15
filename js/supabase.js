const SUPABASE_URL = "https://xbyaoqswxqpketnyypar.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SbGxy3_eggP3jkgq-9qk-g_kIjpmVH3";

const authStorage = (() => {
  try {
    const testKey = '__alpha_blotter_auth_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (error) {
    console.warn('localStorage unavailable for auth persistence, falling back to sessionStorage');
    return window.sessionStorage;
  }
})();

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage
  }
});