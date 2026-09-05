---
title: "MySQL JSON 类型字段为什么会改变字段顺序？一次排查记录"
published: 2026-08-12
description: "记录一次前端按 JSON key 顺序渲染表格列头时，发现 MySQL JSON 字段顺序变化的排查过程和处理思路。"
image: ""
tags: ["MYSQL", "JSON", "排查记录", "Java", "Bug"]
category: "问题排查"
draft: false
lang: "zh_CN"
slug: mysql-json-key-order-normalization
---

## 目录

- 一、结论：前端表格列头不要依赖 MySQL JSON key 顺序
- 二、问题场景：写入前顺序正常，查库后顺序变了
- 三、原因：MySQL JSON 字段会做规范化处理
- 四、处理方案：顺序交给字段配置，不交给 JSON
- 五、最小复现
- 总结

## 一、结论：前端表格列头不要依赖 MySQL JSON key 顺序

这次问题的结论很明确：

| 问题 | 结果 |
| --- | --- |
| MySQL `JSON` 字段会不会保留 key 的原始顺序 | **不保证** |
| 前端能不能直接按 JSON key 顺序渲染表格列头 | **不建议** |
| 只是 key 顺序变了，算不算数据错乱 | 一般不算 |
| 如果列头顺序有业务要求怎么办 | 用字段配置或排序字段控制 |
| 如果必须原样保存 JSON 文本怎么办 | 改用 `text / longtext` |

<mark>MySQL 的 JSON 类型适合存结构化数据，不适合保存“原始文本格式”和“字段展示顺序”。</mark>

## 二、问题场景：写入前顺序正常，查库后顺序变了

当时的业务场景是：后端生成一份动态字段 JSON，前端需要按照 JSON key 的顺序渲染表格列头，而且需求对列头顺序有要求。

简化后的链路是这样：

```text
后端生成动态字段 JSON -> 写入 MySQL JSON 字段 -> 查询返回前端 -> 前端按 key 顺序渲染表格列头
```

入库前，在代码里看到的 JSON 顺序类似这样：

```json
{
  "Name": "LRU3_RP",
  "UsrId": "",
  "Notes": "",
  "ChangeAuthority": "",
  "Validated": "",
  "GuidDef": "",
  "NameDef": ""
}
```

但是写入 MySQL 的 `JSON` 字段后，再去数据库里看，展示顺序可能变成这样：

```json
{
  "Name": "LRU3_RP",
  "Notes": "",
  "UsrId": "",
  "GuidDef": "",
  "NameDef": "",
  "Validated": "",
  "ChangeAuthority": ""
}
```

字段都还在，但 key 的顺序已经不是写入前的顺序。这样前端如果直接遍历 key 来生成表格列头，列头顺序就会和需求不一致。

## 三、原因：MySQL JSON 字段会做规范化处理

一开始容易怀疑是 Java 代码的问题，比如 `ObjectMapper`、`Map`、MyBatis 参数绑定这些地方改了顺序。

但如果你已经在入库前确认顺序正常，就要重点看数据库字段类型。

MySQL 官方文档说明，`JSON` 类型会被解析并规范化存储。它不是把你传进去的 JSON 字符串原封不动保存下来。

官方文档参考：

[The JSON Data Type - MySQL 8.4 Reference Manual](https://dev.mysql.com/doc/refman/8.4/en/json.html)

简单说就是：

| 现象 | 原因 |
| --- | --- |
| 空格、换行格式不保留 | MySQL 保存的是 JSON 值，不是原始字符串 |
| key 展示顺序可能变化 | JSON object 语义上不依赖字段顺序 |
| 不同版本顺序可能不同 | 内部规范化结果不应该作为业务依赖 |

所以这次问题不是“数据丢了”，而是**把展示顺序依赖放在 JSON key 顺序上，本身就不稳**。

另外要注意：如果只是顺序变了，这是 JSON 类型的正常现象；但如果 `"Name": "LRU3_RP"` 变成了 `"Name": "LRU2_RP"`，那就不是顺序问题，要检查是不是查错了记录，或者入库前数据本身已经变了。

## 四、处理方案：顺序交给字段配置，不交给 JSON

如果前端表格列头有固定顺序，推荐把“列头顺序”单独维护，不要依赖 MySQL JSON 字段的 key 顺序。

| 需求 | 推荐做法 |
| --- | --- |
| 前端表格列头要固定顺序 | 后端返回字段顺序配置，前端按配置渲染 |
| 后端返回数据就要有顺序 | 后端用 `LinkedHashMap` 按配置顺序重新组装 |
| 数据库还要支持 JSON 查询 | 字段继续用 `JSON`，但不依赖 key 顺序 |
| 必须保留用户输入的原始 JSON 文本 | 字段改成 `text / longtext` |

我的建议是：

```text
字段顺序配置 -> 读取 JSON 数据 -> 按配置顺序组装 VO -> 前端按 VO 渲染表格
```

这样数据库只负责存结构化数据，表格列头顺序由配置控制，后面需求调整也更清楚。

后端组装时可以类似这样处理：

```java
List<String> fieldOrder = Arrays.asList("Name", "UsrId", "Notes", "ChangeAuthority", "Validated", "GuidDef", "NameDef");
Map<String, Object> mysqlJsonMap = getDynamicFieldsFromDatabase();
Map<String, Object> resultMap = new LinkedHashMap<>();

for (String fieldName : fieldOrder) {
    resultMap.put(fieldName, mysqlJsonMap.get(fieldName));
}
```

这里的重点不是 `LinkedHashMap` 多高级，而是**顺序来自 `fieldOrder`，不是来自 MySQL JSON 查询结果**。

## 五、最小复现

可以用下面的 SQL 快速复现这个现象：

```sql
DROP TABLE IF EXISTS json_order_demo;

CREATE TABLE json_order_demo (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    dynamic_fields JSON NOT NULL
);

INSERT INTO json_order_demo(dynamic_fields)
VALUES ('{"Name":"LRU3_RP","UsrId":"","Notes":"","ChangeAuthority":"","Validated":"","GuidDef":"","NameDef":""}');

SELECT dynamic_fields
FROM json_order_demo
WHERE id = 1;
```

如果想确认字段值有没有变化，不要只肉眼看整段 JSON，可以直接按 JSON 路径取值：

```sql
SELECT
    JSON_EXTRACT(dynamic_fields, '$.Name') AS name_value,
    JSON_EXTRACT(dynamic_fields, '$.UsrId') AS usr_id_value
FROM json_order_demo
WHERE id = 1;
```

## 总结

这次排查最后落到一个很实际的点：**MySQL JSON 字段不能用来保证 key 顺序**。

如果前端只是展示数据，字段顺序无所谓，那继续用 `JSON` 没问题；但如果表格列头顺序是需求的一部分，就应该把顺序放到字段配置、排序字段或者后端组装逻辑里。

<mark>数据库存 JSON，业务控制顺序。不要让前端表格列头依赖 MySQL JSON key 的展示顺序。</mark>
