Building an ERC-20 Compliance Token
The ComplianceTokenERC20 is a ready-to-deploy, policy-protected ERC-20 token provided as an ACE reference implementation. It inherits PolicyProtectedUpgradeable, routes every state-changing function through a PolicyEngine, and is designed for deployment behind a proxy.

For a comparison with the ERC-3643 variant and guidance on which to choose, see Building a New Contract.

What makes it ACE-compatible
The token satisfies all the requirements described in Making Your Contract ACE-Compatible:

Inherits PolicyProtectedUpgradeable — The contract calls __PolicyProtected_init during initialization, which sets the contract owner and connects it to a PolicyEngine.
All state-changing functions are policy-protected — Every function that modifies balances, allowances, or frozen state carries the runPolicy or runPolicyWithContext modifier. The PolicyEngine evaluates all attached policies before the function body executes.
ERC-7201 namespaced storage — All token state lives in a dedicated ComplianceTokenStoreERC20 storage struct, following the ERC-7201 pattern for safe upgradeable storage.
Protected functions
Every state-changing function on the token is policy-protected. The runPolicy modifier intercepts each call and routes it through the PolicyEngine, which evaluates all attached policies before the function body executes. Functions that need to pass additional context (such as offchain signatures or metadata) use runPolicyWithContext instead, which forwards a bytes context parameter to every policy in the chain.

ERC-20 standard
Function	
Modifier
Description
transfer(to, amount)	runPolicy	Transfer tokens from the caller to another address.
transferFrom(from, to, amount)	runPolicy	Transfer tokens on behalf of another address using an allowance.
approve(spender, amount)	runPolicy	Set an allowance for a spender.
Minting and burning
Function	Modifier	Description
mint(to, amount)	runPolicy	Create new tokens and assign them to an address.
burn(amount)	runPolicy	Destroy tokens from the caller's balance.
burnFrom(from, amount)	runPolicy	Destroy tokens from another address.
Administrative and compliance
Function	
Modifier
Description
freeze(account, amount, context)	runPolicyWithContext	Freeze a specific amount of tokens on an account. Frozen tokens cannot be transferred or burned.
unfreeze(account, amount, context)	runPolicyWithContext	Unfreeze a previously frozen amount on an account.
forceTransfer(from, to, amount, context)	runPolicyWithContext	Administratively move tokens between accounts, subject to frozen balance checks.
note
Context parameter

Functions that accept a bytes context parameter use runPolicyWithContext, which forwards the context to the PolicyEngine. Policies can use this context for additional validation — for example, verifying an offchain signature or passing metadata about the operation. See The context parameter for details on both methods of passing context.

Managing Policy Engines
A policy engine is the on-chain orchestrator that evaluates policies whenever a protected function is called. Each policy engine is deployed as a smart contract on one or more chains, and all your targets, policies, and protections are scoped to a specific engine. For a deeper explanation of how policy engines fit into the architecture, see Architecture and Policy Management.

note
note

Before creating a policy engine, make sure you have completed Account Setup and have a CRE Connect Wallet deployed on each chain where you want the engine to operate.

Create a policy engine

Platform UI

API



Create a policy engine with a POST request. Each entry in onchain_policy_engines specifies a chain_selector for a target chain (see Supported Networks for available chain selectors):

copy to clipboard
curl -X POST https://ace.api.chain.link/v1/policy-engines \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "name": "Production Policy Engine",
    "description": "Main policy engine for compliance enforcement",
    "onchain_policy_engines": [
      { "chain_selector": "16015286601757825753" },
      { "chain_selector": "3478487238524512106" },
      { "chain_selector": "14767482510784806043" },
      { "chain_selector": "16281711391670634445" },
      { "chain_selector": "10344971235874465080" }
    ]
  }'
Field	Required	Description
name	Yes	Human-readable name
description	No	Description of the engine's purpose
extractor_ids	No	Array of extractor UUIDs to register with the engine
onchain_policy_engines	Yes	Array of objects with chain_selector values for each deployment chain
tip
Attach extractors at creation time

Include the extractor_ids field when creating your engine so extractors are registered immediately. ACE Beta supports ERC-20 and ERC-3643 contracts — attach all extractors for your contract type upfront to avoid additional updates later. See the Policy Manager Quick Start for the full list of extractor IDs.

