---
title: "MySQL 8.0.20+ 排序内存不足排查：dynamic_fields 大字段触发 1038"
published: 2026-08-02
description: "记录一次 MySQL 8.0.20+ 分页查询出现 Out of sort memory 1038 的排查过程，重点说明大字段、filesort、延迟查询和会话级兜底方案。"
image: ""
tags: ["MYSQL", "SQL优化", "索引", "性能优化", "分页查询", "排查记录"]
category: "问题排查"
draft: false
lang: "zh_CN"
slug: mysql-out-of-sort-memory
---

## 目录

- 一、现象：分页查询报 `Out of sort memory 1038`
- 二、误区：不要一上来调大 `sort_buffer_size`
- 三、底层原理：MySQL 8.0.20+ 的 `packed addons`
- 四、复现条件：大字段、`filesort` 与 `LIMIT` 的关系
- 五、解决方案：按优先级处理
- 六、拓展：游标分页能解决什么问题
- 总结

## 一、现象：分页查询报 `Out of sort memory 1038`

当时是一个列表查询接口，需要按一批业务 ID 过滤数据，再按照创建时间倒序分页返回。接口执行时报错：

```text
Out of sort memory, consider increasing server sort buffer size
SQL state [HY001]; error code [1038]
```

简化后的 SQL 如下：

```sql
SELECT
    id,
    group_id,
    name,
    create_time,
    dynamic_fields
FROM business_data
WHERE group_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC
LIMIT 0, 20;
```

一开始容易把问题归因于 `IN` 条件，或者认为 `LIMIT 20` 只会处理 20 条数据。实际排查发现，**去掉 `ORDER BY` 后不再报错**，说明触发点在排序阶段。

这条 SQL 还有一个容易被忽略的字段：`dynamic_fields`。它原本是 `JSON` 类型，前面为了保留原始 JSON 内容和 key 顺序，改成了 `LONGBLOB`。这个调整解决了 JSON 顺序问题，但也让列表查询带上了一个可能很大的字段。关于 JSON 字段顺序变化的背景，可以参考<a href="../mysql-json-key-order-normalization/" target="_blank" rel="noopener noreferrer">MySQL JSON 类型字段为什么会改变字段顺序？一次排查记录</a>。

<mark>这次问题的核心不是单纯的分页参数，而是大字段和 `filesort` 叠加后，排序内存无法承载。</mark>

## 二、误区：不要一上来调大 `sort_buffer_size`

看到错误信息后，最直接的反应通常是全局调大排序缓冲区。这个方向不适合直接作为长期方案，也不建议在线上直接修改全局配置。`sort_buffer_size` 是会话级排序缓冲区，发生排序的连接会按照这个参数申请内存。并发查询较多时，实际内存消耗会随着连接数累加，还要叠加连接本身的其他缓冲区。

如果线上必须临时恢复，可以只对当前会话设置：

```sql
SET SESSION sort_buffer_size = 4194304;
```

注意两点：

- 这个参数只能缓解内存不足，不能消除 `filesort` 和大字段读取。
- 使用连接池时，会话参数可能被复用到下一次请求，临时修改后要确认连接归还前已经恢复。

所以排查顺序应该是：**先确认是否发生 `filesort`，再优化索引和查询字段，最后才考虑会话级参数兜底。**

## 三、底层原理：MySQL 8.0.20+ 的 `packed addons`

这个报错背后有一个 MySQL 8.0.20 引入的版本相关行为。

MySQL 在 filesort 中引入了 `packed addons` 优化。对于 `JSON`、`GEOMETRY` 等大字段，内部处理方式接近 `LONGBLOB`。在某些排序路径中，排序记录不只是保存主键或行指针，还可能携带查询结果中的大字段内容。

因此，触发点不一定是“有没有把 JSON 字段写进 `ORDER BY`”。只要大字段被 `SELECT` 出来，并且查询需要走这条排序路径，**单行内容很大的 JSON 也可能进入 `sort_buffer`**。内存不足时会直接报 `1038`，不能简单按“内存不够就自动降级到磁盘 filesort”来理解。

这里需要区分业务字段和官方版本行为：

- 官方版本说明重点描述的是 `JSON`、`GEOMETRY` 在排序中的处理变化。
- 当前业务中的 `dynamic_fields` 已经是 `LONGBLOB`，原因是之前需要保留 JSON 原始内容和字段顺序。
- `LONGBLOB` 本身就是大字段，虽然不应把它和官方版本变化完全等同，但它会明显增大查询结果行宽，放大排序和回表时的内存压力。

MySQL 8.0.28 对这部分排序内存使用又做过改进，所以不同小版本的表现可能不同。遇到类似问题时，除了看 SQL，也要确认数据库的准确版本。

相关官方说明：

