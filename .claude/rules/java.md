---
paths:
  - "**/*.java"
---

# Java 代码规范

本规则适用于所有 Java 文件。代码应保持简洁、可读，并优先遵循项目已有约定。

## Lombok 使用

在确认不会引入副作用且符合项目约定的前提下，合理使用 Lombok 注解减少样板代码。使用前必须明确注解生成的成员、构造器和行为；无法确认时保留显式 Java 代码，不为减少代码行数盲目添加注解。

### 覆盖范围

| 场景 | 要求 |
|------|------|
| Entity、DTO 等数据承载类 | 优先遵循项目既有的 Lombok 注解组合 |
| getter/setter、builder、构造器、日志字段 | 生成行为明确，且不会改变既有 API 或业务语义时使用 |
| `equals`/`hashCode`、`toString` 或复杂构造逻辑 | 必须确认生成结果满足对象语义、序列化和框架反射要求 |

### 类级别

以下示例仅用于说明推荐用法，不构成所有类的固定模板：

```java
/**
 * 订单实体。
 */
@Data
@SuperBuilder
@NoArgsConstructor
public class OrderDO {
    private Long id;
}

/**
 * 订单响应。
 */
@Getter
@Builder
public class OrderResponse {
    private Long orderId;
    private String status;
}
```

### 字段与方法级别

```java
/**
 * 订单服务，使用统一的业务日志主题。
 */
@Slf4j(topic = "business")
public class OrderService {

    /**
     * 记录订单处理日志。
     */
    public void process(Long orderId) {
        log.info("process order: {}", orderId);
    }
}
```

### 注意事项

- 使用 `@Data` 前确认生成的 `equals`、`hashCode` 和 `toString` 是否包含正确的字段。
- 使用 `@Builder`、`@NoArgsConstructor` 等构造相关注解前，确认其不会破坏 Jackson、MapStruct、Spring 或其他框架所需的构造方式。
- 需要自定义方法实现、严格控制可变性或依赖特殊构造器时，使用显式 Java 代码。
- 修改 Lombok 注解后确认 IDE 和 Maven 的 annotation processing 配置正常。

## Javadoc 注释

所有 Java 代码需包含 Javadoc 注释。Javadoc 解释意图（Why），而非复述实现（What/How）。

### 覆盖范围

| 元素 | 要求 |
|------|------|
| 顶层类/接口 | 必须，说明职责 |
| public 方法 | 必须（简单 getter/setter 除外） |
| protected 方法 | 建议 |
| private 方法 | 按需 |
| 枚举常量 | 建议行内 `/** 说明 */` |

### 类级别

```java
/**
 * 订单履约闭环服务。
 *
 * <p>履约事件落 order_fulfillment，主单字段保存当前履约投影。</p>
 */
public class OrderFulfillmentService { }
```

### 方法级别

```java
/**
 * 根据订单 ID 查询订单详情。
 *
 * @param orderId 订单 ID
 * @return 订单详情，不存在时返回 {@code Optional.empty()}
 */
public Optional<OrderResponse> getByOrderId(Long orderId) { }

/**
 * 取消订单。校验订单状态与取消时间窗口。
 *
 * @param orderId  订单 ID
 * @param operator 操作人
 * @throws BusinessException 订单不存在或状态不允许
 */
@Transactional(rollbackFor = Exception.class)
public void cancel(Long orderId, String operator) { }
```

### @param / @return / @throws 规则

| 注解 | 要求 |
|------|------|
| `@param` | public 方法每个参数 |
| `@return` | 非 void 方法 |
| `@throws` | 受检异常 + 重要业务异常 |

### 字段级别

简单字段用行内注释：

```java
/** 展示状态，见 {@link DisplayStatusEnum} */
private String displayStatus;
```

复杂字段用段落注释：

```java
/**
 * 价格快照。JSON 存储各晚卖价、早餐数量，创建后不可变更。
 */
@TableField(typeHandler = JacksonTypeHandler.class)
private String priceSnapshot;
```

### 注意事项

- 解释意图：`根据担保规则判断是否需要预付`，而非 `判断 order.amount > 0`
- 描述副作用：方法对系统状态的改变（`创建订单并异步触发供应商预订`）
- `@deprecated` 标注替代方法
- **禁止**：空 Javadoc、逐行复述代码、过时注释、`@author` 等模板垃圾

## 可维护性原则