Each on-chain engine starts in creation_pending status until deployment completes. The response includes the engine id and the on-chain contract addresses.

View policy engines

Platform UI

API





List all policy engines:

copy to clipboard
curl https://ace.api.chain.link/v1/policy-engines \
  -H "Authorization: Apikey <API_KEY>"
Parameter	Description
page	Page number (default: 1)
page_size	Results per page (max: 100)
include_onchains	Include on-chain deployment details (default: true)
To retrieve a specific engine by ID:

copy to clipboard
curl https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Authorization: Apikey <API_KEY>"
Update a policy engine
You can update a policy engine's name, description, and extractor associations.


Platform UI

API


Update a policy engine with a PUT request. Both name and onchain_policy_engines are required:

copy to clipboard
curl -X PUT https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "name": "Production Policy Engine (Updated)",
    "description": "Updated description",
    "extractor_ids": ["<EXTRACTOR_ID>"],
    "onchain_policy_engines": [
      { "chain_selector": "16015286601757825753" },
      { "chain_selector": "3478487238524512106" },
      { "chain_selector": "14767482510784806043" },
      { "chain_selector": "16281711391670634445" },
      { "chain_selector": "10344971235874465080" }
    ]
  }'
Add or remove extractors
Extractors decode transaction calldata into named parameters (sender, recipient, amount, etc.) so policies can evaluate them. If you forgot to attach an extractor during engine creation or need to remove one, use the PUT /policy-engines/{id} endpoint.

caution
Full replacement

The extractor_ids field in a PUT request replaces all current extractors — it is not additive. Always include every extractor you want to keep. Omitting an extractor from the list detaches it from the engine.

Add a missing extractor
First, retrieve your engine to see which extractors are currently attached:

copy to clipboard
curl https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Authorization: Apikey <API_KEY>"
Check the extractor_registrations array in the response. Then send a PUT request that includes the existing extractor IDs plus the new one:

copy to clipboard
curl -X PUT https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "name": "My Policy Engine",
    "extractor_ids": [
      "d4b8cd51-7d5a-487a-9ba5-bb7236e3184c",
      "572201bb-170b-4fda-ab89-a65b5bbc594b",
      "f17bbe8b-8462-4dd7-8fb7-a4973dff04fc"
    ],
    "onchain_policy_engines": [
      { "chain_selector": "16015286601757825753" },
      { "chain_selector": "3478487238524512106" },
      { "chain_selector": "14767482510784806043" },
      { "chain_selector": "16281711391670634445" },
      { "chain_selector": "10344971235874465080" }
    ]
  }'
In this example, f17bbe8b-8462-4dd7-8fb7-a4973dff04fc is the new extractor being added alongside two that were already attached.

Remove an extractor
Send a PUT request with the extractor_ids array that omits the extractor you want to detach:

copy to clipboard
curl -X PUT https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "name": "My Policy Engine",
    "extractor_ids": [
      "d4b8cd51-7d5a-487a-9ba5-bb7236e3184c",
      "572201bb-170b-4fda-ab89-a65b5bbc594b"
    ],
    "onchain_policy_engines": [
      { "chain_selector": "16015286601757825753" },
      { "chain_selector": "3478487238524512106" },
      { "chain_selector": "14767482510784806043" },
      { "chain_selector": "16281711391670634445" },
      { "chain_selector": "10344971235874465080" }
    ]
  }'
tip
Available extractors

See the Policy Manager Quick Start for the full list of pre-deployed extractor IDs for ERC-20 and ERC-3643 contracts, or retrieve them at any time with GET https://ace.api.chain.link/v1/extractors.

Archive a policy engine
Archiving a policy engine deactivates it and prevents any further operations. All policy instances associated with the engine must be archived first.


Platform UI

API


Archive a policy engine with a PATCH request:

copy to clipboard
curl -X PATCH https://ace.api.chain.link/v1/policy-engines/<POLICY_ENGINE_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "status": "archived"
  }'

  Managing Targets
A target is a smart contract protected by ACE. After deploying your ACE-compatible contract, you register it as a target under a PolicyEngine. Once registered, you can configure the default policy result and attach policies to its functions via protections.

note
note

