import { vi } from "vitest";

vi.mock("./src/client", () => ({
  client: vPrisma.client,
}));
