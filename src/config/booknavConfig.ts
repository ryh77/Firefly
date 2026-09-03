import type { BooknavGroup, BooknavPageConfig } from "../types/booknavConfig";

// 书签导航页面配置
export const booknavPageConfig: BooknavPageConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "书签导航",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "整理一些开发、部署和排错时常用的网站。",

	// favicon 自动获取配置
	favicon: {
		// 书签未填写 icon 时，是否自动获取目标站点的 favicon 图标
		enabled: true,

		// favicon 接口地址，{domain} 为占位符，会被替换成目标站点域名
		// 更换接口只需保证地址里含有 {domain}，例如：
		//   https://a.favicon.im/{domain}
		//   https://favicon.im/{domain}
		api: "https://a.favicon.im/{domain}",
	},
};

// 书签导航配置
// 每个数组项是一个分类组，分类组内的 items 是该分类下的书签
export const booknavConfig: BooknavGroup[] = [
	{
		id: "dev",
		name: "开发",
		icon: "material-symbols:code-rounded",
		desc: "写代码时离不开的站点",
		weight: 100,
		items: [
			{
				title: "Spring 官方文档",
				url: "https://spring.io/projects/spring-boot",
				desc: "Spring Boot 官方项目文档",
				weight: 10,
			},
			{
				title: "MDN Web Docs",
				url: "https://developer.mozilla.org",
				desc: "最权威的 Web 技术文档",
				weight: 9,
			},
			{
				title: "Vue",
				url: "https://cn.vuejs.org",
				desc: "Vue 中文官方文档",
				weight: 8,
			},
			{
				title: "TypeScript",
				url: "https://www.typescriptlang.org/docs/",
				desc: "TypeScript 官方文档",
				weight: 7,
			},
			{
				title: "Maven Repository",
				url: "https://mvnrepository.com",
				desc: "查询 Java 依赖版本",
				weight: 6,
			},
		],
	},
	{
		id: "backend",
		name: "后端",
		icon: "material-symbols:deployed-code-outline",
		desc: "后端开发常用资料",
		weight: 90,
		items: [
			{
				title: "MyBatis-Plus",
				url: "https://baomidou.com",
				desc: "MyBatis-Plus 官方文档",
				weight: 10,
			},
			{
				title: "Hutool",
				url: "https://hutool.cn",
				desc: "Java 工具类库文档",
				weight: 9,
			},
			{
				title: "EasyPOI",
				url: "https://easypoi.mydoc.io",
				desc: "Office 文档导入导出工具资料",
				weight: 8,
			},
			{
				title: "Docker Docs",
				url: "https://docs.docker.com",
				desc: "Docker 官方文档",
				weight: 7,
			},
		],
	},
	{
		id: "ops",
		name: "部署运维",
		icon: "material-symbols:terminal",
		desc: "部署、服务器和排错资料",
		weight: 85,
		items: [
			{
				title: "Nginx 文档",
				url: "https://nginx.org/en/docs/",
				desc: "Nginx 官方文档",
				weight: 10,
			},
			{
				title: "Linux 命令手册",
				url: "https://wangchujiang.com/linux-command/",
				desc: "常用 Linux 命令查询",
				weight: 9,
			},
			{
				title: "SSL Labs",
				url: "https://www.ssllabs.com/ssltest/",
				desc: "HTTPS 证书和 TLS 配置检测",
				weight: 8,
			},
		],
	},
	{
		id: "design",
		name: "设计",
		icon: "material-symbols:palette-outline-rounded",
		desc: "配色、图标与灵感来源",
		weight: 90,
		items: [
			{
				title: "Iconify",
				url: "https://icon-sets.iconify.design",
				desc: "海量开源图标集合搜索",
				weight: 10,
			},
			{
				title: "iconfont",
				url: "https://www.iconfont.cn",
				desc: "阿里巴巴矢量图标库",
				weight: 9,
			},
		],
	},
	{
		id: "tools",
		name: "工具",
		icon: "material-symbols:build-outline-rounded",
		desc: "顺手的在线小工具",
		weight: 80,
		items: [
			{
				title: "TinyPNG",
				url: "https://tinypng.com",
				desc: "在线压缩 PNG / JPEG 图片",
				weight: 10,
			},
			{
				title: "Squoosh",
				url: "https://squoosh.app",
				desc: "Google 出品的图片压缩与格式转换",
				weight: 9,
			},
			{
				title: "Carbon",
				url: "https://carbon.now.sh",
				desc: "把代码片段生成漂亮的图片",
				weight: 8,
			},
		],
	},
	{
		id: "resources",
		name: "资源",
		icon: "material-symbols:auto-stories-outline-rounded",
		desc: "文档、教程与阅读",
		weight: 70,
		items: [
			{
				title: "CSDN",
				url: "https://www.csdn.net",
				desc: "中文技术文章和问题检索",
				weight: 10,
			},
			{
				title: "掘金",
				url: "https://juejin.cn",
				desc: "开发者技术内容社区",
				weight: 9,
			},
		],
	},
];