1. **避免魔法值**：具有业务含义、协议含义，或会在多个位置使用的字符串、数字、状态码、类型码、时间单位、数量上限等，必须定义为有明确语义的常量或枚举后再使用，不要在业务代码中散落字面量。
2. **先查找再定义**：定义常量或枚举前，先搜索当前模块、`common` 模块及相关规范，确认是否已有相同业务含义的定义。只有字面量相同不代表语义相同；确认语义一致后复用，禁止为同一含义重复定义。
3. **按共享范围选择类型**：需要被多个类、模块或业务流程共同使用的稳定业务值，必须定义为枚举，并集中封装编码、描述和转换逻辑。单类或单方法使用的值按最小必要作用域定义为 `private static final` 常量，避免无归属的公共常量。
4. **配置与常量分离**：环境相关、部署后可能调整的值应通过配置文件和配置类管理，不要伪装成 Java 常量写死在代码中。
5. **保持使用方一致**：常量名称应表达业务含义而不是原始值；修改常量或枚举时，同时检查调用方、序列化值和相关测试，避免只修改定义而遗漏使用方。

## 变量精简原则

适用范围：**新增代码时必须遵守**；修改既有代码时，只在本次改动直接涉及的代码范围内遵守，不得为满足本原则而顺带重构无关的既有代码。

1. **单次传参变量下沉到被调用函数内部**：一个局部变量只被用来传给另一个函数作为参数、且只被传这一次时，不要在调用处提前计算好存成变量再传参，应改造被调用的函数本身，让它在内部完成这部分获取或计算。目标是修改函数签名/实现，而不是简单地把变量的计算表达式内联到调用处的参数位置。
   - 反例：`String status = A.equals(result.getCode()) ? "S" : "F"; update(record, status, result);`
   - 正例：`update(record, result);`，`update` 内部自行从 `result` 派生出状态
2. **代码行数过长时做语义化封装**：单个方法内出现过长的顺序逻辑时，优先提取为命名清晰的私有方法（并按需补充简要注释说明「为什么」），而不是堆在一个方法体里，以提升可读性。

## 禁止使用三元表达式

**禁止使用三元表达式（`condition ? valueA : valueB`），嵌套三元表达式同样禁止。** 三元表达式把条件判断与取值压缩进一行，牺牲可读性换取书写便利；嵌套三元更是难以阅读、调试和维护，容易引入求值顺序与优先级错误。业务代码应使用 `if/else` 或提前返回显式表达分支。

### 替代写法

1. **简单分支使用 `if/else` 显式赋值**：

```java
// 禁止
String status = order.getStatus() == 1 ? "已确认" : "待确认";

// 推荐
String status;
if (order.getStatus() == 1) {
    status = "已确认";
} else {
    status = "待确认";
}
```

2. **分支返回不同结果时使用提前返回**：

```java
// 禁止
return result == null ? Response.error("404", "订单不存在") : Response.success(result);

// 推荐
if (result == null) {
    return Response.error("404", "订单不存在");
}
return Response.success(result);
```

3. **多条件取值时提取方法或映射**：需要根据多个条件取值的场景，优先提取为命名清晰的私有方法，或使用枚举 / `Map` 映射，不要用嵌套三元堆叠判断。
4. **函数调用与 Stream 表达式：先算进临时变量，再使用**：三元不允许直接写在函数调用参数或 Stream 表达式内部，应先用 `if/else` 算出结果存入临时变量，再传参或使用：

```java
// 禁止：三元直接写在函数调用参数里
send(record, A.equals(result.getCode()) ? "S" : "F");

// 推荐：先算临时变量，再传参
String status;
if (A.equals(result.getCode())) {
    status = "S";
} else {
    status = "F";
}
send(record, status);
```

```java
// 禁止：三元直接写在 Stream 表达式内部
List<String> statusList = orders.stream()
        .map(order -> order.getStatus() == 1 ? "已确认" : "待确认")
        .toList();

// 推荐：lambda 内先用 if/else 算出临时变量再返回
List<String> statusList = orders.stream()
        .map(order -> {
            String status;
            if (order.getStatus() == 1) {
                status = "已确认";
            } else {
                status = "待确认";
            }
            return status;
        })
        .toList();
```

### 注意事项

- 三元表达式涉及包装类型时会触发自动拆箱，可能引入运行时 NPE：

```java
// 禁止：flag 为 false 时对 null 拆箱，抛 NPE
int value = flag ? 1 : null;
```

- 函数调用参数、Stream 表达式内部等位置直接书写三元会破坏可读性和可调试性，必须先计算到临时变量再使用（见「替代写法」第 4 条）。
- 适用范围与「变量精简原则」一致：**新增代码必须遵守**；修改既有代码时，只在本次改动直接涉及的代码范围内将三元改为 `if/else`，不得为满足本原则而顺带重构无关的既有代码。

## 锁管理原则

本项目的锁管理围绕三个维度展开：锁的选型、持锁范围、释放保障。

### 并发量与锁型选择

添加或设计锁时，必须先评估业务的并发量和竞争程度。不同锁的适用范围、实现成本和并发特征不同，不能仅因为某种锁使用方便就直接套用。至少应考虑以下因素：

