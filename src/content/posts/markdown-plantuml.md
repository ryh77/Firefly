---
title: 画 PlantUML 的速成方法与版本追溯
published: 2026-04-22
description: 记录 PlantUML 的快速上手方法，以及如何通过 Git 管理 puml 源码来查看图表迭代过程。
tags: [PlantUML, Markdown, UML, 文档]
category: 画图工具
slug: markdown-plantuml
---

## 画 PlantUML 的速成方法与版本追溯

PlantUML 是一种使用纯文本描述图表的工具。你只需要写一段结构化语法，就可以生成时序图、类图、用例图、活动图等常见工程图。

它特别适合写在技术博客、详细设计方案、需求说明文档和接口联调文档里：

- **图表源码可以和正文一起版本管理**，便于协作与审阅
- **修改图只需要改文本**，适合频繁迭代
- <mark>可以通过 Git 管理 `.puml` 文件，直接查看每一次图表关系的调整记录</mark>
- 能和 Markdown 无缝结合，保持文档统一

## 使用背景

在整理需求说明、详细设计方案或者技术方案时，经常需要画清楚业务流程、系统边界、模块依赖、接口调用链路和状态流转。普通截图或者手动画图后期维护成本比较高，一旦流程改动，就要重新拖拽调整。

PlantUML 更适合这类需要长期维护的技术文档：**图表本身就是文本**，可以跟代码和文档一起提交到 Git，评审时也能直接看到具体改了哪条关系。对后端接口、前后端联调、部署链路、权限流程这类内容来说，用文本维护图表会更稳定。

如果把图表单独保存成 `.puml` 文件，后续可以直接通过 `git diff` 查看这张图每次改了哪些节点、哪些关系、哪些流程判断。<mark>这比只保存一张导出的图片更适合长期迭代</mark>，尤其适合需求反复调整、详细设计多轮评审的场景。

## 常用渲染方式

常用方式主要有三种：

