# Интеграция Chainlink ACE в Permissioned Pools

Документ описывает, как permissioned-пулы Algebra Integral гейтятся по KYC-кредам Chainlink ACE.
Рассчитан и на чтение человеком, и на передачу в новую сессию как единственный источник контекста.

Статус: рабочий PoC на Base Sepolia. Контракты написаны и покрыты тестами, ончейн-данных ACE
на момент написания ещё нет (см. [Что проверено, а что нет](#что-проверено-а-что-нет)).

---

## 1. Задача

В пакете уже был `OnchainIdAllowlistChecker` — гейт пулов по клеймам OnchainID. Нужно то же самое,
но на Chainlink ACE, как альтернатива или дополнение. Плюс тестовый permissioned-ERC20, чтобы
прогнать сценарий целиком на своём DEX.

Точка интеграции задана Algebra и менять её нельзя:

```solidity
interface IAllowlistChecker is IERC165 {
  function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag);
}
```

`PermissionFlag` — это `bytes2`-битмаска: `SWAP_ALLOWED = 0x0001`, `LIQUIDITY_ALLOWED = 0x0002`,
`ALL_ALLOWED = 0xFFFF`, `NONE = 0x0000`. Операторы `|`, `&`, `==` определены глобально в
`libraries/PermissionFlags.sol`. **Оператор `!=` не определён** — писать `!(a == b)`.

---

## 2. Как работает плагин Algebra

Понимать это важно, потому что чекер вызывается не напрямую пользователем.

- `PermissionedPoolConnector` — плагин на пуле, хуки `BEFORE_SWAP_FLAG | BEFORE_POSITION_MODIFY_FLAG`.
- `PermissionedPoolPluginImplementation` — логика, исполняется через `delegatecall`.
- `AllowlistCheckerRegistry` — маппинг `token → checker`, ставится ролью `PERMISSIONED_POOL_MANAGER`
  в `AlgebraFactory`. Токен без чекера считается неограниченным.

Поток на свопе:

```
swap → плагин → _verifyTokenPair(pool, sender, SWAP_ALLOWED)
                  ├── registry.getChecker(token0) → checker.checkAllowlist(realSender, token0)
                  └── registry.getChecker(token1) → checker.checkAllowlist(realSender, token1)
```

Два момента, которые кусаются:

**Проверяются оба токена пары**, даже если permissioned только один. Значит газ чекера умножается
на два, и оба токена должны пропускать пользователя.

**`realSender` не равен `msg.sender`.** `_resolveRealSender` требует, чтобы вызывающий был в
`allowedRouters` этого пула, и берёт реального юзера из `IMsgSender(sender).msgSender()`. Ни
`tx.origin`, ни сырой `sender` не используются — это защита от подмены личности. Практическое
следствие: **без `setRouterAllowed(router, true)` любой своп падает с `RouterNotAllowed`**, даже у
полностью валидного юзера. Роутер обязан реализовывать `IMsgSender`.

Ещё в коннекторе есть `isTraderEligible(account, token)` — view для фронта, возвращает
`ALL_ALLOWED`, если реестр или чекер не заданы.

---

## 3. Архитектура ACE

ACE состоит из **двух слоёв**, которые в документации называются похоже и потому путаются.

### Ончейн-контракты (открытый код, BUSL-1.1)

| Контракт | Роль |
|---|---|
| `IdentityRegistry` | `address → CCID` (`bytes32`). Один адрес = один CCID, навсегда |
| `CredentialRegistry` | `(CCID, credentialTypeId) → {expiresAt, credentialData}` |
| `PolicyEngine` | движок правил, знает про identity ноль — это отдельный тип политики |
| `OnlyAuthorizedSenderPolicy` | гейт на запись в реестры |

### Managed-платформа (private beta, `ace.api.chain.link`)

Policy Manager, Identity Manager, Reporting Manager — UI и API поверх тех же контрактов.
Это **операционная обвязка, а не замена контрактам**.

### Цепочка владения

Это ключевая схема. Проверена ончейн и подтверждена документацией:

```
твой EOA  0xDeaD1F5aF792afc125812E875A891b038f888258
   │ owner()
   ▼
CRE Connect Wallet  0xE4Eda1dAd08f2611DFDb9E058F2135174305c92b
   │ (контракт "CLLSmartAccount" v1, он же SVA — Signature Verifying Account)
   ├── owner() ──────► IdentityRegistry
   ├── owner() ──────► CredentialRegistry
   └── DEFAULT_ADMIN + ADMIN + POLICY_CONFIG ──► PolicyEngine
```

Ты владеешь всем **транзитивно**. Chainlink зарегистрирован как authorized operator: может
исполнять операции, но **не может** сменить владельца или список подписантов. По документации ты
вправе в любой момент удалить Chainlink из signer'ов и отрезать ACE от своих контрактов.

Модель подписи — **delegated signing**: транзакции подписывает и отправляет Chainlink своим
внутренним ключом, выделенным под организацию. Альтернатива (self-signing, EIP-712 через CRE
Connect SDK) выбирается при онбординге.

**Газ платит Chainlink.** Проверено: деплой-транзакцию отправил релеер `0x363A80f6...`, а
CRE Connect Wallet держит нулевой баланс и в пополнении не нуждается.

---

## 4. Запись и чтение — это два разных мира

Самая важная мысль документа.

```
ЗАПИСЬ (выдать KYC)                     ЧТЕНИЕ (проверить KYC)
───────────────────                     ──────────────────────
фронт/бэкенд → ACE API                  контракт → getIdentity()
   → CRE Connect                                 → validate()
   → CLLSmartAccount
   → registries                         permissionless, без API,
требует API-ключ                        без прав, без газа сверх своей транзакции
асинхронно                              синхронно
```

Стороны не пересекаются. **Чекер и токен никогда не обращаются к API** — только читают контракты.
API нужен исключительно администратору для онбординга пользователей.

### Писать в реестры может только смарт-аккаунт

Проверено вызовом `senderAuthorized(address)` на `OnlyAuthorizedSenderPolicy`:

| Адрес | Может писать |
|---|---|
| CLLSmartAccount `0xE4Eda1...` | **да** |
| твой EOA `0xDeaD1F5a...` | нет |
| релеер Chainlink `0x363A80f6...` | нет |
| KeystoneForwarder `0xF8344CFd...` | нет |

Отсюда вывод, который многих сбивает: **«положить приватник на фронт и звать контракты напрямую»
не работает и не является более простым путём**. Твой EOA не авторизован, а чтобы его авторизовать,
нужен `setPolicyConfiguration` с ролью `POLICY_CONFIG_ADMIN_ROLE`, то есть всё равно проход через
смарт-аккаунт. Технически возможно (подписать EIP-712, смарт-аккаунт вызовет реестр — он-то
авторизован), но ABI смарт-аккаунта недокументирован, а штатный инструмент — CRE Connect SDK под
self-signing. Для демо это дни работы там, где API решает одним POST.

---

## 5. Три уровня интеграции

### Уровень 1 — прямое чтение реестров ✅ используется

Чекер сам зовёт `IdentityRegistry.getIdentity()` и `CredentialRegistry.validate()`.
Ничего разворачивать на стороне ACE не нужно, работает сразу.

### Уровень 2 — ACE Identity Validator ✅ поддержан, не активирован

`CredentialRegistryIdentityValidatorPolicy` формально является Policy, но имеет обычную публичную
view-функцию:

```solidity
function validate(address account, bytes calldata context) external view returns (bool);
```

Ни `attach`, ни PolicyEngine, ни экстрактор для её вызова не нужны — это просто чтение.

Что даёт: требования (какие креды, кворум `minValidations`, несколько реестров как источники,
`invert`, grouped-роутинг по сегментам, Data Validators для юрисдикций) переезжают из нашего
контракта в конфигурацию ACE и меняются через `PATCH /policies/<ID>/configs` **без передеплоя**.

Как поднять: `POST /v1/policies` создаёт инстанс политики. **Инстанс политики и protection — разные
сущности.** Можно создать и настроить валидатор, не создавая ни target, ни protection, и просто
читать его. Косвенное подтверждение — у `GET /policies` есть фильтр `only_with_active_protections`,
то есть политики без протекций это нормальное состояние.

Ограничение: `validate()` возвращает один `bool`. Градация флагов делается **двумя валидаторами** —
один под kyc, другой под accredited, и в чекере два правила вида `Validator`.

### Уровень 3 — полный PolicyEngine ❌ закрыт для Algebra

Два независимых блокера, оба зафиксированы в документации ACE:

1. **Экстракторы.** «During ACE Beta, the platform provides pre-built extractors for ERC-20 and
   ERC-3643 function signatures only. Custom extractors for other contract types are not available.»
   Под сигнатуры пула Algebra экстрактора нет и сделать нельзя.
2. **Наследование.** «Before registering a target, your contract must be ACE-compatible — it needs
   to inherit `PolicyProtected` and use the `runPolicy` modifier.» Пул Algebra этого не делает, и
   переписать его мы не можем.

Даже если Chainlink откроет кастомные экстракторы, второй блокер останется. Это не «пока нельзя», а
архитектурно не наш путь.

**Важно:** для **своего** ERC20 уровень 3 доступен — ERC-20 экстракторы в Beta есть, контракт наш.
Мы им не воспользовались ради простоты (см. §7), но это рабочая опция.

### Побочный эффект выбора

Обходя PolicyEngine, мы теряем **Reporting API**: он индексирует события твоих PolicyEngine, а наши
свопы туда не попадут. Истории policy runs и аудита отказов на стороне ACE не будет. Если
комплаенс-отчётность понадобится, строить её придётся самим на событиях Algebra (`NotAllowed`).

---

## 6. AceAllowlistChecker

`contracts/AceAllowlistChecker.sol`, интерфейс `contracts/interfaces/IAceAllowlistChecker.sol`.

### Модель правил

```solidity
enum RuleKind { Credential, Validator }

struct Rule {
  address validator;          // для kind == Validator
  PermissionFlag flags;       // что даёт это правило
  RuleKind kind;
  bytes32 credentialTypeId;   // для kind == Credential
}
```

**Флаги объединяются, а не заменяются.** Аккаунт получает `|` всех правил, которые он удовлетворяет.
Именно это позволяет `common.kyc → SWAP` и `common.accredited → SWAP|LIQUIDITY` сосуществовать: держатель
обоих кредов получит `0x0003`.

Конфигурация под текущий деплой (порядок важен, см. ниже):

```
Rule{ kind: Credential, credentialTypeId: keccak256("common.accredited"), flags: 0x0003 }
Rule{ kind: Credential, credentialTypeId: keccak256("common.kyc"),        flags: 0x0001 }
```

### Поведение

- **Fail closed.** Нет правил → `NONE`. Нет CCID → `NONE`.
- **Ошибки конфигурации ревертятся, а не проглатываются.** Внешние вызовы идут без `try/catch`.
  Все три метода (`getIdentity`, `validate` у реестра и у валидатора) по спецификации не ревертятся,
  значит реверт означает неверный адрес — и он должен быть виден. Раньше здесь стоял `try/catch`,
  но он не спасал торговлю: при неверном адресе реестра падали все правила разом, чекер возвращал
  `NONE`, и свопы всё равно отклонялись — только с `NotAllowed` вместо указания на реестр, то есть
  неотличимо от «кред не выдан». См. цену такой ошибки в §9.
- **Ленивый CCID.** `getIdentity` вызывается только когда реально понадобилось правило типа
  `Credential`. Конфигурация из одних валидаторов за него не платит.
- **Short-circuit.** Правило, которое не может добавить новых битов
  (`(granted & rule.flags) == rule.flags`), пропускается без внешнего вызова. Поэтому **accredited
  ставь первым** — тогда для аккредитованного юзера второй `validate` не вызовется.
- **Per-token overrides.** `setTokenRules(token, rules)` перекрывает дефолты для конкретного токена;
  пустой массив возвращает к дефолтам. Один чекер обслуживает много токенов с разными требованиями.
- **Адреса реестров мутабельны** (`setRegistries`) — ACE-деплои живут по организациям и по сетям.
- **Валидация конфига.** Правило без флагов, `Credential` без `credentialTypeId` или `Validator` без
  адреса откатываются с `InvalidRule` — чтобы молчаливая опечатка не превратилась в «никому нельзя».

### Переключение на уровень 2

Передеплой не нужен. Один вызов от админа:

```solidity
checker.setDefaultRules([
  Rule({ validator: 0xACCRED_VALIDATOR, flags: 0x0003, kind: RuleKind.Validator, credentialTypeId: 0 }),
  Rule({ validator: 0xKYC_VALIDATOR,    flags: 0x0001, kind: RuleKind.Validator, credentialTypeId: 0 })
]);
```

Перерегистрировать чекер в `AllowlistCheckerRegistry` не требуется. Типы правил можно смешивать.

---

## 7. TestPermissionedERC20

`contracts/test/TestPermissionedERC20.sol`. Лежит в `test/` намеренно: это демо-леса, владелец —
обычный EOA, минт ничем не ограничен.

Токен **не ходит в чекер**, а читает реестры ACE сам: `getIdentity` → `validate` по одному
`requiredCredentialTypeId`. Так сделано намеренно. `IAllowlistChecker` — это абстракция пула,
вендоренная из v4-periphery, и словарь у неё пуловый (`SWAP_ALLOWED`, `LIQUIDITY_ALLOWED`), который
ничего не говорит о праве держать актив. Токену нужен ответ «да/нет» про один кред, и он его
получает напрямую, как это делает настоящий RWA-токен.

Цена решения: гейт токена и гейт пула настраиваются независимо, и расхождение в типе креда выглядит
как «переводы проходят, свопы отклоняются» (или наоборот). При разборе демо проверяйте оба.

Реестровые вызовы **без `try/catch`** — по той же логике, что и в чекере (§6): неверный адрес должен
падать громко, а не превращаться в «нет креда». OZ 4.9, поэтому хук `_beforeTokenTransfer`, а не `_update`.

### Список исключений — читать обязательно

**Проверяются обе стороны трансфера.** А своп физически двигает токены **на пул и с пула**. Значит
адрес пула обязан проходить проверку, иначе первый же своп упадёт с `TransferNotAllowed(pool)`, и
выглядеть это будет как поломка плагина, хотя дело в токене. То же касается роутера.

Два решения:

1. `setExempt(pool, true)` — быстро, очевидно в отладке, для теста рекомендуется;
2. зарегистрировать адрес пула как identity с кредом через API — ближе к тому, как ведут себя
   настоящие RWA-токены.

Есть `setExemptBatch(address[], bool)` для пачки. Деплойер исключён автоматически в конструкторе,
иначе токен нельзя было бы заминтить до онбординга кого-либо.

Минт и бёрн: нулевой адрес не проверяется, но **реальный контрагент проверяется**. То есть минт на
не-KYC'нутый адрес откатится. Это осознанное поведение, обходится через `setExempt`.

### Остальное API

- `isAllowed(address) → bool` — для фронта, чтобы объяснить отказ **до** отправки транзакции.
  Внимание: при неверно заданном реестре он теперь ревертится, а не возвращает `false`.
- `setRequiredCredentialTypeId(bytes32)` — сменить требуемый тип креда, например с kyc на accredited.
- `setRegistries(address(0), address(0))` — снимает все ограничения, удобно для отладки пула
  отдельно от гейта.

---

## 8. Управление и эксплуатация

### Кто чем управляет

Полномочия размазаны по трём контрактам и API — это главный источник путаницы в эксплуатации.

| Действие | Где | Кто может |
|---|---|---|
| Правила чекера, адреса реестров | `AceAllowlistChecker` | `admin` чекера |
| Назначить чекер токену / снять | `AllowlistCheckerRegistry` | `PERMISSIONED_POOL_MANAGER` в `AlgebraFactory` |
| Роутеры, реестр на конкретном пуле | плагин пула | `_authorize()` плагина |
| Исключения, реестры, тип креда токена | `TestPermissionedERC20` | `owner` токена |
| Выдать / отозвать креды | ACE Coordinator API | API-ключ организации |

Ни одна из этих ролей не подразумевает остальных. Например, админ чекера **не может** сам подключить
свой чекер к токену — для этого нужна роль в `AlgebraFactory`.

### ⚠️ admin чекера неизменяем

```solidity
address public immutable override admin;
```

Функции передачи прав нет. **Потеря ключа замораживает конфигурацию навсегда.** Чекер продолжит
работать и пускать людей по уже заданным правилам, но изменить правила или переключить реестры
станет невозможно.

Выход есть, но через Algebra: задеплоить новый чекер и переназначить его
`AllowlistCheckerRegistry.setChecker(token, newChecker)`. То есть нужна роль
`PERMISSIONED_POOL_MANAGER`, а не ключ чекера.

Для теста это приемлемо. Для продакшена админом должен быть мультисиг.

### Admin API чекера

| Функция | Действие |
|---|---|
| `setDefaultRules(Rule[])` | заменяет дефолтные правила **целиком** |
| `setTokenRules(address, Rule[])` | override для токена; пустой массив снимает override |
| `setRegistries(address, address)` | переключает пару реестров ACE |

Все три — `onlyAdmin`, откат с `OnlyAdmin`. Замена всегда целиком, инкрементального добавления
правила нет: читай текущие через `getDefaultRules()`, меняй, записывай обратно.

Чтение: `getDefaultRules()`, `getTokenRules(token)`, `getEffectiveRules(token)` — последняя показывает,
что реально применится к токену с учётом фолбэка на дефолты.

События для мониторинга: `RegistriesUpdated`, `DefaultRulesUpdated`, `TokenRulesUpdated`.

### Порядок правил

Правила проверяются **все**, и флаги объединяются, поэтому порядок **не влияет на результат** —
только на газ. Более «щедрые» правила ставь первыми, чтобы сработал short-circuit: `accredited`
(`0x0003`) перед `kyc` (`0x0001`).

Это принципиально отличается от policy chain в самом ACE, где порядок влияет на исход, потому что
`Allow` и `Reject` обрывают цепочку. Здесь такого нет.

### Рецепты

**Подключить ещё один токен с теми же требованиями**
`AllowlistCheckerRegistry.setChecker(token, checker)` — и всё. В чекере ничего делать не надо, токен
подхватит дефолтные правила.

**Токен с особыми требованиями**
`checker.setTokenRules(token, [...])`, затем `registry.setChecker(token, checker)`.

**Ужесточить требования глобально**
`checker.setDefaultRules([...])` — действует мгновенно на все токены без override.

**Переключиться на валидаторы ACE**
`checker.setDefaultRules([...])` с правилами вида `Validator` — см. §6. Передеплой и
перерегистрация не нужны.

**Сменить ACE-организацию или сеть**
`checker.setRegistries(newIdentityRegistry, newCredentialRegistry)`.

### Как остановить торговлю

Отдельного kill switch нет намеренно. Три уровня, от точечного к грубому:

1. **Отозвать креды** через ACE API (архивация кредa удаляет запись ончейн сразу) — точечно, по
   конкретному пользователю, торговля остальных продолжается.
2. **`checker.setDefaultRules([])`** — чекер начинает отдавать `NONE` всем, пул встаёт целиком.
   Обратимо одним вызовом.
3. **`AllowlistCheckerRegistry.setChecker(token, address(0))`** — ⚠️ **это не стоп-кран.** Токен без
   чекера считается **неограниченным**, то есть свопы откроются для всех. Легко перепутать с
   блокировкой, последствие противоположное задуманному.

### Управление токеном

| Функция | Зачем |
|---|---|
| `setExempt(address, bool)` | исключить пул или роутер — **обязательно**, см. §7 |
| `setExemptBatch(address[], bool)` | то же пачкой |
| `setRequiredCredentialTypeId(bytes32)` | сменить требуемый тип креда, например kyc → accredited |
| `setRegistries(address, address)` | переключить реестры; нули снимают все ограничения |
| `mint(address, uint256)` | только `owner`; получатель проверяется, если не исключён |

---

## 9. Адреса и параметры (Base Sepolia, chainId 84532)

### ACE, версия контрактов 1.2.0

| Что | Адрес |
|---|---|
| IdentityRegistry | `0x2F50E9873803B0B9e8Ddc11b097976c9F7E06e3F` |
| CredentialRegistry | `0xC29427DdD150Fe443d702B27e1247435730b85C8` |
| PolicyEngine | `0xEfc5E9573FE1Ab9B7cb3bA46ccf48F5547E15046` |
| OnlyAuthorizedSenderPolicy | `0xE54eB3E36dCfe3b7a033299e571130aCeC435B2a` |
| CRE Connect Wallet (CLLSmartAccount) | `0xE4Eda1dAd08f2611DFDb9E058F2135174305c92b` |
| твой EOA (owner) | `0xDeaD1F5aF792afc125812E875A891b038f888258` |
| KeystoneForwarder | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

Реестры — ERC1967-прокси над общими implementation'ами, развёрнуты фабрикой одной транзакцией.
Валидатора (`CredentialRegistryIdentityValidatorPolicy`) в деплое **нет** — для уровня 2 его надо
создавать через API.

### Chain selector

Base Sepolia: `10344971235874465080`. Нужен в каждом запросе к ACE API.

### Типы кредов ✅ СВЕРЕНО

```
common.kyc         → 0x455af80b0708d48777181ab288cb8aad0befe0f51a15ddafdd875abdf26278c6  → SWAP_ALLOWED
common.accredited  → 0x176f73d7d710f2d36df66a084162d59191f4cd788a102393e110130affbb4497  → SWAP|LIQUIDITY
```

Это `keccak256` от строк, посчитанный локально, и он **совпал с ончейн-значениями**: сверено через
`GET /v1/credential-types`, поле `credential_type_hash`, оба типа совпадают побайтово. Правила
чекера в §6 верны, менять их не нужно.

Реквизиты организации, нужные для запросов к API:

| Что | Значение |
|---|---|
| `registry_id` | `c3598ceb-9d9a-4ecb-9378-061f2d47a79e` (Theorem Demo Registry) |
| `credential_type_id` для `common.kyc` | `3356458c-52fe-43d8-be89-a052206b101f` |
| `credential_type_id` для `common.accredited` | `cc1daec0-d1d3-4b4c-8e28-53c473db244b` |

UUID нужны только для онбординга через API, ончейн пишется хеш — см. ловушку в §10.

**Цена ошибки:** расхождение не даёт ни ревертов, ни ошибок. `validate()` вернёт `false`, чекер
отдаст `NONE`, все свопы будут отклоняться. Выглядит идентично «кред не выдан». Сверять до отладки.

---

## 10. Онбординг пользователя через API

Терминологическая ловушка: у типа кредов **два разных идентификатора**.

| Где | Поле | Тип | Для чего |
|---|---|---|---|
| API | `credential_type_id` | UUID | ссылаться на тип в запросах |
| API | `credential_type_hash` | bytes32 | то, что пишется ончейн |
| Контракт | `credentialTypeId` | bytes32 | = API-шный **hash**, не UUID |

Поле контракта называется как UUID-поле API, а соответствует хешу. Перепутаешь — молчаливый отказ.

### Последовательность

```bash
# 1. Найти registry_id и сверить адреса
curl "https://ace.api.chain.link/v1/registries?include_onchains=true" \
  -H "Authorization: Apikey $ACE_API_KEY"

# 2. Забрать настоящие хеши типов (или создать типы, если их нет)
curl "https://ace.api.chain.link/v1/credential-types?registry_id=$REGISTRY_ID" \
  -H "Authorization: Apikey $ACE_API_KEY"

# 3. Онбординг: identity + креды одним запросом
curl -X POST "https://ace.api.chain.link/v1/identities" \
  -H "Authorization: Apikey $ACE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "title": "demo user",
    "entity_id": "demo-<уникальный>",
    "registry_id": "'"$REGISTRY_ID"'",
    "onchain_identities": [{ "address": "0x...", "chain_selector": "10344971235874465080" }],
    "credentials": [{ "credential_type_id": "<UUID типа>" }]
  }'
```

Типы кредов **не существуют на контрактах** — `POST /credential-types` пишет только в базу
платформы, ончейн ничего не появляется. Хеш впервые попадает в цепочку в момент выдачи креда
конкретному пользователю.

### Что происходит ончейн

```
IdentityRegistry:    accountToCcid[address] = ccid
                     ccidToAccounts[ccid].push(address)
                     emit IdentityRegistered(ccid, address)

CredentialRegistry:  credentialTypeIdsByCCID[ccid].push(typeId)
                     credentials[ccid][typeId] = {expiresAt, credentialData}
                     emit CredentialRegistered(ccid, typeId, expiresAt, data)
```

`expires_at` пропущен → ончейн `expiresAt == 0` → **кред бессрочный** (`_validate` трактует ноль как
«без срока», не как «истёк»).

### Фронт

Запись асинхронна, синхронного подтверждения нет. Правильный флоу:

1. кнопка «Пройти KYC» → POST на свой бэкенд-прокси;
2. прокси (15 строк) держит API-ключ и дёргает ACE;
3. фронт **поллит `getIdentity(address)` ончейн**, пока не вернётся не-ноль.

**Не клади API-ключ во фронт.** Не из-за абстрактной безопасности, а потому что ключ даёт полный
контроль над всей ACE-организацией: создать и заархивировать реестры, выдать любой кред, отозвать
чужие. Это хуже, чем засветить одноразовый приватник.

---

## 11. Деплой и проводка

На контрактах ACE делать **не нужно ничего** — чекеру требуются лишь два адреса и два хеша.
Его можно задеплоить хоть до создания типов: он будет отдавать `NONE`, пока креды не появятся, и
это не потребует передеплоя.

```
1. deploy AceAllowlistChecker(admin, IDENTITY_REGISTRY, CREDENTIAL_REGISTRY, rules)
2. deploy TestPermissionedERC20("...", "...", IDENTITY_REGISTRY, CREDENTIAL_REGISTRY, KYC_TYPE_HASH)
3. AllowlistCheckerRegistry.setChecker(token, checker)     ← роль PERMISSIONED_POOL_MANAGER
4. plugin.setAllowlistCheckerRegistry(registry)
5. plugin.setRouterAllowed(router, true)                   ← иначе RouterNotAllowed на каждом свопе
6. token.setExemptBatch([pool, router], true)              ← иначе TransferNotAllowed(pool)
7. token.mint(...) и залив ликвидности
```

Шаги 5 и 6 — те, о которых забывают. Оба дают отказ, который выглядит как ошибка не в том месте.

---

## 12. Грабли, собранные в одном месте

| Грабля | Проявление | Решение |
|---|---|---|
| Роутер не в allowedRouters | `RouterNotAllowed` на любом свопе | `setRouterAllowed` |
| Пул не исключён в токене | `TransferNotAllowed(pool)` | `setExempt(pool, true)` |
| Хеш типа не совпал | все свопы отклоняются, ошибок нет | сверить `credential_type_hash` |
| Адрес уже зарегистрирован | `IdentityAlreadyRegistered` при повторном POST | адрес регистрируется **один раз навсегда**, держи запас кошельков |
| Один кред на тип | `CredentialAlreadyRegistered` | сначала архивировать старый |
| Адрес не привязан на нужной сети | `getIdentity` = 0 при валидном KYC на другой сети | креды реплицируются по сетям, **привязки адресов — нет**; указывать нужный `chain_selector` |
| Отзыв не мгновенен кросс-чейн | пул пускает уже отозванного | архивация кредa удаляет запись ончейн сразу, но время распространения между сетями не гарантировано |

---

## 13. Что проверено, а что нет

**Проверено ончейн:**

- цепочка владения и права (`owner()`, `hasRole`, `senderAuthorized`);
- read-путь: `validate()` возвращает `false` без реверта, доступен без прав;
- write-путь симуляцией `eth_call`: `registerIdentity` и `registerCredential` от смарт-аккаунта
  проходят, от EOA — откатываются с `sender is not authorized`;
- `defaultPolicyAllow` = allow (иначе записи падали бы, т.к. политика возвращает `Continue`).

**Проверено через Coordinator API** (боевым ключом, ответы совпадают напрямую и через прокси):

- `GET /registries` — адреса реестров совпадают с §9, организация `org_CuC6sbT5CbnQOmTa`;
- `GET /credential-types` — оба `credential_type_hash` совпали с локально посчитанными;
- API закрыт полностью: без заголовка `Authorization` отдаёт `Jwt is missing`.

**Проверено тестами:** весь пакет 71 passing (`AceAllowlistChecker` 21, `TestPermissionedERC20` 16).
Покрыты объединение флагов, оба типа правил и их смесь, per-token overrides, громкое падение при
неверном адресе реестра или валидатора, ERC-165 и регистрация в реестре, исключения токена,
минт/бёрн, смена типа креда и переключение реестров.

Прогонять их нужно с рабочим `ANKR_API_KEY` в корневом `.env`: hardhat-сеть форкает Base на
зафиксированном блоке, и без ключа падают вообще все тесты пакета с 404 от `rpc.ankr.com`, хотя
сами эти специи целиком на моках и форк им не нужен.

**Проверено сквозным прогоном** (первая запись через этот деплой):

- `POST /identities` через прокси → `202`, CCID
  `0x0b675ff870d40ff0b2470ef97ee916ae78ae96bf8df423aa8d8f6160f6cb9275` для адреса
  `0x7da9266E76894523e9ACa8088d15A084b6eF440A`, статус `creation_pending`;
- через несколько секунд ончейн: `getIdentity` вернул тот же CCID, `validate` для **обоих**
  типов вернул `true`. Весь путь API → CRE → смарт-аккаунт → реестры работает;
- ответ API креды не перечисляет, хотя выдаёт их — проверять только чтением из реестра.

**Не проверено:**

- свопы на живых данных: гейт пула с реальным кредом ещё не прогонялся;
- расход газа чекера в свопе не измерялся;
- функции управления signer'ами на смарт-аккаунте определены по селекторам, ABI нет.

---

## 14. Открытые вопросы к Chainlink

1. Перевыставляется ли газ клиенту? В Beta суммы копеечные, в мейннете 1.5M газа — уже нет.
2. Какая гарантия по времени на распространение **отзыва** креда между сетями? Задержка выдачи
   безобидна, задержка отзыва — дыра в комплаенсе, а гейтом выступаем мы.
3. Приемлемо ли прямое ончейн-чтение чужого реестра в обход access grants? Их собственная
   документация говорит, что после отзыва гранта ончейн-политики продолжают работать, то есть грант
   — конструкт платформы, а не блокчейна. Но обязательство убрать источник остаётся организационным.
4. Планируются ли кастомные экстракторы после Beta?

---

## 15. Файлы

```
contracts/
  AceAllowlistChecker.sol                       чекер
  interfaces/IAceAllowlistChecker.sol           его интерфейс, Rule и RuleKind
  interfaces/ace/IAceIdentityRegistry.sol       минимальные вендоренные интерфейсы ACE:
  interfaces/ace/IAceCredentialRegistry.sol     пакет @chainlink/* под BUSL-1.1 намеренно
  interfaces/ace/IAceIdentityValidator.sol      не берётся в зависимости
  test/TestPermissionedERC20.sol                демо-токен
  test/mocks/MockAce*.sol                       три мока, у каждого shouldRevert
test/
  AceAllowlistChecker.spec.ts                   21 тест
  TestPermissionedERC20.spec.ts                 16 тестов
```

Про лицензию: контракты ACE под **BUSL-1.1**, и файл грантов в их репозитории пуст — то есть
продакшн-использование пока не разрешено никому, только non-production. Поэтому мы не тянем
`@chainlink/*` в зависимости, а объявляем свои минимальные интерфейсы: точно так же этот пакет
поступил с OnchainID. Для локальных тестов и тестнета ограничений нет.