- **并发规模**：评估峰值请求量、同时持锁的线程数，以及被竞争资源是否属于热点资源。
- **临界区耗时**：临界区越长，等待线程越多；应先缩短临界区，再选择能够满足并发需求的锁，避免将 I/O、RPC 或其他不确定耗时操作放入锁内。
- **读写比例**：读操作占比高且读之间可以并行时，才考虑读写锁；读写比例接近或临界区很短时，读写锁的管理成本可能抵消收益。
- **资源范围**：单 JVM 内的竞争使用本地锁；需要跨进程或跨实例协调时，使用分布式锁，不要用本地锁替代分布式互斥。
- **限流目标**：如果目标是限制同时访问资源的数量，而不是保证同一资源只能被一个线程访问，应使用信号量，不应使用互斥锁。

锁的选择应与实际并发模型匹配：低并发、短临界区优先保持实现简单；高并发或热点资源优先降低锁粒度、减少持锁时间并避免全局串行化；无法准确预估并发量时，应通过压测和运行指标验证锁等待时间、持锁时间、超时次数及吞吐量，再决定是否调整锁型或锁粒度。

### 选型原则

| 场景 | 推荐 | 说明 |
|------|------|------|
| 单体 JVM 内互斥 | `synchronized` / `ReentrantLock` | 按需选择，`synchronized` 适合短临界区 |
| 跨进程 / 跨实例互斥 | `RLock`（Redisson） | 必须指定 wait + lease，防止节点宕机锁泄漏 |
| 读写分离场景 | `ReentrantReadWriteLock` / `RLock` | 读多写少时减少写锁对读的阻塞 |
| 限流 / 信号量 | `Semaphore` / Redisson `RSemaphore` | 控制并发数而非互斥 |

- **粒度从粗到细**：先按业务资源选锁粒度（酒店级 > 房型级 > 价格计划级），不做比业务要求更细的锁。
- **避免嵌套锁**：持锁后不再获取另一把锁。必须嵌套时固定加锁顺序，按「粒度从大到小」单向获取。

### 释放保障

锁分为两类，分别走不同的释放路径。

#### 第一类：实现 AutoCloseable 的锁

`ReentrantLock`、`ReentrantReadWriteLock` 等都实现了 `AutoCloseable`。**优先使用 try-with-resources**，由编译器保证 close 调用：

```
try (LockHandle h = lock(wait, lease, unit)) {
    if (!h.acquired()) {
        throw BusinessException("LOCK_TIMEOUT")
    }
    return doUnderLock()
} catch (InterruptedException e) {
    restore interrupt flag
    throw BusinessException("LOCK_INTERRUPTED")
}
```

如果锁对象本身不直接实现 `AutoCloseable`，写一个轻量包装，让调用方统一走 try-with-resources，**不要**在普通 try-finally 中手动释放：

```
class LockHandle implements AutoCloseable {
    private final Lock lock;
    private final boolean acquired;
    LockHandle(Lock lock, boolean acquired) { ... }
    boolean acquired() { return acquired; }
    @Override void close() {
        if (acquired && lock.isHeldByCurrentThread()) lock.release();
    }
}
```

#### 第二类：不能 try-with-resources 的锁

`synchronized`、`Semaphore`（无 close 语义或调用方拿不到锁对象引用）才使用手动 try-finally，并且**必须**遵守：

1. **finally 与加锁同级**：释放的 `finally` 与「加锁调用」在同一层 `try`，不放在内层 try 或 if 之后的另一个 try 里。
2. **acquired 标志位**：`boolean acquired = false;` 在 try 中赋值，finally 用 `if (acquired && lock.isHeldByCurrentThread())` 双层保护——加锁抛错或未获取到时 `acquired` 为 `false`，不会误调释放。
3. **中断异常转业务异常**：`catch (InterruptedException)` 中恢复中断标志后抛业务异常，不吞中断。
4. **加锁超时抛业务异常**：加锁返回 `false` 时抛业务异常，由调用方决定重试或返回。
5. **释放前判持锁状态**：可重入锁用 `isHeldByCurrentThread()` 作为最后闸门，避免重入场景错放。

手动释放模板（仅当锁不能 try-with-resources 时使用）：

```
acquired = false
try:
    acquired = lock(wait, lease, unit)
    if not acquired:
        throw BusinessException("LOCK_TIMEOUT")
    return doUnderLock()
catch InterruptedException:
    restore interrupt flag
    throw BusinessException("LOCK_INTERRUPTED")
finally:
    if acquired and lock.isHeldByCurrentThread():
        lock.release()
```

### 持锁范围

- **持锁时长**：锁区间包裹临界操作即可，不包含 I/O 等待、RPC 调用、用户响应等不确定耗时操作。跨实例锁必须设 lease 作为兜底超时。
- **事务边界**：锁在事务内获取，在事务回滚前释放（close 调用在事务提交前触发）。业务方法体拆为私有子方法，避免同类内部调用绕过 Spring 事务代理。不要在加锁失败前开启事务——事务 AOP 包裹建立在锁已获取的前提下。

