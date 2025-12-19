# NewMockTimeUpgradeablePluginFactory Tests

This test suite covers the upgradeable plugin architecture based on the **Beacon Proxy Pattern** with **Transparent Upgradeable Proxy** for the factory.

## Test Files Structure

| File | Description |
|------|-------------|
| `NewMockTimePluginFactory.spec.ts` | Full test suite (all tests in one file) |
| `NewMockTimePluginFactory.basic.spec.ts` | Basic functionality tests |
| `NewMockTimePluginFactory.configuration.spec.ts` | Configuration setters tests |
| `NewMockTimePluginFactory.upgrade.spec.ts` | Upgrade flow tests |
| `NewMockTimePluginFactory.security.spec.ts` | Security module tests |
| `NewMockTimePluginFactory.oracle.spec.ts` | Volatility Oracle tests |
| `shared/fixtures.ts` | Shared test fixtures |

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph Factory["Factory Layer (Transparent Proxy)"]
        PA[ProxyAdmin<br/>Owner] --> TUP
        subgraph TUP["TransparentUpgradeableProxy"]
            PF[NewMockTimeUpgradeablePluginFactory<br/>- algebraFactory<br/>- beacon<br/>- defaultFeeConfiguration<br/>- securityRegistry<br/>- defaultRebalanceManager<br/>- farmingAddress<br/>- pluginByPool mapping]
        end
    end

    subgraph Beacon["Beacon Layer"]
        APB[AlgebraPluginBeacon<br/>- implementation<br/>- algebraFactory<br/>- pluginFactory]
        IMPL[MockTimeAlgebraUpgradeablePlugin<br/>Implementation - stateless<br/>Module Connectors immutable]
        APB -->|points to| IMPL
    end

    subgraph Plugins["Plugin Instances (BeaconProxy)"]
        P1[Plugin Pool 1<br/>Storage ERC-7201]
        P2[Plugin Pool 2<br/>Storage ERC-7201]
        PN[Plugin Pool N<br/>Storage ERC-7201]
    end

    PF -->|creates| APB
    P1 & P2 & PN -->|delegatecall| APB
```

---

## ERC-7201 Namespaced Storage

```mermaid
classDiagram
    class BasePluginStorage {
        +address pool
        +address pluginFactory
        +string[] activeModules
    }
    class VolatilityOracleStorage {
        +Timepoint[] timepoints
        +uint16 timepointIndex
        +uint32 lastTimepointTimestamp
    }
    class DynamicFeeStorage {
        +AlgebraFeeConfiguration feeConfig
    }
    class FarmingProxyStorage {
        +address incentive
    }
    class ALMStorage {
        +address rebalanceManager
        +uint32 slowTwapPeriod
        +uint32 fastTwapPeriod
    }
    class SecurityStorage {
        +address securityRegistry
    }
    class UpgradeTestStorage {
        +uint256 newVariable
    }
```

| Namespace | Contains |
|-----------|----------|
| `algebra.storage.baseplugin` | pool, pluginFactory, activeModules |
| `algebra.storage.volatilityoracle` | timepoints[], timepointIndex, lastTimepointTimestamp |
| `algebra.storage.dynamicfee` | feeConfig struct |
| `algebra.storage.farmingproxy` | incentive address |
| `algebra.storage.alm` | rebalanceManager, slowTwapPeriod, fastTwapPeriod |
| `algebra.storage.security` | securityRegistry |
| `algebra.storage.upgradetest` | newVariable (MockUpgradedPlugin only) |

---

## Test Suites

### 📁 NewMockTimePluginFactory.basic.spec.ts

| Test Suite | Tests |
|------------|-------|
| **#Transparent Proxy Pattern** | Factory deployed as proxy, correct algebraFactory, beacon exists, impl not initializable |
| **#Factory Upgrade via ProxyAdmin** | ProxyAdmin can upgrade, storage preserved |
| **#Plugin Creation** | Creates plugin, correct fee config, no duplicates |
| **#Plugin Creation with ALM & Security** | Plugin receives ALM/security config |
| **#Plugin Upgrade via Beacon** | Implementation accessible, can upgrade, storage preserved |

---

### 📁 NewMockTimePluginFactory.configuration.spec.ts

| Test Suite | Tests |
|------------|-------|
| **#ALM Configuration** | `setDefaultRebalanceManager`, `setDefaultAlmTwapPeriods`, events, validation |
| **#Security Configuration** | `setSecurityRegistry`, events |
| **#Fee Configuration** | `setDefaultFeeConfiguration`, events |
| **#Farming Configuration** | `setFarmingAddress`, events, no duplicate |

---

### 📁 NewMockTimePluginFactory.upgrade.spec.ts

| Test Suite | Tests |
|------------|-------|
| **#Complete Plugin Upgrade Flow** | Single upgrade affects ALL plugins, ALL storage preserved, new/old functions work |
| **#Complete Factory Upgrade Flow** | Beacon preserved, ALL configs preserved, existing plugins unaffected |

#### Plugin Upgrade Flow

```mermaid
sequenceDiagram
    participant Admin
    participant Factory
    participant Beacon
    participant Plugin1
    participant Plugin2

    Admin->>Factory: upgradePlugins(newImpl)
    Factory->>Beacon: upgradeTo(newImpl)
    Note over Beacon: implementation = newImpl
    
    Plugin1->>Beacon: call any function
    Beacon-->>Plugin1: delegatecall to newImpl
    
    Plugin2->>Beacon: call any function
    Beacon-->>Plugin2: delegatecall to newImpl
    
    Note over Plugin1,Plugin2: Storage PRESERVED<br/>Logic CHANGED
