# GitHub 提交与黑客松展示指南

## 一、只提交哪个目录

只把当前 `site` 项目目录作为独立仓库：

```text
<你的本地项目目录>\site
```

不要在上一级 `雅思备考` 目录直接提交。上一级包含个人学习资料、分析文档和资源路径，不属于公开项目。

## 二、提交前必须确认

1. **隐私**：公开版本已经使用匿名学习画像。不要再加入真实姓名、学校、申请项目、具体成绩、单位、联系方式或完整学习记录。
2. **版权**：不要添加书籍、PDF、真题原文、答案、音频或课程文件。仓库只展示方法、规则和代码。
3. **密钥**：不要把 API Key 写入源码、`.env`、截图、Issue、Commit message 或 README。
4. **许可证**：当前没有 LICENSE。若希望允许评委或其他开发者复用代码，再由你选择合适的开源许可证。
5. **仓库可见性**：黑客松通常需要可访问链接，建议建立 Public 仓库；若规则允许 Private，需提前给评委访问权限。

## 三、在 GitHub 创建空仓库

1. 登录 GitHub，点击 **New repository**。
2. 推荐仓库名：`ielts-ai-study-planner`。这个名称同时覆盖 `IELTS`、`AI` 和 `study planner` 三组核心搜索词。
3. Description 可填写：

   ```text
   AI-assisted IELTS study planner for adaptive IELTS preparation, evidence-based progress reviews, offline use, and privacy-first API storage.
   ```

4. 不要勾选自动创建 README、`.gitignore` 或 License，本地已经准备好相关文件。
5. 创建仓库后复制 HTTPS 地址，例如：

   ```text
   https://github.com/<你的用户名>/ielts-ai-study-planner.git
   ```

## 四、在本地初始化并提交

在 PowerShell 中逐行执行：

```powershell
Set-Location -LiteralPath '<你的本地项目目录>\site'
git init
git branch -M main
git add .
git status
git diff --cached --stat
git commit -m "feat: publish IELTS Study Handbook"
git remote add origin https://github.com/<你的用户名>/ielts-ai-study-planner.git
git push -u origin main
```

`git status` 是必须检查的一步。预期只看到源码、测试、工作流和公开文档；不应看到 `node_modules`、`dist`、`.openai`、`qa`、日志或 `.env`。

如果 Git 提示没有配置身份，先执行：

```powershell
git config --global user.name "你的 GitHub 用户名"
git config --global user.email "你的 GitHub 邮箱或 noreply 邮箱"
```

如果已经存在错误的 `origin`：

```powershell
git remote set-url origin https://github.com/<你的用户名>/ielts-ai-study-planner.git
```

## 五、打开在线演示

1. 进入仓库 **Settings → Pages**。
2. 在 **Build and deployment** 中选择 **GitHub Actions**。
3. 打开仓库 **Actions** 页面，等待 `Deploy GitHub Pages` 变为绿色。
4. 在线地址通常是：

   ```text
   https://<你的用户名>.github.io/ielts-ai-study-planner/
   ```

如果 Pages 构建失败，优先查看失败步骤，不要重复提交相同代码。常见原因是 Actions 未启用、Pages 来源未选 GitHub Actions，或仓库默认分支不是 `main`。

## 六、黑客松页面怎样介绍

### 一句话版本

> 这不是在线题库，而是一个能根据学习证据、现实时间和心理状态持续修正的一年制 IELTS 规划系统。

### 30 秒版本

> 许多学习计划只规定每天做什么，无法处理分数波动、拖延、时间不足和方法失效。这个项目把学习计划、五科方法、阶段验收、红线和修订记录整合到一个本地优先的网站中。用户记录真实情况后，系统先判断证据是否可靠，再通过受约束规则提出有限调整；可选 AI 只整理输入，不能擅自修改目标或阶段。API 配置可以在浏览器本地加密保存。

### 建议演示顺序

1. 打开“当前计划”，展示自动日期、本月任务和红线；
2. 打开“路线图”，说明每个阶段靠验收证据晋级；
3. 打开“方法手册”，展示某一科的常见问题和验证标准；
4. 在“更新情况”输入一次状态或进度变化，展示有限调整；
5. 打开“修订记录”，说明历史不会被静默覆盖；
6. 最后展示 API 配置的加密保存，并强调 AI 权限边界。

## 七、提交链接前的最后检查

- GitHub 仓库首页能正常显示 README；
- Actions 中测试和构建均为绿色；
- Pages 链接在未登录窗口中可以打开；
- 桌面和手机宽度下均能导航；
- 页面内没有你的真实 API Key；
- README 中的本地运行命令在干净目录可执行；
- 黑客松提交页同时填写 GitHub 仓库链接和 Pages 演示链接；
- 截止前不要做大规模依赖升级或界面重构。
