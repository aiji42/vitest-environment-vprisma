// @vitest-environment-options { "baseEnv": "jsdom" }
describe("baseEnv", () => {
  test("jsdom is set as the base environment", () => {
    expect(window.navigator).toBeTruthy();
    expect(window.document).toBeTruthy();
    expect(Headers).toBeTruthy();
  });
});