Before registering a target, your contract must be ACE-compatible — it needs to inherit PolicyProtected and use the runPolicy modifier on the functions you want to protect. You also need a deployed PolicyEngine.

Register a target
After deploying your contract, register it as a target with a POST request. Provide the contract name, type, protected methods, and on-chain addresses:

copy to clipboard
curl -X POST https://ace.api.chain.link/v1/targets \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "title": "My ERC-20 Token",
    "description": "Production ERC-20 token with compliance enforcement",
    "policy_engine_id": "<POLICY_ENGINE_ID>",
    "protected_methods": [
      "transfer(address,uint256)",
      "transferFrom(address,address,uint256)"
      #[any other methods you want to protect]
    ],
    "desired_default_allow": true,
    "metadata": {"contract_type": "ERC-20"},
    "onchain_targets": [
      {
        "chain_selector": "16015286601757825753",
        "address": "0xYourContractAddressOnSepolia"
      },
      {
        "chain_selector": "3478487238524512106",
        "address": "0xYourContractAddressOnArbitrumSepolia"
      },
      #[any other chains where your contract is deployed]
    ]
  }'
Field	Required	Description
title	Yes	Human-readable name for the target
description	No	Description of the contract
policy_engine_id	Yes	UUID of the policy engine to associate with
protected_methods	No	Array of function signatures that can be protected
desired_default_allow	No	Whether to allow transactions by default (default: true)
onchain_targets	No	Array of objects with chain_selector and contract address
metadata	No	Arbitrary JSON metadata (e.g., {"contract_type": "ERC-20"})
Default allow behavior
The default policy result controls what happens when a transaction passes through the entire policy chain and no policy explicitly returns Allow or Reject (i.e., every policy returns Continue). This is configured per target contract via the desired_default_allow field:

true (default) — The transaction is allowed. This is appropriate when you want policies to act as blockers (reject specific cases), and everything else passes through.
false — The transaction is rejected. This is appropriate for allowlist-style enforcement where only explicitly approved transactions proceed.
For more on how policy evaluation ordering works, see Policy Ordering & Composition.

Change the default policy result

Platform UI

API


Update an existing target's default with a PUT request. Set desired_default_allow to true (allow by default) or false (reject by default). Because PUT is a full replacement, include all fields you want to keep:

copy to clipboard
curl -X PUT https://ace.api.chain.link/v1/targets/<TARGET_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "title": "My ERC-20 Token",
    "description": "Production ERC-20 token with compliance enforcement",
    "protected_methods": [
      "transfer(address,uint256)",
      "transferFrom(address,address,uint256)"
    ],
    "desired_default_allow": false,
    "metadata": {"contract_type": "ERC-20"}
  }'
The Coordinator calls SetTargetDefaultPolicyAllow on the PolicyEngine contract for each chain where the target is deployed.

View targets

Platform UI

API
List all targets:

copy to clipboard
curl https://ace.api.chain.link/v1/targets \
  -H "Authorization: Apikey <API_KEY>"
Parameter	Description
page	Page number (default: 1)
page_size	Results per page (max: 100)
include_onchains	Include on-chain contract details (default: true)
policy_engine_id	Filter by policy engine
chain_selector	Filter by chain
search	Search by target title or on-chain address
To retrieve a specific target by ID:

copy to clipboard
curl https://ace.api.chain.link/v1/targets/<TARGET_ID> \
  -H "Authorization: Apikey <API_KEY>"
Update a target
You can update a target's name, description, contract type, protected methods, default allow behavior, and on-chain addresses.

caution
PUT is a full replacement

The PUT /targets/{id} endpoint replaces the entire resource — any field you omit is reset to its default (empty string, empty array, or true for desired_default_allow). Always include every field you want to keep, not just the ones you are changing.


Platform UI

API


Update a target with a PUT request. Include all fields you want to preserve:

copy to clipboard
curl -X PUT https://ace.api.chain.link/v1/targets/<TARGET_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "title": "My ERC-20 Token (Updated)",
    "description": "Updated description",
    "protected_methods": [
      "transfer(address,uint256)",
      "transferFrom(address,address,uint256)",
      "mint(address,uint256)"
    ],
    "desired_default_allow": true,
    "metadata": {"contract_type": "ERC-20"}
  }'