- [MySQL 8.0.20 Release Notes](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/news-8-0-20.html)
- [MySQL 8.0.28 Release Notes](https://dev.mysql.com/doc/relnotes/mysql/8.0/en/news-8-0-28.html)
- [MySQL `sort_buffer_size` 配置说明](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html#sysvar_sort_buffer_size)

## 四、复现条件：大字段、`filesort` 与 `LIMIT` 的关系

要复现这类问题，通常需要同时满足几个条件：

1. 查询结果中包含较大的 `JSON`、`LONGBLOB` 或其他大字段。
2. `ORDER BY` 没有被合适的索引满足，执行计划出现 `Using filesort`。
3. 过滤条件命中较多数据，排序记录的总大小超过可用排序内存。

例如：

```sql
SELECT
    id,
    create_time,
    payload
FROM sort_memory_demo
WHERE group_id IN (?, ?, ?)
ORDER BY create_time DESC
LIMIT 0, 20;
```

先检查执行计划：

```sql
EXPLAIN
SELECT
    id,
    create_time,
    payload
FROM sort_memory_demo
WHERE group_id IN (?, ?, ?)
ORDER BY create_time DESC
LIMIT 0, 20;
```

<mark>即使 `LIMIT 0, 20` 只返回 20 条，MySQL 也可能先对大量符合条件的数据排序，再截取当前页。</mark>

所以，`LIMIT` 和 `OFFSET` 不是这个报错的必要条件。`OFFSET` 越深通常会让分页更慢，但本次 `1038` 的关键仍然是**大字段进入排序路径**。即使是第一页，也可能触发。

## 五、解决方案：按优先级处理

### 1. 建立索引，优先消除 `filesort`

如果主要过滤字段是 `group_id`，并且经常按照 `create_time` 倒序查询，可以先评估联合索引：

```sql
CREATE INDEX idx_business_group_time_id
    ON business_data (group_id, create_time DESC, id DESC);
```

`id` 放在最后是为了在 `create_time` 相同时提供稳定的第二排序条件。索引不能直接照搬，尤其是 `IN` 包含多个值时，MySQL 仍可能需要合并结果后排序，**是否消除 `filesort` 必须以 `EXPLAIN` 为准**。

```sql
EXPLAIN
SELECT
    id,
    group_id,
    name,
    create_time
FROM business_data
WHERE group_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC, id DESC
LIMIT 0, 20;
```

### 2. 列表查询不要使用 `SELECT *`

如果列表页不需要展示完整动态字段，就不要在排序查询中读取 `dynamic_fields`：

```sql
SELECT
    id,
    group_id,
    name,
    create_time
FROM business_data
WHERE group_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC, id DESC
LIMIT 0, 20;
```

详情页需要时，再按主键查询大字段：

```sql
SELECT
    id,
    dynamic_fields
FROM business_data
WHERE id = ?;
```

这不仅能减少排序阶段的内存压力，也能降低磁盘读取、网络传输和 Java 对象创建成本。

### 3. 延迟查询：先分页主键，再查询大字段

如果当前页面确实需要返回 `dynamic_fields`，可以把查询拆成两步。这是这次问题更关键的处理方式。

第一步只查询排序和分页需要的小字段：

```sql
SELECT
    id,
    create_time
FROM business_data
WHERE group_id IN (?, ?, ?, ?, ?)
ORDER BY create_time DESC, id DESC
LIMIT 0, 20;
```

假设第一步返回的主键顺序是：

```text
105, 98, 87, 76, ...
```

第二步再根据这一页的主键查询完整数据：

```sql
SELECT
    id,
    group_id,
    name,
    create_time,
    dynamic_fields
FROM business_data
WHERE id IN (?, ?, ?, ?, ...);
```

第二条 SQL 不再执行 `ORDER BY`，大字段只会读取当前页的 20 条记录。由于 `IN` 查询不保证返回顺序，Service 层需要按照第一步的主键顺序重新组装结果：

```java
Map<Long, DataRow> rowMap = new HashMap<>();
for (DataRow row : detailRows) {
    rowMap.put(row.getId(), row);
}

List<DataRow> orderedRows = new ArrayList<>();
for (Long id : orderedIds) {
    DataRow row = rowMap.get(id);
    if (row != null) {
        orderedRows.add(row);
    }
}
```

<mark>延迟查询的重点是：排序阶段只处理小字段，排序完成后才读取 `dynamic_fields`，从查询路径上绕开大字段进入排序缓冲区。</mark>

### 4. 会话级别调大 `sort_buffer_size`，只做应急

如果索引和 SQL 改造还没来得及上线，可以在确认内存余量后对当前会话临时设置：

```sql
SET SESSION sort_buffer_size = 4194304;
```

不建议直接全局调大，更不建议把它当成根治方案。**如果 SQL 仍然把大字段带进 filesort，缓冲区调得越大，单个连接的内存风险也越高。**

## 六、拓展：游标分页能解决什么问题

游标分页适合解决深分页的性能问题，但**不能直接解决本次 `Out of sort memory 1038`**。

普通分页：

```sql
LIMIT 100000, 20;
```

页码很深时，数据库需要跳过大量记录。游标分页会把上一页最后一条记录的排序值传给下一页：

```sql
SELECT
    id,
    create_time
FROM business_data
WHERE group_id IN (?, ?, ?, ?, ?)
  AND (
      create_time < ?
      OR (create_time = ? AND id < ?)
  )
ORDER BY create_time DESC, id DESC
LIMIT 20;
```

如果这一页仍然需要 `dynamic_fields`，依然应该采用前面的**延迟查询**：第一步只取当前页主键，第二步再按主键查询大字段。

<mark>游标分页解决的是 `OFFSET` 越深越慢；延迟查询解决的是大字段进入排序阶段。两者是不同问题，不能混用结论。</mark>

## 总结

这次 `Out of sort memory 1038` 的排查结论可以概括为：

1. 先用 `EXPLAIN` 确认是否出现 `Using filesort`。
2. MySQL 8.0.20 的 `packed addons` 让 JSON 等大字段可能进入排序载荷，不能只看 `ORDER BY` 中有没有 JSON。
3. `dynamic_fields` 虽然已经从 JSON 改成了 `LONGBLOB`，但它仍然是一个可能很大的字段，不能在列表排序 SQL 中无条件查询。
4. 优先通过索引消除 `filesort`，其次减少列表字段；必须返回大字段时，使用“先查主键、再查详情”的延迟查询。
5. `sort_buffer_size` 只在当前会话临时调大，不要直接全局修改。
6. 游标分页只用于解决深分页慢，不能当作本次 1038 报错的核心方案。

<mark>遇到大字段分页查询时，先把排序和大字段读取拆开，通常比单纯扩大数据库内存参数更稳。</mark>