- **在线渲染**：可以使用 [PlantText](https://www.planttext.com/) 这类在线工具，把 PlantUML 语法粘贴进去后直接预览和导出图片。
- **IDEA 插件**：在 IDEA 中安装 PlantUML 相关渲染插件，新建 `.puml` 类型文件，按 `@startuml` 和 `@enduml` 包裹图表内容，就可以在编辑器里预览渲染效果。部分图表可能还需要本机安装 Graphviz。
- **Markdown 文章**：在 Markdown 中使用 `plantuml` 代码块，把图表和文章内容放在一起，适合写技术博客或项目文档。

如果你想快速上手，可以记住这个最小模板：

````md
```plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi
@enduml
```
````

上面是文章里真正写进去的源码。下面再放一份渲染效果，方便对照：

```plantuml
@startuml
Alice -> Bob: Hello
Bob --> Alice: Hi
@enduml
```

## 活动图示例

```plantuml
@startuml
start
:用户提交订单;
if (库存充足?) then (是)
	:冻结库存;
	:创建支付单;
	if (支付成功?) then (是)
		:生成发货单;
		:通知仓库拣货;
	else (否)
		:取消订单;
		:释放库存;
	endif
else (否)
	:提示缺货;
endif
stop
@enduml
```

## 状态图示例

```plantuml
@startuml
[*] --> 草稿

草稿 --> 待审核 : 提交
待审核 --> 草稿 : 驳回
待审核 --> 已发布 : 审核通过
已发布 --> 已归档 : 到期归档
已发布 --> 草稿 : 撤回修改

state 已发布 {
	[*] --> 可见
	可见 --> 隐藏 : 手动隐藏
	隐藏 --> 可见 : 恢复展示
}

已归档 --> [*]
@enduml
```

## 用例图示例

```plantuml
@startuml
left to right direction
actor 游客
actor 用户
actor 管理员

rectangle 博客系统 {
	usecase "浏览文章" as UC1
	usecase "搜索内容" as UC2
	usecase "发表评论" as UC3
	usecase "点赞收藏" as UC4
	usecase "审核评论" as UC5
	usecase "发布文章" as UC6
}

游客 --> UC1
游客 --> UC2
用户 --> UC1
用户 --> UC2
用户 --> UC3
用户 --> UC4
管理员 --> UC5
管理员 --> UC6
@enduml
```

## 组件图示例

```plantuml
@startuml
package "Tech Blog Site" {
	[Astro App] as App
	[Markdown Parser] as Parser
	[PlantUML Encoder] as Encoder
	[Theme Switcher] as Theme
	[Search Indexer] as Search
}

cloud "PlantUML Server" as PU
database "Content Store" as Content

App --> Parser : parse markdown
Parser --> Encoder : encode plantuml blocks
Encoder --> PU : request svg
App --> Theme : switch dark/light src
App --> Search : build page index
Parser --> Content : read posts
@enduml
```

## 部署图示例

```plantuml
@startuml
node "User Device" {
	artifact "Browser"
}

node "CDN / Edge" {
	artifact "Static Assets"
}

node "Cloudflare Worker" {
	artifact "SSR Handler"
}

node "PlantUML Service" {
	artifact "SVG Renderer"
}

database "Object Storage" {
	artifact "Markdown Content"
}

"Browser" --> "Static Assets" : GET js/css/img
"Browser" --> "SSR Handler" : request page
"SSR Handler" --> "Markdown Content" : read post
"Browser" --> "SVG Renderer" : fetch diagram svg
@enduml
```

## ER 图示例

```plantuml
@startuml
entity User {
	*id : uuid <<PK>>
	--
	username : varchar
	email : varchar
	created_at : datetime
}

entity Post {
	*id : uuid <<PK>>
	--
	author_id : uuid <<FK>>
	title : varchar
	content : text
	published_at : datetime
}

entity Comment {
	*id : uuid <<PK>>
	--
	post_id : uuid <<FK>>
	user_id : uuid <<FK>>
	body : text
	created_at : datetime
}

User ||--o{ Post : writes
User ||--o{ Comment : creates
Post ||--o{ Comment : has
@enduml
```

## 时序图示例（登录与刷新令牌）

```plantuml
@startuml
autonumber
actor User as 用户
participant Web as 前端页面
participant API as 网关接口
participant Auth as 认证服务
database Redis as 会话缓存

用户 -> 前端页面 : 输入账号密码并提交
前端页面 -> 网关接口 : POST /login
网关接口 -> 认证服务 : 校验凭据
认证服务 -> 会话缓存 : 写入 refresh_token
认证服务 --> 网关接口 : access_token + refresh_token
网关接口 --> 前端页面 : 200 登录成功

... access_token 过期 ...

前端页面 -> 网关接口 : POST /refresh
网关接口 -> 认证服务 : 校验 refresh_token
认证服务 -> 会话缓存 : 轮换 refresh_token
认证服务 --> 网关接口 : 新 access_token
网关接口 --> 前端页面 : 200 新令牌
@enduml
```

## C4 风格容器图示例

```plantuml
@startuml
!includeurl https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(user, "博客访客", "阅读文章与搜索内容")

System_Boundary(system, "Tech Blog") {
	Container(web, "Web App", "Astro + Svelte", "渲染页面与交互")
	Container(worker, "SSR Worker", "Cloudflare Workers", "处理服务端渲染请求")
	ContainerDb(content, "Content Store", "Markdown / Object Storage", "存储文章与资源元数据")
	Container(search, "Search Index", "Pagefind", "提供全文检索")
}

System_Ext(plantuml, "PlantUML Server", "生成 SVG 图表")

Rel(user, web, "访问", "HTTPS")
Rel(web, worker, "请求 SSR 页面", "HTTPS")
Rel(worker, content, "读取文章")
Rel(web, search, "查询关键词")
Rel(web, plantuml, "请求图表 SVG")

LAYOUT_LEFT_RIGHT()
@enduml
```
