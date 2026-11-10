// Run against a separate local server with SELLER360_DATA_DIR pointing at test data.
// Uses an isolated browser identifier and creates only local verification tasks.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const base = process.env.SELLER360_QA_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error(
    "Set SELLER360_QA_URL to the isolated local test server, e.g. http://127.0.0.1:3101",
  );
}
const layouts = async (page, base) => {
  const results = [];
  const errors = [];
  const network = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/api/") && r.status() >= 400)
      network.push({ status: r.status(), url: r.url() });
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
    [320, 667],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of [
      ["dashboard", "/"],
      ["nova", "/kam"],
      ["actions", "/actions"],
      ["suggestions", "/actions?view=suggestions"],
      ["history", "/history"],
      ["account", "/profile"],
      ["privacy", "/settings"],
    ]) {
      await page.goto(base + path);
      await page.locator("h1").waitFor();
      await page
        .getByRole("status")
        .filter({ hasText: /^Loading/ })
        .waitFor({ state: "hidden" });
      if (name === "dashboard") await page.getByRole("table").waitFor();
      if (name === "suggestions")
        await page
          .getByRole("button", { name: "Add to plan" })
          .first()
          .waitFor();
      const state = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        primaryLinks: document.querySelectorAll(".side-nav a").length,
        scheme: getComputedStyle(document.documentElement).colorScheme,
        animations: document
          .getAnimations()
          .filter((a) => a.playState === "running").length,
        disclosures: document.querySelectorAll(".source-disclosure").length,
      }));
      if (state.scrollWidth > width)
        throw Error(name + " overflow at " + width);
      if (state.primaryLinks !== 3) throw Error("Unexpected navigation");
      if (state.animations !== 0) throw Error("Idle animation at " + name);
      if (state.disclosures !== (name === "privacy" ? 1 : 0))
        throw Error("Repeated sample disclosure");
      results.push({ name, ...state });
      if (width === 1440 || width === 390 || width === 320)
        await page.screenshot({
          path: "test-results/redesign/final-" + name + "-" + width + ".png",
          fullPage: true,
        });
    }
  }
  if (errors.length || network.length)
    throw Error(JSON.stringify({ errors, network }));
  return { results, errors, network };
};
const journeys = async (page, base) => {
  const checks = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/");
  await page.evaluate(() =>
    localStorage.setItem("seller360.demo-session", crypto.randomUUID()),
  );
  await page.goto(base + "/actions?view=suggestions");
  await page.getByRole("button", { name: "Add to plan" }).first().click();
  await page.getByRole("button", { name: "In your plan" }).first().waitFor();
  checks.push("add suggestion");
  await page.getByRole("link", { name: /Your plan/ }).click();
  await page.getByRole("button", { name: "Start task" }).click();
  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await page.getByRole("button", { name: "Reopen" }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Mark complete" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Mark complete" }).waitFor();
  checks.push("start, complete, reopen and reload task");
  await page.goto(base + "/");
  await page.getByRole("table").waitFor();
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  if ((await page.evaluate(() => document.activeElement.id)) !== "main-content")
    throw Error("Skip link failed");
  await page.getByRole("link", { name: "Actions", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/actions");
  if (
    !(await page
      .locator("main h1")
      .evaluate((e) => e === document.activeElement))
  )
    throw Error("Route focus missing");
  checks.push("keyboard skip link, navigation and route heading focus");
  await page.goto(base + "/");
  await page.route("**/api/seller/performance", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test performance failure" }),
    }),
  );
  await page.reload();
  await page.getByRole("alert").waitFor();
  if (await page.getByRole("table").count())
    throw Error("False account figures after failed load");
  await page.unroute("**/api/seller/performance");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("table").waitFor();
  checks.push("performance failure and retry");
  await page.route("**/api/actions", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test task failure" }),
    }),
  );
  await page.goto(base + "/actions");
  await page
    .getByRole("alert")
    .filter({ hasText: "Test task failure" })
    .waitFor();
  await page.unroute("**/api/actions");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByRole("button", { name: "Mark complete" }).waitFor();
  checks.push("task failure and retry");
  await page.route("**/api/agent/history", (r) =>
    r.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test history failure" }),
    }),
  );
  await page.goto(base + "/history");
  await page.getByRole("alert").waitFor();
  if (await page.getByText("No saved conversations", { exact: true }).count())
    throw Error("False empty history");
  await page.unroute("**/api/agent/history");
  await page.getByRole("button", { name: "Retry" }).click();
  await page.getByText("No saved conversations", { exact: true }).waitFor();
  checks.push("history failure and retry");
  await page.goto(base + "/growth");
  await page.waitForURL("**/actions?view=suggestions");
  if (!page.url().includes("/actions?view=suggestions"))
    throw Error("Legacy growth not nested");
  checks.push("growth redirect");
  await page.goto(base + "/analytics");
  await page.getByRole("table").waitFor();
  if (!page.url().includes("#performance"))
    throw Error("Legacy analytics missing");
  checks.push("analytics redirect");
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  checks.push(
    "intentional scheme: " +
      (await page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      )),
  );
  return { checks, errors };
};
(async () => {
  fs.mkdirSync("test-results/redesign", { recursive: true });
  const browser = await chromium.launch({
    channel: "chromium",
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const layoutResults = await layouts(page, base);
    // Intentional API failures in journeys are checked independently of the clean sweep.
    page.removeAllListeners("response");
    const journeyResults = await journeys(page, base);
    if (journeyResults.errors.length)
      throw new Error(JSON.stringify(journeyResults.errors));
    const session = {
      id: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      stage: "greeting",
      messages: [
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Browser verification greeting.",
          timestamp: new Date().toISOString(),
        },
      ],
      statements: [],
      askedTopics: [],
      concern: "",
      diagnosis: {
        primaryIssue: "Review",
        supportingSignals: [],
        unresolvedQuestions: [],
      },
      recommendedActions: [],
      committedKeys: [],
      activity: [],
      summary: null,
      mode: "ollama",
      model: "browser-verification",
      fallbackReason: null,
      language: "en-IN",
    };
    let handoff = "";
    await page.route("**/api/agent/history", (r) =>
      r.fulfill({ json: { sessions: [] } }),
    );
    await page.route("**/api/agent/start", (r) =>
      r.fulfill({
        json: {
          session,
          assistantMessage: "Browser verification greeting.",
          actions: [],
        },
      }),
    );
    await page.route("**/api/agent/turn", async (r) => {
      handoff = r.request().postDataJSON().message;
      await new Promise((resolve) => setTimeout(resolve, 800));
      await r
        .fulfill({
          json: {
            session,
            assistantMessage: "Late response must not restart a canceled call.",
            actions: [],
          },
        })
        .catch(() => {});
    });
    const ended = {
      ...session,
      endedAt: new Date().toISOString(),
      stage: "ended",
    };
    await page.route("**/api/agent/end", (r) =>
      r.fulfill({
        json: { session: ended, assistantMessage: "", actions: [] },
      }),
    );
    await page.setViewportSize({ width: 320, height: 667 });
    await page.goto(base + "/actions?view=suggestions");
    await page.getByRole("textbox").fill("Review my dispatch capacity");
    await page.getByRole("button", { name: "Share in conversation" }).click();
    await page.getByText("Nova is thinking", { exact: true }).waitFor();
    const end = page.getByRole("button", { name: "End call", exact: true });
    await end.scrollIntoViewIfNeeded();
    const rect = await end.boundingBox();
    if (!rect || rect.y < 0 || rect.y + rect.height > 595)
      throw new Error("End call obscured by mobile navigation");
    await end.click();
    await page
      .getByText("Your conversation, ready to revisit.", { exact: true })
      .waitFor();
    await page.waitForTimeout(1000);
    if (handoff !== "Review my dispatch capacity")
      throw new Error("Growth note lost");
    if (
      await page
        .getByText("Late response must not restart a canceled call.", {
          exact: true,
        })
        .count()
    )
      throw new Error("Canceled reply appeared");
    await page.getByRole("button", { name: "Saved calls" }).click();
    await page.getByRole("button", { name: /Business check-in/ }).click();
    await page
      .getByText("Browser verification greeting.", { exact: true })
      .waitFor();
    journeyResults.checks.push(
      "controlled browser: growth handoff, 320px cancellation, late reply ignored, saved-call detail",
    );
    if (journeyResults.errors.length)
      throw new Error(JSON.stringify(journeyResults.errors));
    const result = { layoutResults, journeyResults };
    fs.writeFileSync(
      "test-results/redesign/browser-verification.json",
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