```

---

### 📁 NewMockTimePluginFactory.security.spec.ts

| Test Suite | Tests |
|------------|-------|
| **#Security Module Upgrade** | Registry preserved, V2 functions available, new storage alongside old, emergency mode |

#### Security Storage Evolution

```mermaid
flowchart LR
    subgraph V1["V1 Security Storage"]
        SR1[securityRegistry]
    end
    
    subgraph V2["V2 Security Storage"]
        SR2[securityRegistry ← PRESERVED]
        CC[checkCount ← NEW]
        LCT[lastCheckTimestamp ← NEW]
        EM[emergencyMode ← NEW]
    end
    
    V1 -->|upgrade| V2
```

---

### 📁 NewMockTimePluginFactory.oracle.spec.ts

| Test Suite | Tests |
|------------|-------|
| **#Volatility Oracle Preservation** | timepointIndex preserved, lastTimestamp preserved, timepoints array preserved, can write new, TWAP works |

#### Oracle Data Structure

```mermaid
flowchart LR
    subgraph Timepoints["Timepoints Array (circular buffer)"]
        T0[T0<br/>tick<br/>tickCum]
        T1[T1<br/>tick<br/>tickCum]
        T2[T2<br/>tick<br/>tickCum]
        T3[T3<br/>tick<br/>tickCum]
        TN[...<br/>tick<br/>tickCum]
    end
    
    IDX[timepointIndex] --> T3
    
    style T0 fill:#90EE90
    style T1 fill:#90EE90
    style T2 fill:#90EE90
    style T3 fill:#90EE90
```

---

## Mock Contracts

| Contract | Purpose |
|----------|---------|
| `MockTimeAlgebraUpgradeablePlugin` | Plugin with `advanceTime()` for time manipulation |
| `MockUpgradedPlugin` | Upgraded plugin (extends `AlgebraUpgradeablePlugin`) |
| `MockTimeUpgradedPlugin` | Upgraded plugin with `advanceTime()` |
| `MockUpgradedPluginWithNewSecurity` | Plugin with V2 security module |
| `MockUpgradedSecurityPluginImplementation` | V2 security with new storage fields |
| `MockSecurityRegistry` | Mock for `ISecurityRegistry` |
| `MockPool` | Mock pool for testing |
| `MockFactory` | Mock Algebra factory |

---

## Key Upgrade Flows

### Plugin Upgrade (via Beacon)

```mermaid
flowchart TD
    A[Deploy new implementation] --> B[factory.upgradePlugins newImpl]
    B --> C[Beacon updates implementation]
    C --> D[ALL plugins use new impl]
    D --> E[Storage unchanged<br/>Logic changed]
```

### Factory Upgrade (via ProxyAdmin)

```mermaid
flowchart TD
    A[Deploy new factory impl] --> B[ProxyAdmin.upgrade proxy newImpl]
    B --> C[Factory logic updated]
    C --> D[Beacon remains same]
    D --> E[All storage preserved]
    E --> F[Plugins unaffected]
```

### Module Upgrade (e.g., Security)

```mermaid
flowchart TD
    A[Deploy new module impl V2] --> B[Deploy new plugin with V2 module]
    B --> C[factory.upgradePlugins newPlugin]
    C --> D[All plugins use new module via delegatecall]
    D --> E[Old storage preserved ERC-7201]
    E --> F[New storage fields accessible]
```
