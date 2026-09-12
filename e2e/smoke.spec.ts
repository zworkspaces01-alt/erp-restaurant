import { test, expect, type Page } from "@playwright/test";

/** Every top-level route in the sidebar (see src/components/layout/nav-config.ts). */
const ROUTES = [
  "/dashboard",
  "/inventory",
  "/inventory/transactions",
  "/inventory/adjustments",
  "/menu",
  "/menu/engineering",
  "/orders",
  "/orders/new",
  "/suppliers",
  "/purchases",
  "/purchases/new",
  "/payments",
  "/employees",
  "/timekeeping",
  "/payroll",
  "/expenses",
  "/expenses/categories",
  "/reports/pnl",
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  return errors;
}

for (const route of ROUTES) {
  test(`trang ${route} hiển thị không lỗi`, async ({ page }) => {
    const errors = collectErrors(page);
    const response = await page.goto(route);
    expect(response?.status() ?? 0, "HTTP status").toBeLessThan(500);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Đã xảy ra lỗi khi tải trang")).toHaveCount(0);
    await expect(page.getByText("Application error")).toHaveCount(0);
    // Hydration / runtime errors surface here.
    const fatal = errors.filter((e) => !/favicon|third-party cookie|Download the React DevTools/i.test(e));
    expect(fatal, fatal.join("\n")).toEqual([]);
  });
}

test("chưa đăng nhập thì bị chuyển về /login", async ({ browser }) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