Link targets
When you deploy your ACE-compatible contract on a new chain, the control plane detects it automatically and creates a separate detected target (titled "unknown target"). Rather than managing each chain deployment as its own target, you can merge detected targets into an existing target to keep a single multi-chain target with all its on-chain addresses in one place.

Conditions
A detected target can be merged (linked) into an existing target when:

The detected target was auto-discovered — it still has the default "unknown target" title.
The detected target has at least one on-chain address.
A valid destination target exists in the same policy engine: it must be a different target, already named, and deployed on a different chain than the source (no shared chain selectors).
If no valid destination exists, the detected target cannot be merged — you can only rename it via Edit details.

How it works
Merging transfers the on-chain addresses from the source target(s) to the destination target, then archives the sources. After the merge, the destination target contains all chain deployments and any protections remain on the destination.


Platform UI

API
Merge one or more source targets into a destination target with a POST request:

copy to clipboard
curl -X POST "https://ace.api.chain.link/v1/targets/<DESTINATION_TARGET_ID>/merge" \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "source_target_ids": ["<SOURCE_TARGET_ID>"]
  }'
Field
Required	Description
source_target_ids	Yes	Array of UUID(s) — the detected targets whose on-chain addresses will be transferred to the destination
The response returns the updated destination target with all merged on-chain addresses. The source targets are archived automatically.

caution
caution

Merging is irreversible. The source targets are archived and their on-chain addresses become part of the destination target. Make sure you select the correct destination before confirming.

Archive a target
Archiving a target removes it from active use. All target protections associated with the target must be archived first.


Platform UI

API


Archive a target with a PATCH request:

copy to clipboard
curl -X PATCH https://ace.api.chain.link/v1/targets/<TARGET_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "status": "archived"
  }'
caution
caution

All target protections must be archived before the target itself can be archived. See Protecting Target Functions for how to archive protections.


Getting Started
Guides
Policy Manager
Making Your Contract ACE-Compatible
Managing Policy Engines
Managing Targets
Managing Policies
Protecting Target Functions
Managing Data Validators
Custom Policies
Offchain Policies
Identity Manager
Reference
Managing Policies
This guide covers how to browse available policy types, create policy instances, and configure their parameters. For attaching policies to specific functions on your contracts, see Protecting Target Functions.

Policy implementations vs policy instances
ACE distinguishes between two concepts:

Policy implementation — A reusable policy template (smart contract code) that defines specific compliance logic, such as an allowlist check or volume limit. ACE provides a pre-built library of audited implementations, and you can register your own custom policy implementations, which are scoped to your organization.
Policy instance — A deployed copy of a policy implementation, configured with your specific parameters and associated with a policy engine. You create a policy instance from an implementation and then attach it to target functions via protections.
For example, the "Allow List Policy" implementation can be instantiated multiple times with different allowlists.

Browse policy implementations

Platform UI

API




List all policy implementations:

copy to clipboard
curl https://ace.api.chain.link/v1/policy-implementations \
  -H "Authorization: Apikey <API_KEY>"
Parameter	Description
page	Page number (default: 1)
page_size	Results per page (max: 100)
include_onchains	Include on-chain contract details (default: true)
To retrieve a specific implementation by ID:

copy to clipboard
curl https://ace.api.chain.link/v1/policy-implementations/<IMPLEMENTATION_ID> \
  -H "Authorization: Apikey <API_KEY>"
Create a policy instance
A policy instance is created from a policy implementation and deployed on-chain within a policy engine.


Platform UI

API
Select a policy implementation below to see its configuration fields and get a ready-to-use curl command. Each implementation has a policy_config_schema that describes its configurable fields — the tool below extracts the key information you need.

Select a policy implementation

Choose a policy...
Field	Required	Description
name	Yes	Human-readable name for the policy instance
description	No	Description of the instance's purpose
policy_implementation_id	Yes	UUID of the policy implementation to instantiate
policy_engine_id	Yes	UUID of the policy engine to associate with
onchain_policies	No	Array of per-chain deployments with chain_selector and initial_config
Each on-chain policy starts in creation_pending status until deployment completes.

tip
Fields not required at creation

Fields marked "No" in the Required at creation column can be configured after the policy instance is deployed using PATCH /policies/<ID>/configs. See Update policy configuration below.

View and filter policies

Platform UI

API
List all policy instances:

