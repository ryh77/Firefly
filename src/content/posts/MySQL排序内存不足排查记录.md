---
title: "MySQL 报 Out of sort memory？一次 order by 分页查询排查记录"
published: 2026-07-02
description: "记录一次 MySQL 执行多条件分页查询时，因为 order by create_time desc 触发 Out of sort memory 的排查过程和优化思路。"
image: ""
tags: ["MySQL", "SQL优化", "索引", "分页查询", "排查记录", "Bug"]
category: "问题排查"
draft: false
lang: "zh_CN"
slug: mysql-out-of-sort-memory
---

## 目录

- 一、先说结论：这个报错主要怎么处理
- 二、问题场景：分页查询突然报排序内存不足
- 三、原来的 SQL 问题在哪里
- 四、常见处理方案怎么选
- 五、优先推荐的优化方式
- 六、临时兜底方案
- 七、使用时要注意的边界
- 总结

## 一、先说结论：这个报错主要怎么处理

这次遇到的核心报错是：

```text
Out of sort memory, consider increasing server sort buffer size
SQL state [HY001]; error code [1038]
```

结论先放前面：

| 问题 | 结论 |
| --- | --- |
| 是不是 `IN` 条件太多直接导致的 | 不完全是 |
| 真正触发点是什么 | 命中数据量大，还要 `ORDER BY create_time DESC` 排序 |
| 删掉 `order by` 为什么不报错 | 少了排序内存消耗 |
| 最优先怎么处理 | 建合适索引、缩小结果集、优化分页 |
| 能不能直接调大 `sort_buffer_size` | 可以临时兜底，但不建议长期依赖 |

<mark>这个问题本质不是简单的数据库“坏了”，而是一次分页查询需要排序的数据太多，MySQL 分配给排序的内存不够用了。</mark>

## 二、问题场景：分页查询突然报排序内存不足

当时是一个列表查询接口，后端按一批结构 ID 查询数据，并按创建时间倒序分页返回。

简化后的 SQL 类似这样：

```sql
SELECT
    id,
    project_id,
    project_structure_id,
    name,
    type,
    create_time,
    update_time,
    dynamic_fields,
    project_json_data
FROM business_data
WHERE project_structure_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC
LIMIT ?, ?;
```

接口报错里比较关键的信息是：

```text
Error code: 1038
SQL state: HY001
Cause: Out of sort memory, consider increasing server sort buffer size
```

一开始容易以为是 `IN` 后面的 ID 太多，但实际排查发现，**去掉 `ORDER BY create_time DESC` 后就不报错了**。

这说明真正让数据库扛不住的地方，是过滤后还要对大量数据做排序。

## 三、原来的 SQL 问题在哪里

这类 SQL 看起来很常见，但数据量一上来就容易出问题。

```text
WHERE 过滤 -> ORDER BY 排序 -> LIMIT 分页
```

MySQL 执行时不是先拿到当前页再排序，而是要先把符合条件的数据按 `create_time` 排好，再返回当前页。

如果 `project_structure_id IN (...)` 命中了几万甚至十几万行，再叠加下面几个因素，就很容易触发排序内存不足：

- `ORDER BY create_time DESC` 没有合适索引支撑
- 查询字段比较多，还包含 JSON 这类大字段
- 分页 offset 较深，数据库要处理更多中间结果
- 单次请求命中范围太大，没有时间范围或其他过滤条件

<mark>`LIMIT 20` 不代表数据库只处理 20 条数据。前面排序的数据量如果很大，照样可能把排序内存打满。</mark>

## 四、常见处理方案怎么选

遇到这个报错，常见处理方式大概有几类：

| 方案 | 适合场景 | 局限 |
| --- | --- | --- |
| 去掉 `order by` | 临时确认问题点 | 结果顺序不稳定，通常不符合业务需求 |
| 调大 `sort_buffer_size` | 临时救急 | 每个连接都会占用，连接多时风险更高 |
| 加索引 | 常规查询优化 | 需要结合 `EXPLAIN` 看是否真正用上 |
| 缩小查询范围 | 业务允许按条件过滤 | 需要前后端一起约束查询条件 |
| 游标分页 | 大数据量分页 | 改造成本比普通分页高 |
| 列表页减少大字段 | 列表不需要完整详情 | 详情页需要再查一次 |

我的处理顺序一般是：**先看执行计划，再加索引和缩小结果集，最后才考虑调数据库参数。**

## 五、优先推荐的优化方式

