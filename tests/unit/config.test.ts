import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSupabase, isDemo } from "@/lib/config";
afterEach(() => vi.unstubAllEnvs());
describe("sample archive isolation", () => {
  it("requires explicit opt-in", () => { vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); expect(isDemo()).toBe(false); expect(hasSupabase()).toBe(false); });
  it("enables fixtures only with no real database configuration", () => { vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""); expect(isDemo()).toBe(true); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); expect(isDemo()).toBe(false); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test"); expect(isDemo()).toBe(false); expect(hasSupabase()).toBe(true); });
  it("does not let partial configuration unlock fixtures", () => { vi.stubEnv("DEMO_MODE", "true"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "key"); expect(isDemo()).toBe(false); });
});
