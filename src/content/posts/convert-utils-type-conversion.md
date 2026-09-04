---
title: "Java 项目里 DTO、VO、Entity 来回转换太烦？一个 ConvertUtils 工具类搞定大部分场景"
published: 2025-08-03
description: "整理一个可以直接拿走用的 ConvertUtils 类型转换工具类，用来处理 DTO、VO、Entity 单对象转换、列表转换和复制时忽略字段等常见场景。"
image: ""
tags: ["Java", "Spring Boot", "Jackson", "工具类", "对象转换"]
category: "Java"
draft: false
lang: "zh_CN"
slug: convert-utils-type-conversion
---

## 目录

- 一、先说结论：这篇文章能解决什么问题
- 二、一个真实开发场景：对象为什么要来回转
- 三、直接手写 set/get 有什么问题
- 四、Spring 自带转换方式为什么不够顺手
- 五、为什么没有直接引入 Hutool 这类工具
- 六、使用前需要准备哪些依赖
- 七、ConvertUtils 的核心实现
- 八、实际使用场景
- 九、使用时要注意的边界
- 十、完整源码
- 总结

## 一、先说结论：这篇文章能解决什么问题

看完这篇文章，你可以拿到一个轻量的对象转换工具类，主要解决下面几类高频问题：

| 问题 | 解决方式 |
| --- | --- |
| Entity 转 VO 写一堆 `set/get` | 用 `entityToModel` |
| `List<Entity>` 转 `List<VO>` 还要手动循环 | 用 `entityListToModelList` |
| 复制对象时不想带 `id`、审计字段 | 用忽略字段版本 |
| 不想引入 Hutool 这类外部依赖 | 基于项目已有 Jackson 封装 |

这篇文章不是专门讲概念，而是整理一个可以直接复制到项目里改造使用的 `ConvertUtils`。前面先说使用场景和取舍，中间讲核心实现，最后给完整源码。

<mark>如果你的项目里经常出现 DTO、VO、Entity 互转，这个工具类可以先解决 80% 的重复转换代码。</mark>

## 二、一个真实开发场景：对象为什么要来回转

在后端项目里，DTO、VO、Entity 这几个对象基本绕不开。数据库查出来的是 `Entity`，接口返回给前端时通常要转成 `VO`；前端提交的是 `DTO`，真正落库前又要转成 `Entity`。

一个常见链路大概是这样：

```text
前端请求 DTO  ->  Service 业务处理  ->  Entity 入库
数据库 Entity ->  Service 业务组装  ->  VO 返回前端
```

这时候再看 DTO、VO、Entity 的分工就比较自然：

| 对象 | 常见位置 | 主要作用 |
| --- | --- | --- |
| DTO | Controller 入参、Service 入参 | 接收前端提交的数据 |
| Entity | DAO、Mapper、数据库交互 | 对应数据库表结构 |
| VO | Controller 返回值 | 返回给前端展示的数据 |

分层清楚以后，对象之间的转换就会变成日常开发里的固定动作。字段少的时候不明显，接口和表多起来以后，这类重复代码会越来越多。

## 三、直接手写 set/get 有什么问题

如果字段少还好，手写几行 `set/get` 就结束了：

```java
UserVO userVO = new UserVO();
userVO.setId(userEntity.getId());
userVO.setUserName(userEntity.getUserName());
userVO.setPhone(userEntity.getPhone());
```

但项目一大，这种代码就会到处都是。字段改名时还很容易漏，最后接口看着没报错，实际返回的数据却少了一块。

手写转换最大的问题不是写一两次麻烦，而是它会在项目里反复出现：

| 问题 | 影响 |
| --- | --- |
| 重复代码多 | 每个接口都要写一遍相似转换逻辑 |
| 字段变更容易漏 | Entity 或 VO 改字段后，转换代码可能没有同步改 |
| 列表转换更啰嗦 | `List<Entity>` 转 `List<VO>` 还要额外循环 |
| 复制对象不灵活 | 新增复制时经常要排除 `id`、`createTime` 这类字段 |

<mark>所以这个 ConvertUtils 的目标不是“大而全”，而是把项目里高频、重复的对象转换统一掉。</mark>

## 四、Spring 自带转换方式为什么不够顺手

Spring 里其实也有转换工具，比如 `BeanUtils.copyProperties`、`ConversionService`。它们不是不能用，只是放到 DTO、VO、Entity 大量互转的场景里，没那么顺手。