### 1. 给过滤和排序字段建索引

如果查询条件主要是 `project_structure_id`，并且按 `create_time` 倒序，可以先考虑联合索引：

```sql
CREATE INDEX idx_structure_create_time
ON business_data(project_structure_id, create_time DESC);
```

如果业务上经常跨多个结构 ID 做全局时间倒序，也可以结合数据分布评估下面这种索引：

```sql
CREATE INDEX idx_create_time_structure
ON business_data(create_time DESC, project_structure_id);
```

这两个索引不是随便都加，建议用 `EXPLAIN` 看实际执行计划：

```sql
EXPLAIN
SELECT id, project_id, project_structure_id, name, create_time
FROM business_data
WHERE project_structure_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC
LIMIT 0, 20;
```

重点看有没有 `Using filesort`。如果还在 filesort，就说明排序没有完全靠索引解决，还需要继续调整查询方式或索引顺序。

### 2. 列表页不要一次查太多字段

原 SQL 里查了动态字段、完整 JSON 数据这类大字段。列表页如果只是展示基础信息，可以先只查列表需要的字段：

```sql
SELECT
    id,
    project_id,
    project_structure_id,
    name,
    type,
    create_time
FROM business_data
WHERE project_structure_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC
LIMIT ?, ?;
```

详情页再根据主键查完整 JSON：

```sql
SELECT dynamic_fields, project_json_data
FROM business_data
WHERE id = ?;
```

这样不一定单独解决排序问题，但能明显降低列表查询的 IO、网络传输和中间结果处理压力。

### 3. 限制查询范围

如果前端分页可以控制，就不要允许一次拉特别大的范围。

常见做法：

- 限制 `pageSize` 最大值，比如最多 50 条
- `IN` 条件过长时分批处理
- 增加时间范围，比如只查最近一段时间
- 增加更明确的业务过滤条件，减少命中行数

示例：

```sql
SELECT id, project_id, project_structure_id, name, create_time
FROM business_data
WHERE project_structure_id IN (?, ?, ?, ?, ?)
  AND create_time >= '2026-01-01 00:00:00'
ORDER BY create_time DESC
LIMIT 0, 20;
```

## 六、临时兜底方案

如果线上已经报错，需要先临时恢复，可以查看并适当调大 `sort_buffer_size`。

```sql
SHOW VARIABLES LIKE 'sort_buffer_size';
```

临时调大示例：

```sql
SET GLOBAL sort_buffer_size = 4194304;
```

这里要特别注意：**`sort_buffer_size` 是每个连接排序时可能使用的内存，不是全局只占一份。**

如果数据库连接数比较多，把这个值调得过大，可能会带来新的内存风险。所以它更适合临时兜底，不适合作为根治方案。

## 七、使用时要注意的边界

这类问题后面再遇到，可以按下面几个点快速判断：

| 检查点 | 说明 |
| --- | --- |
| 去掉 `ORDER BY` 是否恢复 | 用来判断是不是排序触发 |
| `EXPLAIN` 是否出现 `Using filesort` | 判断是否走了额外排序 |
| 命中行数是否过大 | `IN` 条件不多也可能命中很多行 |
| 列表页是否查了大字段 | JSON、TEXT、BLOB 尽量放详情查询 |
| 是否存在深分页 | offset 越深，中间处理成本越高 |

如果分页数据量特别大，可以考虑游标分页：

```sql
SELECT id, project_id, project_structure_id, name, create_time
FROM business_data
WHERE project_structure_id IN (?, ?, ?, ?, ?)
  AND create_time < ?
ORDER BY create_time DESC
LIMIT 20;
```

下一页带上上一页最后一条数据的 `create_time`，避免深分页带来的额外开销。

## 总结

这次报错看起来像数据库内存问题，但真正要处理的是 SQL 查询方式。

**`IN` 条件只是扩大了命中范围，`ORDER BY create_time DESC` 才是排序内存消耗的关键触发点。**

我的建议是：

- 先用 `EXPLAIN` 确认是否 `Using filesort`
- 给过滤字段和排序字段设计联合索引
- 列表页只查必要字段，大 JSON 数据放详情页查
- 控制 `pageSize`、时间范围和查询条件
- `sort_buffer_size` 只做临时兜底，不当长期方案

<mark>分页查询不是加了 `LIMIT` 就一定轻。只要前面需要排序的数据量足够大，MySQL 仍然可能先扛住全部排序成本。</mark>
