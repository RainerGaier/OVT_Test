import { afterEach, expect, test, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth() }));

afterEach(() => auth.mockReset());

async function importRoutes() {
  const list = await import("@/app/api/readings/route");
  const sample = await import("@/app/api/readings/sample/route");
  return { GET: list.GET, POST: sample.POST };
}

test("GET returns 401 when unauthenticated", async () => {
  auth.mockResolvedValue(null);
  const { GET } = await importRoutes();
  const res = await GET(new Request("http://t/api/readings") as never);
  expect(res.status).toBe(401);
});

test("GET returns 400 for an invalid days value", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET } = await importRoutes();
  const res = await GET(new Request("http://t/api/readings?days=5") as never);
  expect(res.status).toBe(400);
});

test("POST sample generates rows, then GET returns them within range", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET, POST } = await importRoutes();

  const post = await POST();
  expect(post.status).toBe(201);
  expect(await post.json()).toEqual({ count: 180 });

  const res = await GET(new Request("http://t/api/readings?days=90") as never);
  expect(res.status).toBe(200);
  expect(await res.json()).toHaveLength(180);
});

test("GET defaults to 30 days when days is absent", async () => {
  const { makeUser } = await import("../factories/user");
  const user = await makeUser();
  auth.mockResolvedValue({ user: { id: user.id } });
  const { GET, POST } = await importRoutes();
  await POST();
  const res = await GET(new Request("http://t/api/readings") as never);
  const body = (await res.json()) as unknown[];
  expect(body.length).toBeGreaterThan(0);
  expect(body.length).toBeLessThan(180);
});