| 方式 | 适合场景 | 用在对象互转里的问题 |
| --- | --- | --- |
| `BeanUtils.copyProperties` | 简单对象浅拷贝 | List 要自己循环，嵌套对象不够省心 |
| `ConversionService` | 字符串、数字、枚举等单值转换 | 写一堆 Converter 成本偏高 |
| 手写 `set/get` | 特殊字段、复杂业务 | 重复代码多，字段变更容易漏 |
| `ConvertUtils` | DTO、VO、Entity 常规转换 | 复杂业务字段仍建议手动处理 |

这里选择 Jackson 的 `ObjectMapper.convertValue`，主要是因为 Spring Boot Web 项目本来就带 Jackson。**不需要额外引入一套转换框架，还能复用项目里的 JSON 配置。**

## 五、为什么没有直接引入 Hutool 这类工具

很多人第一反应可能是：Hutool、MapStruct、Dozer 不是都有类似能力吗？

我的考虑比较现实：

| 考虑点 | 说明 |
| --- | --- |
| 依赖控制 | 公共模块引入新工具后，其他模块都会跟着依赖 |
| 维护成本 | 版本升级、依赖冲突、漏洞扫描都要多看一层 |
| 当前需求 | 单对象转、List 转、忽略字段，自己封装已经够用 |
| 团队阅读 | 代码很薄，后面谁接手都能看懂 |

<mark>不是外部工具不好，而是当前项目没必要为了几个高频方法再增加一层依赖。</mark>

所以最后选择自己封装 `ConvertUtils`：底层用项目已有的 Jackson，上层只暴露几个简单方法。

## 六、使用前需要准备哪些依赖

这个工具类主要依赖三块东西：

| 依赖 | 作用 |
| --- | --- |
| `ObjectMapper` | Jackson 提供，负责真正的对象转换 |
| `CollectionUtils` | Spring 提供，判断集合是否为空 |
| `SpringUtils` | 项目工具类，从 Spring 容器里取 `ObjectMapper` |

如果你的项目已经引入了 Spring Boot Web，一般不需要额外加 Jackson：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

`spring-boot-starter-web` 默认会带上 Jackson，并且 Spring Boot 会自动注册一个 `ObjectMapper` Bean。这个工具类通过 `SpringUtils.getBean(ObjectMapper.class)` 获取的就是容器里的那一个。

如果不是 Web 项目，也可以按需引入：

```xml
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>

<dependency>
    <groupId>org.springframework</groupId>
    <artifactId>spring-context</artifactId>
</dependency>
```

日志这块一般也会由 Spring Boot Starter 带进来。普通 Java 项目需要自己补 `slf4j-api` 和对应日志实现。

如果项目里没有 `SpringUtils`，有两种处理方式：

- 自己提供一个 Spring 上下文工具类，用来获取 `ObjectMapper`。
- 把 `ConvertUtils` 改成 Spring Bean，通过构造方法注入 `ObjectMapper`。

如果继续使用下面这版静态工具类，`SpringUtils` 至少要能从容器里取 Bean：

```java
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * Spring 上下文工具类，提供从容器中获取 Bean 的能力。
 */
@Component
public class SpringUtils implements ApplicationContextAware {

    private static ApplicationContext applicationContext;

    /**
     * 保存 Spring 应用上下文。
     *
     * @param applicationContext Spring 应用上下文
     */
    @Override
    public void setApplicationContext(ApplicationContext applicationContext) {
        SpringUtils.applicationContext = applicationContext;
    }

    /**
     * 根据类型获取 Spring Bean。
     *
     * @param clz Bean 类型
     * @return Spring 容器中的 Bean
     */
    public static <T> T getBean(Class<T> clz) {
        return applicationContext.getBean(clz);
    }
}
```

**当前项目里为了调用方便，把方法都做成了 `static`，所以采用了 `SpringUtils` 这种写法。**

## 七、ConvertUtils 的核心实现

### 1. 延迟获取 ObjectMapper

工具类没有直接 `new ObjectMapper()`，而是从 Spring 容器里取。

```java
private static volatile ObjectMapper objectMapper;

/**
 * 获取 Spring 容器中统一配置的 ObjectMapper。
 *
 * @return ObjectMapper 实例
 */
private static ObjectMapper getObjectMapper() {
    if (objectMapper == null) {
        synchronized (ConvertUtils.class) {
            if (objectMapper == null) {
                objectMapper = SpringUtils.getBean(ObjectMapper.class);
            }
        }
    }
    return objectMapper;
}
```