## 返回值契约

### 规则说明（原因）

**核心原则**：**契约优先，避免防御性污染。**

方法的返回值是一种“契约”。返回 `null` 意味着调用方必须无条件进行防御性判空（`if (obj != null)`），这不仅增加了不必要的圈复杂度，还极易因遗漏判空检查而引发 `NullPointerException`（运行时崩溃）。

在绝大多数业务场景下，“没有结果”是一种常态，而非异常。使用空集合或空数组来表达“零数据”状态，完全符合数学和逻辑上的“零元素容器”概念。它能让调用方安全地使用增强 `for` 循环、`Stream` 流操作或 `forEach` 方法，而无需关心底层是否真的存在数据，从而大幅提升代码的健壮性和可读性。

**特殊说明（针对“意图性”争议）**：  
如果开发者认为返回 `null` 是为了表达“数据不存在”、“查询失败”或“资源未找到”等**业务语义**，这属于**设计缺陷**而非代码缺陷。正确的做法是使用 `java.util.Optional` 显式声明“可能有/无”，或者通过抛出明确的业务异常（如 `NotFoundException`）来传递失败原因，**严禁**将 `null` 作为业务状态的信号量。

---

### 规则行为（触发条件与修复）

**触发条件（什么情况会报错）**：  
当方法声明的返回类型为以下类型，且代码中存在 `return null;` 语句时，SonarQube 会标记为“漏洞”：

- `java.util.Collection`（及其子类，如 `List`、`Set`）
- `java.util.Map`（及其子类）
- **数组类型**（如 `String[]`、`int[]`）

**自动修复指引（如何修复）**：

1. **针对集合（List/Set/Map）**：
   - 替换为 `Collections.emptyList()`、`Collections.emptySet()` 或 `Collections.emptyMap()`。
   - _注意_：这些方法返回的是**不可变空集合**。如果调用方需要修改集合，则返回 `new ArrayList<>()`（可变空集合）。
2. **针对数组**：
   - 替换为 `new T[0]`（例如 `new Result[0]`）。
   - _性能提示_：现代 JVM（尤其是 JDK 11+）在分配零长度数组时成本极低，且能保证类型安全；若追求极致性能，也可使用 `EMPTY_ARRAY` 静态常量缓存。

**豁免场景（什么情况不报错）**：  
如果该方法有 `@Nullable` 注解（如 `javax.annotation.Nullable`、`org.springframework.lang.Nullable` 等），表明开发者有意声明该返回值可能为空，且调用方已知晓此风险，此时规则会自动忽略，不再强制要求返回空集合。

## 错误结果传递

### 规则说明

方法返回值只表达成功结果。业务失败、参数不合法、资源不存在、状态不允许或外部依赖调用失败等错误，必须通过明确的异常传递，不要使用 `null`、`false`、`-1`、错误码、错误消息、空对象或 `Response.error(...)` 作为业务方法的错误信号。

- 业务层或领域层发现错误时，抛出 `BusinessException(code, message)` 或项目中已有的更具体业务异常。
- 调用方只处理成功路径；接口适配层或统一异常处理器负责将异常转换为 `Response.error(code, message)` 等协议响应。
- 不要在中间层捕获业务异常后重新编码为普通返回值。需要补充上下文时保留原始异常作为 cause，避免丢失错误原因。
- `Optional.empty()`、空集合和 `false` 只用于表达正常业务结果，例如查询无数据、集合为空或条件判断为否，不得用来表示操作失败。

### 示例

```java
// 禁止：使用返回值混合表达成功和失败
public Response<Order> createOrder(CreateOrderCommand command) {
    if (!inventoryService.hasStock(command.getSkuId())) {
        return Response.error("STOCK_NOT_ENOUGH", "库存不足");
    }
    return Response.success(saveOrder(command));
}

// 推荐：业务方法返回成功结果，错误通过异常传递
public Order createOrder(CreateOrderCommand command) {
    if (!inventoryService.hasStock(command.getSkuId())) {
        throw new BusinessException("STOCK_NOT_ENOUGH", "库存不足");
    }
    return saveOrder(command);
}
```

## 异常处理

- 业务异常抛 `BusinessException(code, message)` → HTTP 200 + code "422"
- 参数校验异常由 `GlobalExceptionHandler` 捕获 → HTTP 200 + code "422"
- NPE / RuntimeException → HTTP 500

## 日志

- `@Slf4j(topic = "business")` 记录业务日志
- topic 分类便于日志聚合

## 响应模式

- `Response.success(data)` / `Response.error(code, msg)`
- `PageResponse<T>` 分页响应