copy to clipboard
curl https://ace.api.chain.link/v1/policies \
  -H "Authorization: Apikey <API_KEY>"
Parameter	Description
page	Page number (default: 1)
page_size	Results per page (max: 100)
include_onchains	Include on-chain deployment details (default: true)
target_id	Filter by target
policy_engine_id	Filter by policy engine
name	Filter by name
status	Filter by on-chain status (creation_pending, creation_failed, created)
only_with_active_protections	Return only policies attached to at least one target function
target_address	Filter by target contract address
To retrieve a specific policy by ID:

copy to clipboard
curl https://ace.api.chain.link/v1/policies/<POLICY_ID> \
  -H "Authorization: Apikey <API_KEY>"
Update policy configuration
After deploying a policy instance, you can update its on-chain configuration parameters — for example, adding an address to an allowlist or changing a volume threshold — without redeploying the policy.


Platform UI

API
Update policy configurations with a PATCH request using JSON patch operations:

copy to clipboard
curl -X PATCH https://ace.api.chain.link/v1/policies/<POLICY_ID>/configs \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "patches": [
      {
        "op": "add",
        "path": "/allowList/-",
        "value": "0x3333333333333333333333333333333333333333"
      }
    ]
  }'
The JSON patch format follows RFC 6902. Common operations:

Operation	Description	Example
add	Add a value	Add an address to an allowlist
remove	Remove a value	Remove an address from a list
replace	Replace a value	Change a threshold

Managing Data Validators
A Data Validator is an on-chain contract that inspects the contents of a credential — not just whether it exists. Attaching a Data Validator to an identity-validation policy lets you enforce rules on credential data, such as "only allow investors whose credential says they are in the US or Canada" or "reject any account whose credential country is on a sanctions list".

This guide covers creating, configuring, and attaching Data Validators. For the credential side of the workflow — linking a data schema to a credential type and issuing credentials with data — see Managing Credential Types and Managing Credentials.

note
Two halves of one feature

Credential data has a producer and a consumer. The credential issuer produces the data (Identity Manager: attach a data schema to a credential type, issue credentials with values). The application consumes it (Policy Manager: attach a Data Validator to a policy's credential source). This page covers the consumer side.

How Data Validators fit in
Identity-validation policies — the CredentialRegistryIdentityValidatorPolicy and the GroupedIdentityValidatorPolicy — resolve a caller's address to a CCID and check credentials from credential sources. Each credential source can optionally reference a Data Validator.

When a credential source has a Data Validator configured, the policy performs an extra step at transaction time:

Resolve the account's CCID and confirm the credential exists (attestation check).
Fetch the credential's stored credentialData.
Call the Data Validator's validateCredentialData(...), which returns true or false.
The credential passes only if both the attestation check and the data check succeed. Without a Data Validator, the source is attestation-only — it confirms the credential exists but ignores its contents.

note
Data Validator vs. data routing

A Data Validator checks whether a credential's contents are acceptable for a requirement. This is different from the GroupedIdentityValidatorPolicy's data routing, which uses credential contents to decide which group an account belongs to. Both read credentialData, but they serve different purposes and can be combined.

The AllowDenyList Data Validator
ACE provides a pre-built, audited Data Validator implementation: the AllowDenyList Data Validator. It validates a credential payload against an allowlist and a denylist, with an optional restriction by credential type. Its rules are:

If the denylist contains any value present in the credential, validation fails.
If the allowlist is non-empty, at least one value in the credential must be allowlisted; otherwise validation fails.
If the allowlist is empty, the allow check passes (deny-only mode).
The first use case shipped on top of this implementation is jurisdiction control using ISO 3166-1 alpha-2 country codes (e.g., US, CA, GB). The country codes are the values checked against the allow and deny lists.

tip
Generic building block

The AllowDenyList Data Validator works with any bytes32 values, not only country codes. The jurisdiction use case is a convention layered on top: country codes are encoded as bytes32 and matched against the lists.

Prerequisites
Before creating a Data Validator:

A policy engine deployed on your target chains.
A credential type linked to a data schema so its credentials carry data — for the jurisdiction use case, the ISO 3166-1 alpha-2 country code schema. See Managing Credential Types.
Credentials issued with data against that credential type. See Managing Credentials.
Create a Data Validator
A Data Validator instance is a deployed copy of a Data Validator implementation (such as the AllowDenyList country-code validator), configured with your specific allow and deny lists and scoped to one or more chains — the same shape as a policy instance.

The AllowDenyList (country codes) Data Validator implementation ID is:

copy to clipboard
2aed366a-38af-4f48-b8e2-8fd1489db9fa
Create a Data Validator instance with a POST request. Provide the implementation ID and, for each chain, the initial_config with your allow and deny lists:

copy to clipboard
curl -X POST https://ace.api.chain.link/v1/data-validators \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "name": "Jurisdiction allow/deny",
    "description": "Allow US and CA, deny KP",
    "data_validator_implementation_id": "2aed366a-38af-4f48-b8e2-8fd1489db9fa",
    "onchain_data_validators": [
      {
        "chain_selector": "16015286601757825753",
        "initial_config": {
          "allowlist": [{ "item": "US" }, { "item": "CA" }],
          "denylist": [{ "item": "KP" }],
          "supportedDataTypes": []
        }
      }
    ]
  }'