这样做主要有两个好处：**不重复创建 `ObjectMapper`**，并且**复用项目里的 Jackson 配置**，比如日期格式、空值处理、字段命名策略等。

### 2. List 转换

平时最常见的场景是列表返回，比如数据库查出 `List<UserEntity>`，接口要返回 `List<UserVO>`。

```java
public static <S, T> List<T> entityListToModelList(List<S> sourceList, Class<T> toClass) {
    if (CollectionUtils.isEmpty(sourceList)) {
        return new ArrayList<>();
    }

    try {
        return getObjectMapper().convertValue(sourceList, getObjectMapper().getTypeFactory().constructCollectionType(List.class, toClass));
    } catch (Exception e) {
        logger.error("List 深拷贝失败，源类型：{}，目标类型：{}", sourceList.get(0).getClass().getName(), toClass.getName(), e);
        return new ArrayList<>();
    }
}
```

这里有个小细节：<mark>空集合返回空 List，不返回 null。</mark> 调用方少很多空指针判断，接口返回时也更自然。

### 3. 单对象转换

单对象转换就更直接了。

```java
public static <S, T> T entityToModel(S sourceClass, Class<T> toClass) {
    if (sourceClass == null || toClass == null) {
        return null;
    }

    try {
        return getObjectMapper().convertValue(sourceClass, toClass);
    } catch (Exception e) {
        logger.error("单对象深拷贝失败，源类型：{}，目标类型：{}", sourceClass.getClass().getName(), toClass.getName(), e);
        return null;
    }
}
```

字段名一致、字段类型能正常转换时，用这个方法就够了。

### 4. 转换时忽略字段

有些复制场景不能把所有字段都带过去，比如新增一条数据时，不能把老数据的 `id`、`createBy`、`createTime` 复制过去。

```java
public static <S, T> T entityToModel(S sourceClass, Class<T> toClass, String... ignoreProperties) {
    if (sourceClass == null || toClass == null) {
        return null;
    }

    if (ignoreProperties == null || ignoreProperties.length == 0) {
        return entityToModel(sourceClass, toClass);
    }

    try {
        @SuppressWarnings("unchecked")
        Map<String, Object> sourceMap = getObjectMapper().convertValue(sourceClass, Map.class);
        Set<String> ignoreSet = new HashSet<>(Arrays.asList(ignoreProperties));
        sourceMap.keySet().removeAll(ignoreSet);

        return getObjectMapper().convertValue(sourceMap, toClass);
    } catch (Exception e) {
        logger.error("单对象深拷贝（忽略字段）失败，源类型：{}，目标类型：{}，忽略字段：{}",
                sourceClass.getClass().getName(), toClass.getName(), ignoreProperties, e);
        return null;
    }
}
```

这个方法在复制数据、模板另存、旧数据生成新数据时比较有用。**尤其是审计字段，建议明确忽略：**

```java
UserEntity newUser = ConvertUtils.entityToModel(oldUser, UserEntity.class,
        "id", "createBy", "createTime", "updateBy", "updateTime");
```

## 八、实际使用场景

| 场景 | 写法 |
| --- | --- |
| Entity 转 VO 返回前端 | `UserVO userVO = ConvertUtils.entityToModel(userEntity, UserVO.class);` |
| DTO 转 Entity 入库 | `UserEntity userEntity = ConvertUtils.entityToModel(userDTO, UserEntity.class);` |
| List Entity 转 List VO | `List<UserVO> userVOList = ConvertUtils.entityListToModelList(userEntityList, UserVO.class);` |

复制对象时过滤字段可以单独写清楚一点：

```java
ProjectEntity newProject = ConvertUtils.entityToModel(oldProject, ProjectEntity.class,
        "id", "createBy", "createTime", "updateBy", "updateTime");
```

## 九、使用时要注意的边界

这个工具类不是万能映射器，用的时候注意几个边界：

| 注意点 | 原因 |
| --- | --- |
| 字段名尽量一致 | `userName` 不会自动猜成 `name` |
| 复杂业务字段手动处理 | 比如字符串拆数组、状态值转文案 |
| 调用方要判断结果 | 单对象失败返回 `null`，List 失败返回空集合 |
| `toClass` 不要传空 | List 方法更适合在调用前保证目标类型明确 |
| 忽略字段只处理第一层 | 嵌套对象里的同名字段不会自动移除 |

