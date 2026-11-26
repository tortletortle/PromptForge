import { expect, test } from "@playwright/test";

test("asset → project/task → compile → export → history", async ({ page }) => {
  const suffix = String(Date.now());
  const assetName = "E2E prompt " + suffix;
  const projectName = "E2E project " + suffix;
  const taskName = "E2E task " + suffix;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "提示词资产库" })).toBeVisible();

  await page.locator(".page-heading").getByRole("button", { name: "新建模块" }).click();
  await page.getByPlaceholder("例如：代码审查标准").fill(assetName);
  await page.locator(".content-editor").fill("Write concise technical guidance for {{ audience }}.");
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
  await expect(page.getByLabel("变量值：audience")).toHaveValue("engineering teams");
  await page.locator(".compile-button").click();

  await expect(page.locator(".success-pill")).toContainText("BUILD PASSED");
  await expect(page.locator(".code-preview pre")).toContainText("engineering teams");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出文件" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.mdc$/);

  await page.getByRole("button", { name: "编译历史" }).click();
  await expect(page.locator(".history-table tbody tr")).toHaveCount(1);
  await page.screenshot({ path: "test-results/promptforge-workflow.png", fullPage: true });
});

test("role-aware editing persists versions and previews ordered messages with source links", async ({ page }) => {
  const suffix = String(Date.now());
  const systemName = "System role " + suffix;
  const developerName = "Developer role " + suffix;
  const userName = "User role " + suffix;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "提示词资产库" })).toBeVisible();

  async function createRoleAsset(name: string, role: "system" | "developer" | "user", content: string, dependencyId?: string): Promise<string> {
    await page.locator(".page-heading").getByRole("button", { name: "新建模块" }).click();
    await page.getByPlaceholder("例如：代码审查标准").fill(name);
    await page.getByLabel("提示词角色").selectOption(role);
    await page.locator(".content-editor").fill(content);
    if (dependencyId) {
      await page.locator(".advanced-settings").evaluate((element) => { (element as HTMLDetailsElement).open = true; });
      await page.getByPlaceholder("填写需要先加载的模块 ID").fill(dependencyId);
    }
    await page.getByRole("button", { name: "保存模块" }).click();
    await expect(page.locator(".success-feedback")).toContainText("模块已保存");
    await page.locator(".advanced-settings").evaluate((element) => { (element as HTMLDetailsElement).open = true; });
    return page.locator(".asset-editor input[readonly]").inputValue();
  }

  const systemId = await createRoleAsset(systemName, "system", "You are a reliable assistant.");
  const developerId = await createRoleAsset(developerName, "developer", "Follow the engineering policy.", systemId);
  const userId = await createRoleAsset(userName, "user", "Answer this request.", developerId);

  await page.getByRole("button", { name: "组合工作台" }).click();
  const rows = page.locator(".selectable-asset");
  for (let index = 0; index < await rows.count(); index += 1) {
    const row = rows.nth(index);
    const text = await row.innerText();
    const checkbox = row.locator('input[type="checkbox"]');
    const shouldSelect = [systemName, developerName, userName].some((name) => text.includes(name));
    if (shouldSelect && !(await checkbox.isChecked())) await checkbox.check({ force: true });
    if (!shouldSelect && (await checkbox.isChecked())) await checkbox.uncheck({ force: true });
  }

  await page.getByLabel("目标平台").selectOption("api");
  await page.locator(".compile-button").click();
  await expect(page.locator(".success-pill")).toContainText("BUILD PASSED");
  await page.getByRole("tab", { name: /结构化消息/ }).click();
  await expect(page.getByTestId("compiled-message")).toHaveCount(3);
  await expect(page.locator(".message-card .role-badge")).toHaveText(["系统指令", "开发者指令", "用户输入"]);
  await expect(page.locator(".message-card").nth(0).locator(".message-sources")).toContainText(systemName);
  await expect(page.locator(".message-card").nth(1).locator(".message-sources")).toContainText(developerName);
  await expect(page.locator(".message-card").nth(2).locator(".message-sources")).toContainText(userName);

  await page.getByRole("button", { name: "提示词库" }).click();
  await page.locator(".asset-card").filter({ hasText: userName }).click();
  await page.getByLabel("提示词角色").selectOption("system");
  await page.getByRole("button", { name: "保存模块" }).click();
  await expect(page.locator(".success-feedback")).toContainText("版本 2");
  const versions = page.getByLabel("恢复历史版本");
  await expect(versions).toContainText("用户输入");
  await expect(versions).toContainText("v1");

  await page.getByRole("button", { name: "组合工作台" }).click();
  await page.locator(".compile-button").click();
  await expect(page.locator(".error-diagnostics")).toContainText("ROLE_DEPENDENCY_ORDER_CONFLICT");
  await expect(page.locator(".diagnostic-links button")).toContainText([userName, developerName]);
  await expect(page.locator(".success-pill")).toHaveCount(0);

  expect(systemId).not.toBe(developerId);
  expect(developerId).not.toBe(userId);
  await page.screenshot({ path: "test-results/promptforge-role-aware.png", fullPage: true });
});