Field	Required	Description
name	Yes	Human-readable name for the instance
description	No	Description of the instance's purpose
data_validator_implementation_id	Yes	UUID of the Data Validator implementation to instantiate
onchain_data_validators	Yes	Array of per-chain deployments with chain_selector and initial_config
Each on-chain Data Validator starts in creation_pending status until deployment completes. The response includes the instance id and the on-chain addresses per chain.

note
Config fields

allowlist and denylist are country codes. supportedDataTypes optionally restricts the validator to specific credential type hashes — when non-empty, the validator returns false for any other credential type. Leave it empty to accept any credential type routed to it.

Update a Data Validator configuration
You can update the allow and deny lists after deployment without redeploying the validator. Configuration changes use JSON Patch and are version-checked per chain for optimistic concurrency.

Update the configuration with a PATCH request. Supply on_chains with the current_config_version for each chain you are changing:

copy to clipboard
curl -X PATCH https://ace.api.chain.link/v1/data-validators/<DATA_VALIDATOR_ID>/configs \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "patches": [
      { "op": "add", "path": "/allowlist/-", "value": "GB" }
    ],
    "on_chains": [
      { "chain_selector": "16015286601757825753", "current_config_version": "0" }
    ]
  }'
The JSON Patch format follows RFC 6902. If the current_config_version does not match the on-chain state, the request is rejected — re-fetch the instance and retry with the current version.

Attach a Data Validator to a credential source
A Data Validator takes effect only when it is referenced by a credential source on an identity-validation policy. Each credential source has a dataValidator field:

0x0000000000000000000000000000000000000000 — attestation-only (default). The source checks only that the credential exists.
A Data Validator address — the source additionally validates credential contents through that validator.
Set the dataValidator field to your deployed Data Validator address when configuring the credential source on your CredentialRegistryIdentityValidatorPolicy or GroupedIdentityValidatorPolicy instance. See Managing Policies — Update policy configuration for how to change a policy instance's configuration.

caution
Match the validator to the credential's chain

Credential sources are configured per network with on-chain addresses. Use the Data Validator address deployed on the same chain as the credential source's identity and credential registries.

View Data Validators
List all Data Validators:

copy to clipboard
curl https://ace.api.chain.link/v1/data-validators \
  -H "Authorization: Apikey <API_KEY>"
Parameter	Description
page	Page number (default: 1)
page_size	Results per page
include_onchains	Include per-chain deployment details
data_validator_implementation_id	Filter by implementation
chain_selector	Filter by chain
address	Filter by on-chain address
status	Filter by on-chain status
To retrieve a specific Data Validator by ID:

copy to clipboard
curl https://ace.api.chain.link/v1/data-validators/<DATA_VALIDATOR_ID> \
  -H "Authorization: Apikey <API_KEY>"
Archive a Data Validator
Archiving a Data Validator deactivates the instance. Before archiving, detach it from any credential source that references it (set that source's dataValidator back to the zero address).

Archive a Data Validator with a PATCH request:

copy to clipboard
curl -X PATCH https://ace.api.chain.link/v1/data-validators/<DATA_VALIDATOR_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Apikey <API_KEY>" \
  -d '{
    "status": "archived"
  }'
