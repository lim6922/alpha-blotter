const SUPABASE_URL = "https://xbyaoqswxqpketnyypar.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieWFvcXN3eHFwa2V0bnl5cGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTA2OTQsImV4cCI6MjA4ODQ2NjY5NH0.9hPbqLS9C9c5onmb6idJUVYVidXSdkLq2ywhejDf9JI";

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
