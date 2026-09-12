import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

setup("đăng nhập bằng tài khoản demo", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL ?? "admin@restaurant.local");
  await page.getByLabel("Mật khẩu").fill(process.env.E2E_PASSWORD ?? "Admin@123");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
