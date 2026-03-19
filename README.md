# 私人优选IP管理

一个帮你自建 Cloudflare 优选 IP 库的小工具，


-   **纯网页**: 不用下载和安装任何客户端软件。只要有浏览器就能测出优选IP。
-   **私人IP库**: 用这个工具，测出来的都是你自己的，干净、高速，不怕 IP 被滥用导致连不上或被封。
-   **多场景管理**: 家里、公司、手机流量，网络环境不一样，好用的 IP 也不一样。你可以给不同场景建个分组，比如“公司摸鱼专用”、“回家看片专用”。
-   **订阅API**: 生成一个订阅链接。带参数筛选，把这个链接扔进其他大佬的工具里（自己去了解，本项目不做分享），以后就不用手动换 IP 了。这边测速更新了，那边自动就用上最新。

所有测速数据、IP 列表和配置都存在你自己的 Cloudflare KV 里面，别人谁也看不见，安全。


## 部署教程 (Deployment Guide)

推荐使用 GitHub + Cloudflare Pages 的方式进行全自动部署。🚀 你只需要将代码推送到你的 GitHub 仓库，Cloudflare 就会自动完成构建和部署。


### 步骤 1: Fork 本项目到你的 GitHub

首先，你需要有自己的 GitHub 账号。 登录后，访问本项目 GitHub 主页，点击页面右上角的 **Fork** 按钮，将项目复制到你自己的仓库中。 🍴

### 步骤 2: 在 Cloudflare 创建所需服务

在部署之前，我们需要在 Cloudflare 上创建一个用于存储数据的 KV 存储空间。 ☁️

-   登录 Cloudflare Dashboard。
-   在右侧菜单中选择 `Workers & Pages` -> `KV`。
-   点击 `Create a namespace`，输入一个名称（例如 `IP_KV`），然后创建。
### 步骤 3: 连接 GitHub 并部署
-   在 Cloudflare Dashboard，进入 `Workers & Pages`。
    -   点击 `Create application(创建应用程序)`  -> `想要部署 Pages？开始使用` -> `Connect to Git(导入现有 Git 存储库)` 。
-   选择你刚刚 Fork 的仓库，点击 `Begin setup`（开始设置）。
-   **配置构建设置 (非常重要):**
    -   **Project name (项目名称)**: 随便起个你喜欢的名字。
    -   **Production branch (生产分支)**: 保持 `main` 或 `master` 不变。 🌿
    -   **Framework preset(框架预设)**: 选择 `无`。
    -   **Build command(构建命令)**: 确保这里是 `npm run build`。 🔨
    -   **Build output directory(构建输出目录)** : 确保是 `dist`。 📦
-   点击 `Save and Deploy（保存并部署）`。Cloudflare 会开始第一次构建，这次构建**可能会失败或者不完整**，因为我们还没配置环境变量和 KV，别急，继续下一步。

### 步骤 4: 配置项目

等待第一次部署结束后（无论成功失败），进入你新创建的 Pages 项目，点击 `Settings（设置）`。 ⚙️

#### a. 添加环境变量
-   进入 `Settings（设置）` -> `Environment variables（变量和机密）`。
    -   点击 `Add (添加)`，添加以下三个 **Production** (生产环境) 环境变量，值要换成你自己的，越复杂越好：
    -   `LOGINPW`: 你的后台登录密码。
    -   `JWT_SECRET`: 随便一长串随机字符，用于会话安全。
    -   `APITOKEN`: 订阅链接用的，也随便一长串。

#### b. 绑定 KV 存储 
-   进入 `Settings` -> `Functions`。
-   向下滚动到 `KV Namespace Bindings`，点击 `Add binding`。
    -   **Variable name** (变量名): **必须**填写 `IP_KV`。
    -   **KV namespace** (KV 命名空间): 选择你在 **步骤 2** 创建的那个 KV 命名空间。
-   点击 `Save`。

### 步骤 5: 重新部署，大功告成！

所有配置都完成后，我们需要让配置生效。 ✅

-   回到项目的 `Deployments` 标签页。
    -   找到最新的那条部署记录，点击右边的 `查看详细信息`，选择管理部署-> `Retry deployment` (重试部署)。
-   等待部署流程走完，你的私人优选 IP 管理系统就上线了！

## 🛠️ 技术栈
-   **前端**: React, Vite, TypeScript, Tailwind CSS
-   **后端**: Cloudflare Pages Functions
-   **数据**: Cloudflare KV

---
# 私人优选IP管理展示
![Image](https://github.com/user-attachments/assets/93926bce-94b0-4bc5-ba9e-a3ee0e668f82)

&copy; 本系统仅用于个人学习和研究目的，禁止用于任何商业用途。请勿将优选IP用于任何违反Cloudflare服务条款和违反法律法规的活动。 ⚖️
