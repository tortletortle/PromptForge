import { expect, test } from "@playwright/test";

test("asset → project/task → compile → export → history", async ({ page }) => {
  const suffix = String(Date.now());
  const assetName = "E2E prompt " + suffix;
  const projectName = "E2E project " + suffix;
  const taskName = "E2E task " + suffix;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "提示词资产库" })).toBeVisible();

  await page.getByRole("button", { name: "新建模块" }).click();
  await page.getByPlaceholder("例如：代码审查标准").fill(assetName);
  await page.locator(".content-editor").fill("Write concise technical guidance for {{ audience }}.");
  await page.locator(".json-editor").fill('[{"name":"audience","required":true}]');
  await page.getByRole("button", { name: "保存模块" }).click();
  await expect(page.locator(".success-feedback")).toContainText("模块已保存");

  await page.getByRole("button", { name: "组合工作台" }).click();
  await page.getByPlaceholder("例如：Prompt Engineering").fill(projectName);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.locator(".project-switcher-copy strong")).toHaveText(projectName);

  await page.getByPlaceholder("新任务名称...").fill(taskName);
  await page.locator(".task-context-editor").fill('{"audience":"engineering teams"}');
  await page.getByRole("button", { name: /添加任务/ }).click();

  const assetRow = page.locator(".selectable-asset").filter({ hasText: assetName });
  await expect(assetRow).toBeVisible();
  await assetRow.locator('input[type="checkbox"]').check({ force: true });
  await page.locator(".compile-button").click();

  await expect(page.locator(".success-pill")).toContainText("BUILD PASSED");
  await expect(page.locator(".code-preview pre")).toContainText("engineering teams");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mdc$/);

  await page.getByRole("button", { name: "编译历史" }).click();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(1);
});
