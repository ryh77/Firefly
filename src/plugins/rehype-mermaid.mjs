import { readFile } from "node:fs/promises";
import { assertSafeSvgForDom, initMerman, renderSvg } from "@mermanjs/web";
import { fromHtml } from "hast-util-from-html";
import { h } from "hastscript";
import { visit } from "unist-util-visit";
import {
	DIAGRAM_CONTAINER,
	DIAGRAM_PREVIEW_PANEL,
	DIAGRAM_SOURCE_PANEL,
	DIAGRAM_TOOLBAR,
	DIAGRAM_VIEW_PANEL,
	DIAGRAM_VIEW_TAB,
	DIAGRAM_VIEW_TABS,
	DIAGRAM_WRAPPER,
	MERMAID_CONTAINER,
	MERMAID_ERROR,
	MERMAID_FALLBACK_CODE,
	MERMAID_SVG_DARK,
	MERMAID_SVG_LIGHT,
	MERMAID_WRAPPER,
} from "./utils/diagramConstants.js";
import { extractText } from "./utils/extractText.js";

function buildViewToolbar() {
	return h("div", { class: DIAGRAM_TOOLBAR }, [
		h(
			"div",
			{
				class: DIAGRAM_VIEW_TABS,
				role: "tablist",
				"aria-label": "Mermaid 图表视图",
			},
			[
				h(
					"button",
					{
						type: "button",
						class: `${DIAGRAM_VIEW_TAB} is-active`,
						"data-diagram-view": "preview",
						role: "tab",
						"aria-selected": "true",
					},
					"预览",
				),
				h(
					"button",
					{
						type: "button",
						class: DIAGRAM_VIEW_TAB,
						"data-diagram-view": "source",
						role: "tab",
						"aria-selected": "false",
					},
					"源码",
				),
			],
		),
	]);
}

function buildSourcePanel(code) {
	return h(
		"div",
		{
			class: `${DIAGRAM_SOURCE_PANEL} ${DIAGRAM_VIEW_PANEL}`,
			"data-diagram-panel": "source",
			hidden: true,
		},
		[h("pre", {}, [h("code", { class: "language-mermaid" }, code)])],
	);
}

const mermanWasmUrl = import.meta.resolve(
	"@mermanjs/web/pkg/merman_wasm_bg.wasm",
);
await initMerman({
	wasm: {
		module_or_path: await readFile(new URL(mermanWasmUrl)),
	},
});

/**
 * 在构建时将 Mermaid 源码渲染为浅色和深色两套静态 SVG
 *
 * @param {string} mermaidCode - Mermaid 图表源码
 * @param {object} themeConfig - { lightTheme, darkTheme } 主题名
 * @param {number} diagramIndex - 当前文档中的图表序号
 * @returns {{ lightSvg: string, darkSvg: string }}
 */
/**
 * 移除 SVG 内联 style 中的 max-width 限制，
 * 使图表能根据容器宽度自适应缩放
 */
function removeSvgMaxWidth(svg) {
	return svg.replace(/(<svg[^>]*style="[^"]*?)max-width:\s*[^;]+;?/, "$1");
}

function buildMermaidSvgs(mermaidCode, themeConfig, diagramIndex) {
	const lightSvg = renderSvg(mermaidCode, {
		host_theme: { preset: themeConfig.lightTheme },
		svg: {
			diagram_id: `mermaid-${diagramIndex}-light`,
			pipeline: "parity",
		},
	});
	const darkSvg = renderSvg(mermaidCode, {
		host_theme: { preset: themeConfig.darkTheme },
		svg: {
			diagram_id: `mermaid-${diagramIndex}-dark`,
			pipeline: "parity",
		},
	});

	assertSafeSvgForDom(lightSvg);
	assertSafeSvgForDom(darkSvg);

	return {
		lightSvg: removeSvgMaxWidth(lightSvg),
		darkSvg: removeSvgMaxWidth(darkSvg),
	};
}

/**
 * @param {object} [options] - 配置选项
 * @param {string} [options.lightTheme] - 亮色主题名
 * @param {string} [options.darkTheme] - 暗色主题名
 */
export function rehypeMermaid(options = {}) {
	const themeConfig = {
		lightTheme: options.lightTheme || "editor-light",
		darkTheme: options.darkTheme || "editor-dark",
	};

	return (tree) => {
		let diagramIndex = 0;

		visit(tree, "element", (node) => {
			if (
				node.tagName !== "div" ||
				!node.properties?.className?.includes("mermaid-container")
			) {
				return;
			}

			// 优先使用 data-mermaid-code 属性，为空时从子节点文本提取（MDX 兼容）
			let mermaidCode = node.properties["data-mermaid-code"] || "";
			if (!mermaidCode) {
				mermaidCode = extractText(node).trim();
			}

			let lightSvg;
			let darkSvg;
			try {
				({ lightSvg, darkSvg } = buildMermaidSvgs(
					mermaidCode,
					themeConfig,
					diagramIndex,
				));
				diagramIndex += 1;
			} catch (e) {
				const preview =
					mermaidCode.length > 200
						? `${mermaidCode.slice(0, 200)}…[truncated]`
						: mermaidCode;
				if (process.env.NODE_ENV === "development") {
					console.error("[rehype-mermaid] Render failed:", e, preview);
				} else {
					console.error(
						"[rehype-mermaid] Render failed:",
						e instanceof Error ? e.message : String(e),
					);
				}
				node.properties = {
					class: `${DIAGRAM_CONTAINER} ${MERMAID_CONTAINER}`,
					"data-view": "preview",
				};
				node.children = [
					buildViewToolbar(),
					h(
						"div",
						{
							class: `${DIAGRAM_VIEW_PANEL} ${DIAGRAM_PREVIEW_PANEL}`,
							"data-diagram-panel": "preview",
						},
						[
							h("div", { class: MERMAID_ERROR }, [
								h("p", {}, "Mermaid 图表渲染失败，请检查图表语法是否正确"),
								h("pre", { class: MERMAID_FALLBACK_CODE }, mermaidCode),
							]),
						],
					),
					buildSourcePanel(mermaidCode),
				];
				return;
			}

			// 替换为静态 SVG（浅色 + 深色双版本，CSS 控制显示）。
			// 用 fromHtml 把 SVG 字符串解析成 element 节点，而不是塞进 { type: "raw" }：
			// MDX 的 hast-util-to-estree 不支持 raw 节点（会抛 "Cannot handle unknown node `raw`"），
			// 解析成元素后 MDX / Markdown 两条渲染管线都能正常输出。
			node.properties = {
				class: `${DIAGRAM_CONTAINER} ${MERMAID_CONTAINER}`,
				"data-view": "preview",
			};
			const lightChildren = fromHtml(lightSvg, { fragment: true }).children;
			const darkChildren = fromHtml(darkSvg, { fragment: true }).children;
			node.children = [
				buildViewToolbar(),
				h(
					"div",
					{
						class: `${DIAGRAM_VIEW_PANEL} ${DIAGRAM_PREVIEW_PANEL}`,
						"data-diagram-panel": "preview",
					},
					[
						h("div", { class: `${DIAGRAM_WRAPPER} ${MERMAID_WRAPPER}` }, [
							h("div", { class: MERMAID_SVG_LIGHT }, lightChildren),
							h("div", { class: MERMAID_SVG_DARK }, darkChildren),
						]),
					],
				),
				buildSourcePanel(mermaidCode),
			];
		});
	};
}