<mark>我的习惯是：普通字段交给工具类，带业务含义的字段自己写清楚。</mark>

## 十、完整源码

下面是去掉复杂泛型 List 方法后的版本，覆盖平时最常用的几个转换场景。

```java
package com.example.common.utils;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 类型转换工具类(支持深拷贝)
 */
public class ConvertUtils {

    private static final Logger logger = LoggerFactory.getLogger(ConvertUtils.class);

    private static volatile ObjectMapper objectMapper;

    /**
     * 获取 Spring 容器中统一配置的 ObjectMapper。
     *
     * @return ObjectMapper 实例
     */
    private static ObjectMapper getObjectMapper() {
        if (objectMapper == null) {
            synchronized (ConvertUtils.class) {
                if (objectMapper == null) {
                    objectMapper = SpringUtils.getBean(ObjectMapper.class);
                }
            }
        }
        return objectMapper;
    }

    /**
     * List 深拷贝：将 sourceList 完整深拷贝为目标类型 List<T>
     * 支持嵌套对象、List<自定义对象>等复杂结构，完全独立原对象
     *
     * @param sourceList 源数据 List
     * @param toClass    目标元素类型
     * @return 深拷贝后的目标 List
     */
    public static <S, T> List<T> entityListToModelList(List<S> sourceList, Class<T> toClass) {
        if (CollectionUtils.isEmpty(sourceList)) {
            return new ArrayList<>();
        }

        try {
            return getObjectMapper().convertValue(sourceList, getObjectMapper().getTypeFactory().constructCollectionType(List.class, toClass));
        } catch (Exception e) {
            logger.error("List 深拷贝失败，源类型：{}，目标类型：{}", sourceList.get(0).getClass().getName(), toClass.getName(), e);
            return new ArrayList<>();
        }
    }

    /**
     * 单对象深拷贝：将 sourceClass 完整深拷贝为目标类型 T
     *
     * @param sourceClass 源对象
     * @param toClass     目标类型
     * @return 深拷贝后的目标对象
     */
    public static <S, T> T entityToModel(S sourceClass, Class<T> toClass) {
        if (sourceClass == null || toClass == null) {
            return null;
        }

        try {
            return getObjectMapper().convertValue(sourceClass, toClass);
        } catch (Exception e) {
            logger.error("单对象深拷贝失败，源类型：{}，目标类型：{}", sourceClass.getClass().getName(), toClass.getName(), e);
            return null;
        }
    }

    /**
     * 单对象深拷贝(忽略指定字段)：将 sourceClass 完整深拷贝为目标类型 T
     *
     * @param sourceClass      源对象
     * @param toClass          目标类型
     * @param ignoreProperties 需要忽略复制的字段名
     * @return 深拷贝后的目标对象
     */
    public static <S, T> T entityToModel(S sourceClass, Class<T> toClass, String... ignoreProperties) {
        if (sourceClass == null || toClass == null) {
            return null;
        }

        if (ignoreProperties == null || ignoreProperties.length == 0) {
            return entityToModel(sourceClass, toClass);
        }

        try {
            // 把源对象转为 Map，并移除需要忽略的字段
            @SuppressWarnings("unchecked")
            Map<String, Object> sourceMap = getObjectMapper().convertValue(sourceClass, Map.class);
            Set<String> ignoreSet = new HashSet<>(Arrays.asList(ignoreProperties));
            sourceMap.keySet().removeAll(ignoreSet);

            // 把过滤后的 Map 转为目标对象
            return getObjectMapper().convertValue(sourceMap, toClass);
        } catch (Exception e) {
            logger.error("单对象深拷贝（忽略字段）失败，源类型：{}，目标类型：{}，忽略字段：{}",
                    sourceClass.getClass().getName(), toClass.getName(), ignoreProperties, e);
            return null;
        }
    }
}
```

## 总结

这个 `ConvertUtils` 不复杂，甚至可以说就是一个很薄的封装。但它刚好解决了项目里高频出现的问题：DTO、VO、Entity 来回转，List 来回转，复制对象时过滤字段。

**工具类不用一上来就追求大而全。能稳定减少重复代码，又不引入额外依赖，这就已经很值了。**
